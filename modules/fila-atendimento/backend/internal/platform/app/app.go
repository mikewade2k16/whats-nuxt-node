package app

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/analytics"
	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/auth"
	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/consultants"
	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/observability"
	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/operations"
	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/realtime"
	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/reports"
	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/settings"
	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/stores"
	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/tenants"
	"github.com/mikewade2k16/lista-da-vez/back/internal/platform/config"
	"github.com/mikewade2k16/lista-da-vez/back/internal/platform/httpapi"
)

func BuildHTTPHandler(cfg config.Config, logger *slog.Logger, pool *pgxpool.Pool) (http.Handler, error) {
	userStore := auth.NewCoreUserStore(pool)
	tokenManager := auth.NewHMACTokenManager(cfg.AuthTokenSecret, cfg.AuthTokenTTL)
	shellBridgeClaims := auth.NewShellBridgeTokenManager(cfg.AuthShellBridgeSecret)
	shellBridgeProvisioner := auth.NewCoreShellBridgeProvisioner(pool)
	shellBridgeExchange := auth.NewShellBridgeExchangeService(shellBridgeClaims, shellBridgeProvisioner, tokenManager)
	consultantRepository := consultants.NewPostgresRepository(pool)
	authService := auth.NewService(userStore, nil, tokenManager, nil, nil, nil)
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
	consultantService := consultants.NewService(
		consultantRepository,
		stores.NewCatalogProvider(storeService),
	)
	settingsRepository := settings.NewPostgresRepository(pool)
	settingsService := settings.NewService(settingsRepository)
	operationsRepository := operations.NewPostgresRepository(pool)
	operationsService := operations.NewService(operationsRepository, realtimeService, stores.NewScopeProvider(storeService))
	reportsRepository := reports.NewPostgresRepository(pool)
	reportsService := reports.NewService(reportsRepository, stores.NewCatalogProvider(storeService))
	analyticsRepository := analytics.NewPostgresRepository(pool)
	analyticsService := analytics.NewService(analyticsRepository, stores.NewCatalogProvider(storeService))
	observabilityRepository := observability.NewPostgresRepository(pool)
	observabilityService := observability.NewService(observabilityRepository)

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
				"observability",
			},
			"tenantMode": "owner-is-client",
		})
	})

	auth.RegisterRoutes(mux, authService, authMiddleware, shellBridgeExchange)
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
	observability.RegisterRoutesWithOptions(mux, observabilityService, observability.HTTPRouteOptions{
		RequireAuth:    observability.AuthRouteGuard(authMiddleware),
		AccessResolver: observability.NewAuthAccessContextResolver(),
	})

	return httpapi.Chain(
		mux,
		httpapi.CORS(cfg.CORSAllowedOrigins),
		httpapi.RequestID,
		httpapi.Logging(logger),
		httpapi.Recover(logger),
	), nil
}
