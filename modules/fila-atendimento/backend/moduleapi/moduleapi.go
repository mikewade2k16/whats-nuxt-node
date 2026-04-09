package moduleapi

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	internalapp "github.com/mikewade2k16/lista-da-vez/back/internal/platform/app"
	internalconfig "github.com/mikewade2k16/lista-da-vez/back/internal/platform/config"
	internaldatabase "github.com/mikewade2k16/lista-da-vez/back/internal/platform/database"
)

type Options struct {
	AppName                   string
	Env                       string
	WebAppURL                 string
	UploadsDir                string
	DatabaseMinConns          int
	DatabaseMaxConns          int
	CORSAllowedOrigins        []string
	AuthTokenSecret           string
	AuthTokenTTL              time.Duration
	AuthInviteTTL             time.Duration
	AuthShellBridgeSecret     string
	AuthShellBridgeTenantSlug string
	BcryptCost                int
	ConsultantEmailDomain     string
	ConsultantDefaultPassword string
}

func BuildHTTPHandler(logger *slog.Logger, pool *pgxpool.Pool, options Options) (http.Handler, error) {
	if logger == nil {
		logger = slog.Default()
	}

	cfg := internalconfig.Config{
		AppName:                   defaultString(options.AppName, "fila-atendimento-api"),
		Env:                       defaultString(options.Env, "hosted"),
		HTTPAddr:                  "/core/modules/fila-atendimento",
		WebAppURL:                 defaultString(options.WebAppURL, "http://localhost:3000"),
		UploadsDir:                defaultString(options.UploadsDir, "data/fila-atendimento/uploads"),
		DatabaseMinConns:          options.DatabaseMinConns,
		DatabaseMaxConns:          options.DatabaseMaxConns,
		CORSAllowedOrigins:        append([]string{}, options.CORSAllowedOrigins...),
		AuthTokenSecret:           options.AuthTokenSecret,
		AuthTokenTTL:              options.AuthTokenTTL,
		AuthInviteTTL:             options.AuthInviteTTL,
		AuthShellBridgeSecret:     options.AuthShellBridgeSecret,
		AuthShellBridgeTenantSlug: options.AuthShellBridgeTenantSlug,
		BcryptCost:                options.BcryptCost,
		ConsultantEmailDomain:     options.ConsultantEmailDomain,
		ConsultantDefaultPassword: options.ConsultantDefaultPassword,
	}

	return internalapp.BuildHTTPHandler(cfg, logger, pool)
}

func ApplyMigrations(ctx context.Context, pool *pgxpool.Pool, schema string) error {
	if pool == nil {
		return fmt.Errorf("fila-atendimento pool is required")
	}

	normalizedSchema := strings.TrimSpace(schema)
	if normalizedSchema != "" {
		createSchemaSQL := fmt.Sprintf("CREATE SCHEMA IF NOT EXISTS %s", quoteIdentifier(normalizedSchema))
		if _, err := pool.Exec(ctx, createSchemaSQL); err != nil {
			return fmt.Errorf("create fila-atendimento schema %s: %w", normalizedSchema, err)
		}
	}

	if _, err := pool.Exec(ctx, "CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public"); err != nil {
		return fmt.Errorf("ensure pgcrypto extension: %w", err)
	}

	if _, err := pool.Exec(ctx, "ALTER EXTENSION pgcrypto SET SCHEMA public"); err != nil && !strings.Contains(strings.ToLower(err.Error()), "already exists") {
		return fmt.Errorf("move pgcrypto to public: %w", err)
	}

	if err := internaldatabase.ApplyMigrations(ctx, pool); err != nil {
		return fmt.Errorf("apply fila-atendimento migrations: %w", err)
	}

	return nil
}

func defaultString(value, fallback string) string {
	if strings.TrimSpace(value) != "" {
		return strings.TrimSpace(value)
	}
	return fallback
}

func quoteIdentifier(identifier string) string {
	return `"` + strings.ReplaceAll(identifier, `"`, `""`) + `"`
}
