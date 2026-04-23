package observability

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/mikewade2k16/lista-da-vez/back/internal/platform/httpapi"
	modulecontracts "github.com/mikewade2k16/lista-da-vez/back/moduleapi/contracts"
)

type RouteGuard func(http.Handler) http.Handler

type HTTPRouteOptions struct {
	RequireAuth    RouteGuard
	AccessResolver modulecontracts.AccessContextResolver
}

func RegisterRoutesWithOptions(mux *http.ServeMux, service *Service, options HTTPRouteOptions) {
	requireAuth := options.RequireAuth
	if requireAuth == nil {
		requireAuth = func(next http.Handler) http.Handler {
			return next
		}
	}

	resolveAccess := func(r *http.Request) (AccessContext, error) {
		if options.AccessResolver == nil {
			return AccessContext{}, ErrUnauthorized
		}
		return options.AccessResolver.ResolveAccessContext(r.Context())
	}

	registerRoute := func(pattern string, handler func(http.ResponseWriter, *http.Request, AccessContext)) {
		mux.Handle(pattern, requireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			access, err := resolveAccess(r)
			if err != nil {
				writeAccessError(w, r, err)
				return
			}
			handler(w, r, access)
		})))
	}

	registerRoute("POST /v1/observability/page-metrics", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		var input MetricEventInput
		if err := httpapi.ReadJSON(r, &input); err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "invalid_json", "Payload inválido.")
			return
		}

		event, err := service.Record(r.Context(), access, input)
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusCreated, CreateResponse{
			OK:      true,
			EventID: event.ID,
			Event:   event,
		})
	})

	registerRoute("GET /v1/observability/page-metrics", func(w http.ResponseWriter, r *http.Request, access AccessContext) {
		response, err := service.List(r.Context(), access, parseFilters(r))
		if err != nil {
			writeServiceError(w, r, err)
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, response)
	})
}

func parseFilters(r *http.Request) ListFilters {
	query := r.URL.Query()
	limit, _ := strconv.Atoi(strings.TrimSpace(query.Get("limit")))
	return ListFilters{
		PageKey:   strings.TrimSpace(query.Get("pageKey")),
		PagePath:  strings.TrimSpace(query.Get("pagePath")),
		EventType: strings.TrimSpace(query.Get("eventType")),
		EventKey:  strings.TrimSpace(query.Get("eventKey")),
		Status:    strings.TrimSpace(query.Get("status")),
		StoreID:   strings.TrimSpace(query.Get("storeId")),
		Limit:     limit,
	}
}

func writeAccessError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, ErrUnauthorized):
		httpapi.WriteError(w, r, http.StatusUnauthorized, "unauthorized", "Autenticação obrigatória.")
	case errors.Is(err, ErrForbidden):
		httpapi.WriteError(w, r, http.StatusForbidden, "forbidden", "Sem permissão para acessar este recurso.")
	default:
		httpapi.WriteError(w, r, http.StatusInternalServerError, "internal_error", "Erro ao resolver o contexto de métricas.")
	}
}

func writeServiceError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, ErrUnauthorized):
		httpapi.WriteError(w, r, http.StatusUnauthorized, "unauthorized", "Autenticação obrigatória.")
	case errors.Is(err, ErrForbidden):
		httpapi.WriteError(w, r, http.StatusForbidden, "forbidden", "Sem permissão para acessar métricas.")
	case errors.Is(err, ErrValidation):
		httpapi.WriteError(w, r, http.StatusBadRequest, "validation_error", "Verifique os dados da métrica.")
	default:
		httpapi.WriteError(w, r, http.StatusInternalServerError, "internal_error", "Erro ao processar métricas.")
	}
}
