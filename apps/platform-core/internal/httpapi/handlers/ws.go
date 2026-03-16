package handlers

import (
	"net/http"
	"strings"

	domainauth "platform-core/internal/domain/auth"
	"platform-core/internal/realtime"
)

type WSHandler struct {
	authService *domainauth.Service
	hub         *realtime.Hub
}

func NewWSHandler(authService *domainauth.Service, hub *realtime.Hub) *WSHandler {
	return &WSHandler{authService: authService, hub: hub}
}

func (h *WSHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if h.hub == nil {
		writeError(w, http.StatusServiceUnavailable, "ws_unavailable", "websocket hub not initialized")
		return
	}

	rawToken := strings.TrimSpace(r.URL.Query().Get("token"))
	if rawToken == "" {
		rawToken = bearerToken(r.Header.Get("Authorization"))
	}
	if rawToken == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing token")
		return
	}

	claims, err := h.authService.ParseToken(rawToken)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "invalid token")
		return
	}
	if err := h.authService.ValidateSession(r.Context(), claims); err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "session is not active")
		return
	}

	err = h.hub.ServeWS(w, r, realtime.Session{
		UserID:          claims.Subject,
		TenantID:        claims.TenantID,
		SessionID:       claims.SessionID,
		IsPlatformAdmin: claims.IsPlatformAdmin,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, "ws_upgrade_failed", "failed to upgrade websocket connection")
	}
}

func bearerToken(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	const prefix = "Bearer "
	if !strings.HasPrefix(value, prefix) {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(value, prefix))
}
