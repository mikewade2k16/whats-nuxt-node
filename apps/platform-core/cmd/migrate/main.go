package main

import (
	"context"
	"flag"
	"log"

	"platform-core/internal/config"
	"platform-core/internal/database"
)

func main() {
	migrationsDir := flag.String("dir", "./migrations", "directory with sql migration files")
	flag.Parse()

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

	count, err := database.RunMigrations(ctx, pool, cfg.DatabaseSchema, *migrationsDir)
	if err != nil {
		log.Fatalf("migration failed: %v", err)
	}

	log.Printf("applied %d migration(s)", count)
}
