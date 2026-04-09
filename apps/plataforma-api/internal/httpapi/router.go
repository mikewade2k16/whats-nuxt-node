package httpapi

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"plataforma-api/internal/domain/auth"
	"plataforma-api/internal/domain/core"
	"plataforma-api/internal/domain/finance"
	"plataforma-api/internal/httpapi/handlers"
	authmw "plataforma-api/internal/httpapi/middleware"
	"plataforma-api/internal/realtime"
)

type RouterDeps struct {
	AuthService            *auth.Service
	CoreService            *core.Service
	FinanceService         *finance.Service
	FilaAtendimentoHandler http.Handler
	Hub                    *realtime.Hub
	StartedAt              time.Time
	RedisURL               string
	TrustedProxyRanges     []string
}

func NewRouter(deps RouterDeps) http.Handler {
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(authmw.TrustedProxyRealIP(authmw.TrustedProxyOptions{
		TrustedRanges: deps.TrustedProxyRanges,
	}))
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	healthHandler := handlers.NewHealthHandler(deps.StartedAt)
	authHandler := handlers.NewAuthHandler(deps.AuthService)
	coreHandler := handlers.NewCoreHandler(deps.CoreService, deps.Hub)
	financeHandler := handlers.NewFinanceHandler(deps.FinanceService)
	wsHandler := handlers.NewWSHandler(deps.AuthService, deps.Hub)

	r.Get("/health", healthHandler.Get)
	r.Get("/core/health", healthHandler.Get)

	if deps.FilaAtendimentoHandler != nil {
		r.Handle("/core/modules/fila-atendimento", http.RedirectHandler("/core/modules/fila-atendimento/healthz", http.StatusTemporaryRedirect))
		r.Handle("/core/modules/fila-atendimento/*", http.StripPrefix("/core/modules/fila-atendimento", deps.FilaAtendimentoHandler))
	}

	r.Route("/core", func(r chi.Router) {
		r.With(authmw.RateLimit(authmw.RateLimitOptions{
			Scope:    "core.auth.login",
			Max:      50,
			Window:   5 * time.Minute,
			Block:    2 * time.Minute,
			Message:  "too many login attempts",
			RedisURL: deps.RedisURL,
		})).Post("/auth/login", authHandler.Login)
		r.With(authmw.RateLimit(authmw.RateLimitOptions{
			Scope:    "core.auth.password-reset.request",
			Max:      5,
			Window:   15 * time.Minute,
			Block:    15 * time.Minute,
			Message:  "too many password reset requests",
			RedisURL: deps.RedisURL,
		})).Post("/auth/password-reset/request", authHandler.RequestPasswordReset)
		r.With(authmw.RateLimit(authmw.RateLimitOptions{
			Scope:    "core.auth.password-reset.confirm",
			Max:      10,
			Window:   15 * time.Minute,
			Block:    15 * time.Minute,
			Message:  "too many password reset confirmations",
			RedisURL: deps.RedisURL,
		})).Post("/auth/password-reset/confirm", authHandler.ConfirmPasswordReset)
		r.Get("/ws", wsHandler.ServeHTTP)

		r.Group(func(r chi.Router) {
			r.Use(authmw.RequireAuth(deps.AuthService))
			r.Post("/auth/logout", authHandler.Logout)
			r.Get("/auth/me", authHandler.Me)
			r.Get("/admin/auth-config", authHandler.GetAdminSessionConfig)
			r.Put("/admin/auth-config", authHandler.UpdateAdminSessionConfig)
			r.Get("/admin/auth-sessions", authHandler.ListAdminSessions)
			r.Post("/admin/auth-sessions/revoke-user", authHandler.RevokeAdminUserSessions)
			r.Delete("/admin/auth-sessions/{sessionId}", authHandler.RevokeAdminSession)
			r.Patch("/auth/profile", coreHandler.UpdateSelfProfile)
			r.Get("/permissions", coreHandler.ListPermissions)

			r.Get("/admin/clients", coreHandler.ListAdminClients)
			r.Post("/admin/clients", coreHandler.CreateAdminClient)
			r.Patch("/admin/clients/{clientId}", coreHandler.UpdateAdminClientField)
			r.Delete("/admin/clients/{clientId}", coreHandler.DeleteAdminClient)
			r.Put("/admin/clients/{clientId}/stores", coreHandler.ReplaceAdminClientStores)
			r.Post("/admin/clients/{clientId}/webhook/rotate", coreHandler.RotateAdminClientWebhook)

			r.Get("/admin/users", coreHandler.ListAdminUsers)
			r.Post("/admin/users", coreHandler.CreateAdminUser)
			r.Patch("/admin/users/{userId}", coreHandler.UpdateAdminUserField)
			r.Delete("/admin/users/{userId}", coreHandler.DeleteAdminUser)
			r.Post("/admin/users/{userId}/approve", coreHandler.ApproveAdminUser)

			r.Get("/admin/finance-sheets", financeHandler.ListAdminFinances)
			r.Post("/admin/finance-sheets", financeHandler.CreateAdminFinance)
			r.Get("/admin/finance-sheets/{sheetId}", financeHandler.GetAdminFinance)
			r.Put("/admin/finance-sheets/{sheetId}", financeHandler.ReplaceAdminFinance)
			r.Patch("/admin/finance-sheets/{sheetId}/lines/{lineId}", financeHandler.UpdateAdminFinanceLine)
			r.Delete("/admin/finance-sheets/{sheetId}", financeHandler.DeleteAdminFinance)
			r.Get("/admin/finance-config", financeHandler.GetAdminFinanceConfig)
			r.Put("/admin/finance-config", financeHandler.ReplaceAdminFinanceConfig)

			r.Get("/tenants", coreHandler.ListTenants)
			r.Post("/tenants", coreHandler.CreateTenant)
			r.Get("/tenants/{tenantId}", coreHandler.GetTenant)
			r.Patch("/tenants/{tenantId}", coreHandler.UpdateTenant)

			r.Get("/tenants/{tenantId}/users", coreHandler.ListTenantUsers)
			r.Post("/tenants/{tenantId}/users/invite", coreHandler.InviteTenantUser)
			r.Get("/tenants/{tenantId}/users/{tenantUserId}/roles", coreHandler.ListTenantUserRoles)
			r.Post("/tenants/{tenantId}/users/{tenantUserId}/roles/{roleId}/assign", coreHandler.AssignRoleToTenantUser)
			r.Delete("/tenants/{tenantId}/users/{tenantUserId}/roles/{roleId}", coreHandler.RevokeRoleFromTenantUser)

			r.Get("/tenants/{tenantId}/modules", coreHandler.ListTenantModules)
			r.Post("/tenants/{tenantId}/modules/{moduleCode}/activate", coreHandler.ActivateTenantModule)
			r.Post("/tenants/{tenantId}/modules/{moduleCode}/deactivate", coreHandler.DeactivateTenantModule)

			r.Get("/tenants/{tenantId}/roles", coreHandler.ListTenantRoles)
			r.Post("/tenants/{tenantId}/roles", coreHandler.CreateTenantRole)
			r.Patch("/tenants/{tenantId}/roles/{roleId}", coreHandler.UpdateTenantRole)

			r.Get("/tenants/{tenantId}/modules/{moduleCode}/limits/{limitKey}", coreHandler.ResolveModuleLimit)
			r.Put("/tenants/{tenantId}/modules/{moduleCode}/limits/{limitKey}", coreHandler.UpsertTenantModuleLimit)
			r.Post("/tenants/{tenantId}/modules/{moduleCode}/users/{tenantUserId}/assign", coreHandler.AssignTenantUserToModule)
			r.Delete("/tenants/{tenantId}/modules/{moduleCode}/users/{tenantUserId}/assign", coreHandler.UnassignTenantUserFromModule)
		})
	})

	return r
}
