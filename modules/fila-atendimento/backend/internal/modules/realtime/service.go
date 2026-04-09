package realtime

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"

	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/operations"
	"github.com/mikewade2k16/lista-da-vez/back/internal/platform/httpapi"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 1024
)

type Service struct {
	contextResolver RealtimeContextResolver
	allowedOrigins  []string
	hub             *Hub
	upgrader        websocket.Upgrader
}

func NewService(contextResolver RealtimeContextResolver, allowedOrigins []string, hub *Hub) *Service {
	if hub == nil {
		hub = NewHub()
	}

	service := &Service{
		contextResolver: contextResolver,
		allowedOrigins:  append([]string{}, allowedOrigins...),
		hub:             hub,
	}

	service.upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			origin := strings.TrimSpace(r.Header.Get("Origin"))
			if origin == "" {
				return true
			}

			return httpapi.OriginAllowed(origin, service.allowedOrigins)
		},
	}

	return service
}

func (service *Service) PublishOperationEvent(ctx context.Context, event operations.PublishedEvent) {
	normalizedStoreID := strings.TrimSpace(event.StoreID)
	if normalizedStoreID == "" {
		return
	}

	service.hub.Publish(operationTopic(normalizedStoreID), Event{
		Type:     EventTypeOperationUpdated,
		StoreID:  normalizedStoreID,
		Action:   strings.TrimSpace(event.Action),
		PersonID: strings.TrimSpace(event.PersonID),
		SavedAt:  event.SavedAt.UTC(),
	})
}

func (service *Service) PublishContextEvent(_ context.Context, tenantID string, resource string, action string, resourceID string, savedAt time.Time) {
	normalizedTenantID := strings.TrimSpace(tenantID)
	if normalizedTenantID == "" {
		return
	}

	service.hub.Publish(contextTopic(normalizedTenantID), Event{
		Type:       EventTypeContextUpdated,
		TenantID:   normalizedTenantID,
		Resource:   strings.TrimSpace(resource),
		Action:     strings.TrimSpace(action),
		ResourceID: strings.TrimSpace(resourceID),
		SavedAt:    savedAt.UTC(),
	})
}

func (service *Service) HandleOperationSocket(w http.ResponseWriter, r *http.Request) {
	realtimeContext, err := service.resolveRealtimeContext(r)
	if err != nil {
		writeAccessError(w, r, err)
		return
	}

	scope, err := resolveOperationSubscription(strings.TrimSpace(r.URL.Query().Get("storeId")))
	if err != nil {
		writeSubscriptionError(w, r, err)
		return
	}

	if err := service.authorizeSubscription(r.Context(), realtimeContext.Access, scope); err != nil {
		writeSubscriptionError(w, r, err)
		return
	}

	connection, err := service.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer connection.Close()

	connection.SetReadLimit(maxMessageSize)
	connection.SetReadDeadline(time.Now().Add(pongWait))
	connection.SetPongHandler(func(string) error {
		connection.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	subscription := service.hub.Subscribe(operationTopic(scope.StoreID), 1)
	defer subscription.Close()

	done := make(chan struct{})
	go service.readPump(connection, done)

	if err := service.writeEvent(connection, Event{
		Type:    EventTypeConnected,
		StoreID: scope.StoreID,
		SavedAt: time.Now().UTC(),
	}); err != nil {
		return
	}

	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()

	for {
		select {
		case <-done:
			return
		case <-r.Context().Done():
			return
		case <-ticker.C:
			connection.SetWriteDeadline(time.Now().Add(writeWait))
			if err := connection.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		case event, ok := <-subscription.Events():
			if !ok {
				return
			}

			if err := service.writeEvent(connection, event); err != nil {
				return
			}
		}
	}
}

func (service *Service) HandleContextSocket(w http.ResponseWriter, r *http.Request) {
	realtimeContext, err := service.resolveRealtimeContext(r)
	if err != nil {
		writeAccessError(w, r, err)
		return
	}

	scope, err := resolveContextSubscription(realtimeContext, strings.TrimSpace(r.URL.Query().Get("tenantId")))
	if err != nil {
		writeSubscriptionError(w, r, err)
		return
	}

	if err := service.authorizeSubscription(r.Context(), realtimeContext.Access, scope); err != nil {
		writeSubscriptionError(w, r, err)
		return
	}

	connection, err := service.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer connection.Close()

	connection.SetReadLimit(maxMessageSize)
	connection.SetReadDeadline(time.Now().Add(pongWait))
	connection.SetPongHandler(func(string) error {
		connection.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	subscription := service.hub.Subscribe(contextTopic(scope.TenantID), 1)
	defer subscription.Close()

	done := make(chan struct{})
	go service.readPump(connection, done)

	if err := service.writeEvent(connection, Event{
		Type:     EventTypeConnected,
		TenantID: scope.TenantID,
		SavedAt:  time.Now().UTC(),
	}); err != nil {
		return
	}

	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()

	for {
		select {
		case <-done:
			return
		case <-r.Context().Done():
			return
		case <-ticker.C:
			connection.SetWriteDeadline(time.Now().Add(writeWait))
			if err := connection.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		case event, ok := <-subscription.Events():
			if !ok {
				return
			}

			if err := service.writeEvent(connection, event); err != nil {
				return
			}
		}
	}
}

func (service *Service) resolveRealtimeContext(r *http.Request) (RealtimeContext, error) {
	if service.contextResolver == nil {
		return RealtimeContext{}, ErrUnauthorized
	}

	token, err := accessTokenFromRequest(r)
	if err != nil {
		return RealtimeContext{}, err
	}

	realtimeContext, err := service.contextResolver.ResolveRealtimeContext(r.Context(), token)
	if err != nil {
		return RealtimeContext{}, err
	}

	return realtimeContext, nil
}

func (service *Service) authorizeSubscription(ctx context.Context, access AccessContext, scope RealtimeSubscriptionScope) error {
	allowed, err := service.contextResolver.CanSubscribe(ctx, access, scope)
	if err != nil {
		return err
	}

	if !allowed {
		return ErrForbidden
	}

	return nil
}

func (service *Service) readPump(connection *websocket.Conn, done chan<- struct{}) {
	defer close(done)

	for {
		if _, _, err := connection.ReadMessage(); err != nil {
			return
		}
	}
}

func (service *Service) writeEvent(connection *websocket.Conn, event Event) error {
	connection.SetWriteDeadline(time.Now().Add(writeWait))
	return connection.WriteJSON(event)
}

func accessTokenFromRequest(r *http.Request) (string, error) {
	token := strings.TrimSpace(r.URL.Query().Get("access_token"))
	if token != "" {
		return token, nil
	}

	return extractBearerToken(strings.TrimSpace(r.Header.Get("Authorization")))
}

func extractBearerToken(header string) (string, error) {
	rawHeader := strings.TrimSpace(header)
	if rawHeader == "" {
		return "", ErrUnauthorized
	}

	parts := strings.SplitN(rawHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return "", ErrUnauthorized
	}

	token := strings.TrimSpace(parts[1])
	if token == "" {
		return "", ErrUnauthorized
	}

	return token, nil
}

func resolveOperationSubscription(storeID string) (RealtimeSubscriptionScope, error) {
	normalizedStoreID := strings.TrimSpace(storeID)
	if normalizedStoreID == "" {
		return RealtimeSubscriptionScope{}, ErrStoreRequired
	}

	return RealtimeSubscriptionScope{
		Channel: RealtimeChannelOperations,
		StoreID: normalizedStoreID,
	}, nil
}

func resolveContextSubscription(realtimeContext RealtimeContext, requestedTenantID string) (RealtimeSubscriptionScope, error) {
	normalizedTenantID := strings.TrimSpace(requestedTenantID)
	if normalizedTenantID == "" {
		normalizedTenantID = defaultContextTenantID(realtimeContext)
	}

	if normalizedTenantID == "" {
		return RealtimeSubscriptionScope{}, ErrForbidden
	}

	return RealtimeSubscriptionScope{
		Channel:  RealtimeChannelContext,
		TenantID: normalizedTenantID,
	}, nil
}

func defaultContextTenantID(realtimeContext RealtimeContext) string {
	if normalizedTenantID := strings.TrimSpace(realtimeContext.Access.TenantID); normalizedTenantID != "" {
		return normalizedTenantID
	}

	uniqueTenantIDs := map[string]struct{}{}
	for _, scope := range realtimeContext.Scopes {
		if strings.TrimSpace(scope.Channel) != RealtimeChannelContext {
			continue
		}

		normalizedTenantID := strings.TrimSpace(scope.TenantID)
		if normalizedTenantID == "" {
			continue
		}

		uniqueTenantIDs[normalizedTenantID] = struct{}{}
	}

	if len(uniqueTenantIDs) != 1 {
		return ""
	}

	for tenantID := range uniqueTenantIDs {
		return tenantID
	}

	return ""
}

func writeAccessError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, ErrUnauthorized):
		httpapi.WriteError(w, r, http.StatusUnauthorized, "unauthorized", "Autenticacao obrigatoria.")
	case errors.Is(err, ErrForbidden):
		httpapi.WriteError(w, r, http.StatusForbidden, "forbidden", "Sem permissao para acessar este recurso.")
	default:
		httpapi.WriteError(w, r, http.StatusInternalServerError, "internal_error", "Erro ao validar a sessao realtime.")
	}
}

func writeSubscriptionError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, ErrUnauthorized):
		httpapi.WriteError(w, r, http.StatusUnauthorized, "unauthorized", "Autenticacao obrigatoria.")
	case errors.Is(err, ErrForbidden):
		httpapi.WriteError(w, r, http.StatusForbidden, "forbidden", "Sem permissao para acessar este recurso.")
	case errors.Is(err, ErrStoreRequired), errors.Is(err, ErrTenantRequired), errors.Is(err, ErrValidation):
		httpapi.WriteError(w, r, http.StatusBadRequest, "validation_error", "Escopo realtime invalido.")
	case errors.Is(err, ErrStoreNotFound):
		httpapi.WriteError(w, r, http.StatusNotFound, "store_not_found", "Loja nao encontrada.")
	default:
		httpapi.WriteError(w, r, http.StatusInternalServerError, "internal_error", "Erro ao validar o escopo realtime.")
	}
}
