package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/mikewade2k16/lista-da-vez/back/internal/platform/config"
	"github.com/mikewade2k16/lista-da-vez/back/internal/platform/database"
)

func main() {
	cfg := config.Load()
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := database.OpenPool(ctx, cfg)
	if err != nil {
		logger.Error("database_connect_failed", slog.Any("error", err))
		os.Exit(1)
	}
	defer pool.Close()

	command := "up"
	if len(os.Args) > 1 {
		command = os.Args[1]
	}

	switch command {
	case "up":
		if err := database.ApplyMigrations(ctx, pool); err != nil {
			logger.Error("migration_up_failed", slog.Any("error", err))
			os.Exit(1)
		}

		logger.Info("migration_up_ok")
	case "status":
		applied, err := database.ListAppliedMigrations(ctx, pool)
		if err != nil {
			logger.Error("migration_status_failed", slog.Any("error", err))
			os.Exit(1)
		}

		for _, item := range applied {
			fmt.Printf("%s %s %s\n", item.Version, item.AppliedAt.Format(time.RFC3339), item.Name)
		}
	default:
		logger.Error("unknown_command", slog.String("command", command))
		os.Exit(1)
	}
}
