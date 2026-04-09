package app

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/analytics"
	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/auth"
	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/consultants"
	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/operations"
	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/realtime"
	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/reports"
	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/settings"
	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/stores"
	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/tenants"
	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/users"
	"github.com/mikewade2k16/lista-da-vez/back/internal/platform/config"
	"github.com/mikewade2k16/lista-da-vez/back/internal/platform/httpapi"
)

func BuildHTTPHandler(cfg config.Config, logger *slog.Logger, pool *pgxpool.Pool) (http.Handler, error) {
	hasher := auth.NewBcryptHasher(cfg.BcryptCost)
	userStore := auth.NewPostgresUserStore(pool)
	tokenManager := auth.NewHMACTokenManager(cfg.AuthTokenSecret, cfg.AuthTokenTTL)
	shellBridgeClaims := auth.NewShellBridgeTokenManager(cfg.AuthShellBridgeSecret)
	shellBridgeProvisioner := auth.NewShellBridgeProvisioner(pool, cfg.AuthShellBridgeTenantSlug)
	shellBridgeExchange := auth.NewShellBridgeExchangeService(shellBridgeClaims, shellBridgeProvisioner, tokenManager)
	avatarStorage := auth.NewDiskAvatarStorage(cfg.UploadsDir)
	consultantRepository := consultants.NewPostgresRepository(pool)
	consultantProfileSync := consultants.NewProfileSync(consultantRepository)
	authService := auth.NewService(userStore, hasher, tokenManager, avatarStorage, nil, consultantProfileSync)
	invitationService := auth.NewInvitationService(userStore, hasher, tokenManager, cfg.WebAppURL, cfg.AuthInviteTTL)
	authMiddleware := auth.NewMiddleware(authService)
	tenantRepository := tenants.NewPostgresRepository(pool)
	tenantService := tenants.NewService(tenantRepository)
	realtimeHub := realtime.NewHub()
	realtimeResolver := realtime.NewAuthRealtimeContextResolver(authService, nil, tenantService)
	realtimeService := realtime.NewService(realtimeResolver, cfg.CORSAllowedOrigins, realtimeHub)
	authService.SetContextPublisher(realtimeService)
	storeRepository := stores.NewPostgresRepository(pool)
	storeService := stores.NewService(storeRepository, realtimeService)
	realtimeResolver.SetStoreFinder(storeService)
	consultantIdentityProvisioner := consultants.NewAuthIdentityProvisioner(pool, hasher, cfg.ConsultantDefaultPassword)
	consultantService := consultants.NewService(
		consultantRepository,
		stores.NewCatalogProvider(storeService),
		consultantIdentityProvisioner,
		cfg.ConsultantEmailDomain,
		cfg.ConsultantDefaultPassword,
	)
	settingsRepository := settings.NewPostgresRepository(pool)
	settingsService := settings.NewService(settingsRepository)
	operationsRepository := operations.NewPostgresRepository(pool)
	operationsService := operations.NewService(operationsRepository, realtimeService, stores.NewScopeProvider(storeService))
	reportsRepository := reports.NewPostgresRepository(pool)
	reportsService := reports.NewService(reportsRepository, stores.NewCatalogProvider(storeService))
	analyticsRepository := analytics.NewPostgresRepository(pool)
	analyticsService := analytics.NewService(analyticsRepository, stores.NewCatalogProvider(storeService))
	usersRepository := users.NewPostgresRepository(pool)
	usersService := users.NewService(usersRepository, hasher, invitationService, realtimeService, consultantProfileSync)

	mux := http.NewServeMux()
	if strings.TrimSpace(cfg.UploadsDir) != "" {
		fileServer := http.StripPrefix("/uploads/", http.FileServer(http.Dir(cfg.UploadsDir)))
		mux.Handle("GET /uploads/", fileServer)
	}
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		httpapi.WriteJSON(w, http.StatusOK, map[string]any{
			"service": cfg.AppName,
			"status":  "ok",
			"modules": []string{
				"auth",
				"tenants",
				"stores",
				"consultants",
				"settings",
				"operations",
				"realtime",
				"reports",
				"analytics",
				"users",
			},
			"tenantMode": "owner-is-client",
		})
	})

	auth.RegisterRoutes(mux, authService, invitationService, authMiddleware, shellBridgeExchange)
	registerContextRoutes(mux, authService, authMiddleware, tenantService, storeService)
	tenants.RegisterRoutes(mux, tenantService, authMiddleware)
	stores.RegisterRoutes(mux, storeService, authMiddleware)
	consultants.RegisterRoutesWithOptions(mux, consultantService, consultants.HTTPRouteOptions{
		RequireAuth:    consultants.AuthRouteGuard(authMiddleware),
		AccessResolver: consultants.NewAuthAccessContextResolver(),
	})
	settings.RegisterRoutesWithOptions(mux, settingsService, settings.HTTPRouteOptions{
		RequireAuth:    settings.AuthRouteGuard(authMiddleware),
		AccessResolver: settings.NewAuthAccessContextResolver(),
	})
	operations.RegisterRoutesWithOptions(mux, operationsService, operations.HTTPRouteOptions{
		RequireAuth:    operations.AuthRouteGuard(authMiddleware),
		AccessResolver: operations.NewAuthAccessContextResolver(),
	})
	realtime.RegisterRoutes(mux, realtimeService)
	reports.RegisterRoutesWithOptions(mux, reportsService, reports.HTTPRouteOptions{
		RequireAuth:    reports.AuthRouteGuard(authMiddleware),
		AccessResolver: reports.NewAuthAccessContextResolver(),
	})
	analytics.RegisterRoutesWithOptions(mux, analyticsService, analytics.HTTPRouteOptions{
		RequireAuth:    analytics.AuthRouteGuard(authMiddleware),
		AccessResolver: analytics.NewAuthAccessContextResolver(),
	})
	users.RegisterRoutes(mux, usersService, authMiddleware, shellBridgeExchange != nil && shellBridgeExchange.Enabled())

	return httpapi.Chain(
		mux,
		httpapi.CORS(cfg.CORSAllowedOrigins),
		httpapi.RequestID,
		httpapi.Logging(logger),
		httpapi.Recover(logger),
	), nil
}
