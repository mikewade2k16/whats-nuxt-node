package handlers

import (
	"errors"
	"log"
	"net/http"

	domainauth "platform-core/internal/domain/auth"
	authmw "platform-core/internal/httpapi/middleware"
)

type AuthHandler struct {
	service *domainauth.Service
}

func NewAuthHandler(service *domainauth.Service) *AuthHandler {
	return &AuthHandler{service: service}
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	TenantID string `json:"tenantId,omitempty"`
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var request loginRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if !required(request.Email) || !required(request.Password) {
		writeError(w, http.StatusBadRequest, "bad_request", "email and password are required")
		return
	}

	output, err := h.service.Login(r.Context(), domainauth.LoginInput{
		Email:     request.Email,
		Password:  request.Password,
		TenantID:  request.TenantID,
		RemoteIP:  r.RemoteAddr,
		UserAgent: r.UserAgent(),
	})
	if err != nil {
		if errors.Is(err, domainauth.ErrUnauthorized) {
			writeError(w, http.StatusUnauthorized, "unauthorized", "invalid credentials")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to authenticate")
		return
	}

	writeJSON(w, http.StatusOK, output)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	if err := h.service.Logout(r.Context(), claims); err != nil {
		if errors.Is(err, domainauth.ErrUnauthorized) {
			writeError(w, http.StatusUnauthorized, "unauthorized", "session not active")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to logout")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	output, err := h.service.Me(r.Context(), claims)
	if err != nil {
		if errors.Is(err, domainauth.ErrUnauthorized) {
			writeError(w, http.StatusUnauthorized, "unauthorized", "invalid session")
			return
		}
		log.Printf("auth me failed: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load profile")
		return
	}

	writeJSON(w, http.StatusOK, output)
}
