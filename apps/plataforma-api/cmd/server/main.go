package main

import (
	"context"
	"errors"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"plataforma-api/internal/config"
	"plataforma-api/internal/database"
	"plataforma-api/internal/domain/auth"
	"plataforma-api/internal/domain/core"
	"plataforma-api/internal/domain/filaatendimento"
	"plataforma-api/internal/domain/finance"
	"plataforma-api/internal/httpapi"
	"plataforma-api/internal/realtime"
)

func main() {
	startedAt := time.Now().UTC()
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	ctx := context.Background()
	pool, err := database.Connect(ctx, cfg.DatabaseURL, cfg.DatabaseSchema)
	if err != nil {
		log.Fatalf("database error: %v", err)
	}
	defer pool.Close()

	var filaAtendimentoHandler http.Handler

	if cfg.AutoMigrate {
		migrationsDir := filepath.Join(".", "migrations")
		count, err := database.RunMigrations(ctx, pool, cfg.DatabaseSchema, migrationsDir)
		if err != nil {
			log.Fatalf("auto-migrate failed: %v", err)
		}
		log.Printf("auto-migrate applied %d migration(s)", count)
	}

	if cfg.FilaAtendimento.Enabled {
		runtime, err := filaatendimento.StartHostedRuntime(ctx, slog.Default(), cfg.FilaAtendimento, cfg.AutoMigrate)
		if err != nil {
			log.Fatalf("fila-atendimento bootstrap failed: %v", err)
		}
		defer runtime.Close()
		filaAtendimentoHandler = runtime.Handler
	}

	authService := auth.NewService(pool, cfg.JWTSecret, cfg.JWTIssuer, cfg.JWTTTL)
	authService.ConfigurePasswordReset(cfg.PasswordResetTTL, auth.SMTPConfig{
		Host:      cfg.SMTP.Host,
		Port:      cfg.SMTP.Port,
		Username:  cfg.SMTP.Username,
		Password:  cfg.SMTP.Password,
		FromEmail: cfg.SMTP.FromEmail,
		FromName:  cfg.SMTP.FromName,
	})
	coreService := core.NewService(pool, cfg.DefaultUsersLimit)
	financeService := finance.NewService(pool)
	hub := realtime.NewHub(cfg.AllowedOrigins, cfg.WSPingInterval, cfg.WSWriteTimeout, cfg.WSReadTimeout)

	router := httpapi.NewRouter(httpapi.RouterDeps{
		AuthService:            authService,
		CoreService:            coreService,
		FinanceService:         financeService,
		FilaAtendimentoHandler: filaAtendimentoHandler,
		Hub:                    hub,
		StartedAt:              startedAt,
		RedisURL:               cfg.RedisURL,
		TrustedProxyRanges:     cfg.TrustedProxyRanges,
	})

	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
	}

	errorCh := make(chan error, 1)
	go func() {
		log.Printf("plataforma-api listening on %s", cfg.HTTPAddr)
		err := server.ListenAndServe()
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			errorCh <- err
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)

	select {
	case sig := <-sigCh:
		log.Printf("signal received: %s", sig.String())
	case err := <-errorCh:
		log.Fatalf("server failed: %v", err)
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("graceful shutdown failed: %v", err)
	}
	log.Printf("plataforma-api stopped")
}
