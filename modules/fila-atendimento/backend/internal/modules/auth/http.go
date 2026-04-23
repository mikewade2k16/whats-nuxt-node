package auth

import (
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/mikewade2k16/lista-da-vez/back/internal/platform/httpapi"
)

type loginResponse struct {
	User    UserView        `json:"user"`
	Session loginSessionDTO `json:"session"`
}

type loginSessionDTO struct {
	AccessToken     string    `json:"accessToken"`
	TokenType       string    `json:"tokenType"`
	ExpiresAt       time.Time `json:"expiresAt"`
	ExpiresInSecond int64     `json:"expiresInSeconds"`
}

type shellExchangeRequest struct {
	BridgeToken string `json:"bridgeToken"`
}

type roleCatalogResponse struct {
	TenantModel string           `json:"tenantModel"`
	Roles       []RoleDefinition `json:"roles"`
}

type meResponse struct {
	User      UserView     `json:"user"`
	Principal principalDTO `json:"principal"`
}

type principalDTO struct {
	UserID    string    `json:"userId"`
	Role      Role      `json:"role"`
	TenantID  string    `json:"tenantId,omitempty"`
	StoreIDs  []string  `json:"storeIds,omitempty"`
	ExpiresAt time.Time `json:"expiresAt"`
}

func RegisterRoutes(mux *http.ServeMux, service *Service, middleware *Middleware, shellBridge *ShellBridgeExchangeService) {
	mux.HandleFunc("GET /v1/auth/roles", func(w http.ResponseWriter, r *http.Request) {
		httpapi.WriteJSON(w, http.StatusOK, roleCatalogResponse{
			TenantModel: "tenant-owner-is-client",
			Roles:       RoleCatalog(),
		})
	})

	mux.HandleFunc("POST /v1/auth/shell/exchange", func(w http.ResponseWriter, r *http.Request) {
		if shellBridge == nil || !shellBridge.Enabled() {
			httpapi.WriteError(w, r, http.StatusNotFound, "shell_bridge_disabled", "Bridge do shell nao configurado neste ambiente.")
			return
		}

		var request shellExchangeRequest
		if err := httpapi.ReadJSON(r, &request); err != nil {
			httpapi.WriteError(w, r, http.StatusBadRequest, "invalid_json", "Payload invalido.")
			return
		}

		result, err := shellBridge.Exchange(r.Context(), request.BridgeToken)
		if err != nil {
			slog.Warn("auth_shell_bridge_error", "request_id", httpapi.RequestIDFromContext(r.Context()), "error", err)
			switch {
			case errors.Is(err, ErrShellBridgeDisabled):
				httpapi.WriteError(w, r, http.StatusNotFound, "shell_bridge_disabled", "Bridge do shell nao configurado neste ambiente.")
			case errors.Is(err, ErrShellBridgeUnauthorized):
				httpapi.WriteError(w, r, http.StatusUnauthorized, "shell_bridge_unauthorized", "Sessao do shell invalida ou expirada.")
			case errors.Is(err, ErrShellBridgeForbidden):
				httpapi.WriteError(w, r, http.StatusForbidden, "shell_bridge_forbidden", "Seu contexto atual nao pode entrar no modulo por SSO.")
			case errors.Is(err, ErrUserInactive):
				httpapi.WriteError(w, r, http.StatusForbidden, "shell_bridge_user_inactive", "Esse acesso do modulo esta inativo no momento.")
			case errors.Is(err, ErrShellBridgeScopeUnresolved):
				httpapi.WriteError(w, r, http.StatusConflict, "shell_bridge_scope_unresolved", "Nao foi possivel resolver o tenant local do modulo para esta sessao.")
			case errors.Is(err, ErrConflict):
				httpapi.WriteError(w, r, http.StatusConflict, "shell_bridge_conflict", "Conflito ao provisionar a identidade do modulo.")
			default:
				httpapi.WriteError(w, r, http.StatusInternalServerError, "internal_error", "Erro ao iniciar a sessao integrada do modulo.")
			}
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, loginResponse{
			User: result.User,
			Session: loginSessionDTO{
				AccessToken:     result.Session.AccessToken,
				TokenType:       result.Session.TokenType,
				ExpiresAt:       result.Session.ExpiresAt,
				ExpiresInSecond: int64(time.Until(result.Session.ExpiresAt).Seconds()),
			},
		})
	})

	mux.Handle("GET /v1/auth/me", middleware.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		principal, ok := PrincipalFromContext(r.Context())
		if !ok {
			httpapi.WriteError(w, r, http.StatusUnauthorized, "unauthorized", "Autenticacao obrigatoria.")
			return
		}

		user, err := service.CurrentUser(r.Context(), principal)
		if err != nil {
			switch {
			case errors.Is(err, ErrUnauthorized), errors.Is(err, ErrUserInactive):
				httpapi.WriteError(w, r, http.StatusUnauthorized, "unauthorized", "Sessao invalida.")
			default:
				httpapi.WriteError(w, r, http.StatusInternalServerError, "internal_error", "Erro ao carregar o usuario autenticado.")
			}
			return
		}

		httpapi.WriteJSON(w, http.StatusOK, meResponse{
			User: user,
			Principal: principalDTO{
				UserID:    principal.UserID,
				Role:      principal.Role,
				TenantID:  principal.TenantID,
				StoreIDs:  append([]string{}, principal.StoreIDs...),
				ExpiresAt: principal.ExpiresAt,
			},
		})
	})))

	mux.Handle("GET /v1/dev/ping", middleware.RequireRoles(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		httpapi.WriteJSON(w, http.StatusOK, map[string]any{
			"ok":      true,
			"message": "Area interna da plataforma liberada para platform_admin.",
		})
	}), RolePlatformAdmin))
}
