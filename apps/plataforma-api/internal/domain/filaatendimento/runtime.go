package filaatendimento

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	filaatendimentomodule "github.com/mikewade2k16/lista-da-vez/back/moduleapi"

	"plataforma-api/internal/config"
	"plataforma-api/internal/database"
)

type HostedRuntime struct {
	Pool    *pgxpool.Pool
	Handler http.Handler
}

func StartHostedRuntime(ctx context.Context, logger *slog.Logger, cfg config.FilaAtendimentoConfig, autoMigrate bool) (*HostedRuntime, error) {
	pool, err := database.Connect(ctx, cfg.DatabaseURL, cfg.DatabaseSchema)
	if err != nil {
		return nil, fmt.Errorf("connect fila-atendimento database: %w", err)
	}

	if autoMigrate {
		if err := filaatendimentomodule.ApplyMigrations(ctx, pool, cfg.DatabaseSchema); err != nil {
			pool.Close()
			return nil, fmt.Errorf("auto-migrate fila-atendimento: %w", err)
		}
	}

	handler, err := filaatendimentomodule.BuildHTTPHandler(logger, pool, filaatendimentomodule.Options{
		AppName:                   cfg.AppName,
		Env:                       cfg.Env,
		WebAppURL:                 cfg.WebAppURL,
		UploadsDir:                cfg.UploadsDir,
		DatabaseMinConns:          cfg.DatabaseMinConns,
		DatabaseMaxConns:          cfg.DatabaseMaxConns,
		CORSAllowedOrigins:        cfg.CORSAllowedOrigins,
		AuthTokenSecret:           cfg.AuthTokenSecret,
		AuthTokenTTL:              cfg.AuthTokenTTL,
		AuthInviteTTL:             cfg.AuthInviteTTL,
		AuthShellBridgeSecret:     cfg.AuthShellBridgeSecret,
		AuthShellBridgeTenantSlug: cfg.AuthShellBridgeTenantSlug,
		BcryptCost:                cfg.BcryptCost,
		ConsultantEmailDomain:     cfg.ConsultantEmailDomain,
		ConsultantDefaultPassword: cfg.ConsultantDefaultPassword,
	})
	if err != nil {
		pool.Close()
		return nil, fmt.Errorf("bootstrap fila-atendimento handler: %w", err)
	}

	return &HostedRuntime{
		Pool:    pool,
		Handler: handler,
	}, nil
}

func (runtime *HostedRuntime) Close() {
	if runtime == nil || runtime.Pool == nil {
		return
	}

	runtime.Pool.Close()
}
