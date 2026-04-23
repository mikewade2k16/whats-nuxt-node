package handlers

import (
	"errors"
	"log"
	"net/http"
	"strings"

	domainauth "plataforma-api/internal/domain/auth"
	authmw "plataforma-api/internal/httpapi/middleware"

	"github.com/go-chi/chi/v5"
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
	Remember bool   `json:"rememberLogin,omitempty"`
}

type passwordResetRequestRequest struct {
	Email string `json:"email"`
}

type passwordResetConfirmRequest struct {
	Email       string `json:"email"`
	Code        string `json:"code"`
	NewPassword string `json:"newPassword"`
}

type updateSessionConfigRequest struct {
	TTLMinutes int `json:"ttlMinutes"`
}

type revokeUserSessionsRequest struct {
	UserID string `json:"userId"`
}

func resolveLoginErrorResponse(err error) (status int, code, message string, ok bool) {
	switch {
	case errors.Is(err, domainauth.ErrUserInactive):
		return http.StatusUnauthorized, "user_inactive", "Seu usuario esta inativo. Entre em contato com um administrador para liberar o acesso.", true
	case errors.Is(err, domainauth.ErrUserBlocked):
		return http.StatusUnauthorized, "user_blocked", "Seu acesso esta bloqueado. Entre em contato com um administrador.", true
	case errors.Is(err, domainauth.ErrUserPendingInvite):
		return http.StatusUnauthorized, "user_pending_invite", "Seu cadastro ainda esta pendente de ativacao. Entre em contato com um administrador.", true
	case errors.Is(err, domainauth.ErrTenantMembership):
		return http.StatusUnauthorized, "tenant_membership_required", "Seu usuario ainda nao esta vinculado a um cliente ativo. Entre em contato com um administrador.", true
	case errors.Is(err, domainauth.ErrUnauthorized):
		return http.StatusUnauthorized, "unauthorized", "Email ou senha invalidos.", true
	default:
		return 0, "", "", false
	}
}

func resolvePasswordResetErrorResponse(err error) (status int, code, message string, ok bool) {
	switch {
	case errors.Is(err, domainauth.ErrPasswordResetUnavailable):
		return http.StatusServiceUnavailable, "password_reset_unavailable", "A recuperacao de senha nao esta disponivel agora. Tente novamente em instantes.", true
	case errors.Is(err, domainauth.ErrPasswordResetCodeExpired):
		return http.StatusBadRequest, "password_reset_code_expired", "O codigo expirou. Solicite um novo codigo e tente novamente.", true
	case errors.Is(err, domainauth.ErrPasswordResetCodeInvalid):
		return http.StatusBadRequest, "password_reset_code_invalid", "Codigo invalido. Confira o email recebido e tente novamente.", true
	default:
		return 0, "", "", false
	}
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var request loginRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if !required(request.Email) || !required(request.Password) {
		writeError(w, http.StatusBadRequest, "bad_request", "Email e senha sao obrigatorios.")
		return
	}

	output, err := h.service.Login(r.Context(), domainauth.LoginInput{
		Email:     request.Email,
		Password:  request.Password,
		TenantID:  request.TenantID,
		Remember:  request.Remember,
		RemoteIP:  r.RemoteAddr,
		UserAgent: r.UserAgent(),
	})
	if err != nil {
		if status, code, message, ok := resolveLoginErrorResponse(err); ok {
			writeError(w, status, code, message)
			return
		}
		log.Printf("auth login failed: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Falha ao autenticar usuario.")
		return
	}

	writeJSON(w, http.StatusOK, output)
}

func (h *AuthHandler) RequestPasswordReset(w http.ResponseWriter, r *http.Request) {
	var request passwordResetRequestRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if !required(request.Email) {
		writeError(w, http.StatusBadRequest, "bad_request", "Email e obrigatorio.")
		return
	}

	err := h.service.RequestPasswordReset(r.Context(), domainauth.PasswordResetRequestInput{
		Email:     request.Email,
		RemoteIP:  r.RemoteAddr,
		UserAgent: r.UserAgent(),
	})
	if err != nil {
		if errors.Is(err, domainauth.ErrPasswordResetUnavailable) {
			log.Printf("password reset unavailable: %v", err)
		}

		if status, code, message, ok := resolvePasswordResetErrorResponse(err); ok {
			writeError(w, status, code, message)
			return
		}

		log.Printf("password reset request failed: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Falha ao iniciar a recuperacao de senha.")
		return
	}

	writeJSON(w, http.StatusOK, domainauth.PasswordResetRequestOutput{
		OK:      true,
		Message: "Se existir uma conta com esse email, enviaremos um codigo para redefinir a senha.",
	})
}

func (h *AuthHandler) ConfirmPasswordReset(w http.ResponseWriter, r *http.Request) {
	var request passwordResetConfirmRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if !required(request.Email) || !required(request.Code) || !required(request.NewPassword) {
		writeError(w, http.StatusBadRequest, "bad_request", "Email, codigo e nova senha sao obrigatorios.")
		return
	}
	if len(strings.TrimSpace(request.NewPassword)) < 6 {
		writeError(w, http.StatusBadRequest, "bad_request", "A nova senha precisa ter no minimo 6 caracteres.")
		return
	}

	err := h.service.ConfirmPasswordReset(r.Context(), domainauth.PasswordResetConfirmInput{
		Email:       request.Email,
		Code:        request.Code,
		NewPassword: request.NewPassword,
		RemoteIP:    r.RemoteAddr,
		UserAgent:   r.UserAgent(),
	})
	if err != nil {
		if status, code, message, ok := resolvePasswordResetErrorResponse(err); ok {
			writeError(w, status, code, message)
			return
		}

		log.Printf("password reset confirm failed: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Falha ao redefinir a senha.")
		return
	}

	writeJSON(w, http.StatusOK, domainauth.PasswordResetConfirmOutput{
		OK:      true,
		Message: "Senha redefinida com sucesso. Entre com a nova senha.",
	})
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

func (h *AuthHandler) GetAdminSessionConfig(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}
	if !claims.IsPlatformAdmin {
		writeError(w, http.StatusForbidden, "forbidden", "only platform admin can manage session config")
		return
	}

	config, err := h.service.GetSessionConfig(r.Context())
	if err != nil {
		log.Printf("auth config load failed: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load session config")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"config": config})
}

func (h *AuthHandler) UpdateAdminSessionConfig(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}
	if !claims.IsPlatformAdmin {
		writeError(w, http.StatusForbidden, "forbidden", "only platform admin can manage session config")
		return
	}

	var request updateSessionConfigRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	config, err := h.service.UpdateSessionConfig(r.Context(), domainauth.UpdateSessionConfigInput{
		TTLMinutes:      request.TTLMinutes,
		UpdatedByUserID: claims.Subject,
	})
	if err != nil {
		if errors.Is(err, domainauth.ErrInvalidSessionTTL) {
			writeError(w, http.StatusBadRequest, "bad_request", "ttlMinutes must stay between 30 and 10080")
			return
		}

		log.Printf("auth config update failed: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to update session config")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"config": config})
}

func (h *AuthHandler) ListAdminSessions(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	sessions, err := h.service.ListActiveSessions(r.Context(), claims)
	if err != nil {
		if errors.Is(err, domainauth.ErrForbidden) {
			writeError(w, http.StatusForbidden, "forbidden", "only platform admin or tenant admin can manage active sessions")
			return
		}

		log.Printf("auth sessions list failed: %v", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load active sessions")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"sessions": sessions})
}

func (h *AuthHandler) RevokeAdminSession(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	sessionID := strings.TrimSpace(chi.URLParam(r, "sessionId"))
	if !required(sessionID) {
		writeError(w, http.StatusBadRequest, "bad_request", "sessionId is required")
		return
	}

	result, err := h.service.RevokeSession(r.Context(), claims, sessionID)
	if err != nil {
		switch {
		case errors.Is(err, domainauth.ErrForbidden):
			writeError(w, http.StatusForbidden, "forbidden", "only platform admin or tenant admin can revoke sessions")
			return
		case errors.Is(err, domainauth.ErrSessionNotFound):
			writeError(w, http.StatusNotFound, "not_found", "active session not found")
			return
		default:
			log.Printf("auth session revoke failed: %v", err)
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to revoke session")
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"result": result})
}

func (h *AuthHandler) RevokeAdminUserSessions(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing auth context")
		return
	}

	var request revokeUserSessionsRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if !required(request.UserID) {
		writeError(w, http.StatusBadRequest, "bad_request", "userId is required")
		return
	}

	result, err := h.service.RevokeUserSessions(r.Context(), claims, request.UserID)
	if err != nil {
		switch {
		case errors.Is(err, domainauth.ErrForbidden):
			writeError(w, http.StatusForbidden, "forbidden", "only platform admin or tenant admin can revoke user sessions")
			return
		case errors.Is(err, domainauth.ErrSessionNotFound):
			writeError(w, http.StatusNotFound, "not_found", "no active sessions found for this user")
			return
		default:
			log.Printf("auth user sessions revoke failed: %v", err)
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to revoke user sessions")
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"result": result})
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
