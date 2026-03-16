package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"platform-core/internal/config"
	"platform-core/internal/database"
	"platform-core/internal/domain/auth"
	"platform-core/internal/domain/core"
	"platform-core/internal/httpapi"
	"platform-core/internal/realtime"
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

	if cfg.AutoMigrate {
		migrationsDir := filepath.Join(".", "migrations")
		count, err := database.RunMigrations(ctx, pool, cfg.DatabaseSchema, migrationsDir)
		if err != nil {
			log.Fatalf("auto-migrate failed: %v", err)
		}
		log.Printf("auto-migrate applied %d migration(s)", count)
	}

	authService := auth.NewService(pool, cfg.JWTSecret, cfg.JWTIssuer, cfg.JWTTTL)
	coreService := core.NewService(pool, cfg.DefaultUsersLimit)
	hub := realtime.NewHub(cfg.AllowedOrigins, cfg.WSPingInterval, cfg.WSWriteTimeout, cfg.WSReadTimeout)

	router := httpapi.NewRouter(httpapi.RouterDeps{
		AuthService:        authService,
		CoreService:        coreService,
		Hub:                hub,
		StartedAt:          startedAt,
		RedisURL:           cfg.RedisURL,
		TrustedProxyRanges: cfg.TrustedProxyRanges,
	})

	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
	}

	errorCh := make(chan error, 1)
	go func() {
		log.Printf("platform-core listening on %s", cfg.HTTPAddr)
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
	log.Printf("platform-core stopped")
}
