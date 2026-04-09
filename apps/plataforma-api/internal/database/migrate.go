package database

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

const createMigrationsTableTemplate = `
CREATE TABLE IF NOT EXISTS %s (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
`

func RunMigrations(ctx context.Context, pool *pgxpool.Pool, schema, migrationsDir string) (int, error) {
	if err := ensureMigrationsTable(ctx, pool, schema); err != nil {
		return 0, err
	}
	tableRef := migrationsTableRef(schema)

	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		return 0, fmt.Errorf("read migrations dir: %w", err)
	}

	files := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if strings.HasSuffix(entry.Name(), ".sql") {
			files = append(files, entry.Name())
		}
	}
	sort.Strings(files)

	appliedVersions, err := loadAppliedMigrations(ctx, pool, tableRef)
	if err != nil {
		return 0, err
	}

	appliedCount := 0
	for _, file := range files {
		if appliedVersions[file] {
			continue
		}

		path := filepath.Join(migrationsDir, file)
		scriptBytes, err := os.ReadFile(path)
		if err != nil {
			return appliedCount, fmt.Errorf("read migration %s: %w", file, err)
		}
		script := strings.TrimSpace(string(scriptBytes))
		if script == "" {
			continue
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			return appliedCount, fmt.Errorf("begin tx for %s: %w", file, err)
		}

		if _, err := tx.Exec(ctx, script); err != nil {
			_ = tx.Rollback(ctx)
			return appliedCount, fmt.Errorf("execute migration %s: %w", file, err)
		}
		insertSQL := fmt.Sprintf("INSERT INTO %s(version) VALUES ($1)", tableRef)
		if _, err := tx.Exec(ctx, insertSQL, file); err != nil {
			_ = tx.Rollback(ctx)
			return appliedCount, fmt.Errorf("store migration %s: %w", file, err)
		}
		if err := tx.Commit(ctx); err != nil {
			return appliedCount, fmt.Errorf("commit migration %s: %w", file, err)
		}

		appliedCount++
	}

	return appliedCount, nil
}

func ensureMigrationsTable(ctx context.Context, pool *pgxpool.Pool, schema string) error {
	schemaRef := quoteIdentifier(schema)

	createSchemaSQL := fmt.Sprintf("CREATE SCHEMA IF NOT EXISTS %s", schemaRef)
	if _, err := pool.Exec(ctx, createSchemaSQL); err != nil {
		return fmt.Errorf("create schema %s: %w", schema, err)
	}

	if schema != "public" {
		publicHasLegacy, err := migrationTableExists(ctx, pool, "public")
		if err != nil {
			return err
		}
		if publicHasLegacy {
			targetHasTable, err := migrationTableExists(ctx, pool, schema)
			if err != nil {
				return err
			}

			if !targetHasTable {
				moveSQL := fmt.Sprintf("ALTER TABLE public.core_schema_migrations SET SCHEMA %s", schemaRef)
				if _, err := pool.Exec(ctx, moveSQL); err != nil {
					return fmt.Errorf("move legacy migrations table to %s: %w", schema, err)
				}
			} else {
				tableRef := migrationsTableRef(schema)
				copySQL := fmt.Sprintf(`
INSERT INTO %s (version, applied_at)
SELECT version, applied_at
FROM public.core_schema_migrations
ON CONFLICT (version) DO NOTHING
`, tableRef)
				if _, err := pool.Exec(ctx, copySQL); err != nil {
					return fmt.Errorf("copy legacy migrations rows to %s: %w", schema, err)
				}
				if _, err := pool.Exec(ctx, "DROP TABLE public.core_schema_migrations"); err != nil {
					return fmt.Errorf("drop legacy public migrations table: %w", err)
				}
			}
		}
	}

	createTableSQL := fmt.Sprintf(createMigrationsTableTemplate, migrationsTableRef(schema))
	if _, err := pool.Exec(ctx, createTableSQL); err != nil {
		return fmt.Errorf("create migrations table in %s: %w", schema, err)
	}

	return nil
}

func migrationTableExists(ctx context.Context, pool *pgxpool.Pool, schema string) (bool, error) {
	const existsSQL = `
SELECT EXISTS (
  SELECT 1
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r'
    AND c.relname = 'core_schema_migrations'
    AND n.nspname = $1
);
`

	var exists bool
	if err := pool.QueryRow(ctx, existsSQL, schema).Scan(&exists); err != nil {
		return false, fmt.Errorf("check migrations table existence for schema %s: %w", schema, err)
	}
	return exists, nil
}

func migrationsTableRef(schema string) string {
	return fmt.Sprintf("%s.core_schema_migrations", quoteIdentifier(schema))
}

func quoteIdentifier(identifier string) string {
	return `"` + strings.ReplaceAll(identifier, `"`, `""`) + `"`
}

func loadAppliedMigrations(ctx context.Context, pool *pgxpool.Pool, tableRef string) (map[string]bool, error) {
	querySQL := fmt.Sprintf("SELECT version FROM %s", tableRef)
	rows, err := pool.Query(ctx, querySQL)
	if err != nil {
		return nil, fmt.Errorf("query applied migrations: %w", err)
	}
	defer rows.Close()

	versions := make(map[string]bool)
	for rows.Next() {
		var version string
		if err := rows.Scan(&version); err != nil {
			return nil, fmt.Errorf("scan migration row: %w", err)
		}
		versions[version] = true
	}

	if rows.Err() != nil {
		return nil, fmt.Errorf("iterate migration rows: %w", rows.Err())
	}

	return versions, nil
}
