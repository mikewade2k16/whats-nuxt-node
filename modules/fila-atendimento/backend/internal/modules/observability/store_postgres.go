package observability

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

func (repository *PostgresRepository) Insert(ctx context.Context, event MetricEvent) (MetricEvent, error) {
	metricsJSON, err := json.Marshal(event.Metrics)
	if err != nil {
		return MetricEvent{}, fmt.Errorf("marshal metrics: %w", err)
	}

	metadataJSON, err := json.Marshal(event.Metadata)
	if err != nil {
		return MetricEvent{}, fmt.Errorf("marshal metadata: %w", err)
	}

	var stored MetricEvent
	var storedMetrics []byte
	var storedMetadata []byte
	err = repository.pool.QueryRow(ctx, `
		insert into page_metric_events (
			page_key,
			page_path,
			event_type,
			event_key,
			tenant_id,
			store_id,
			actor_user_id,
			actor_role,
			status,
			severity,
			duration_ms,
			summary,
			metrics,
			metadata
		)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb)
		returning
			id::text,
			page_key,
			page_path,
			event_type,
			event_key,
			tenant_id,
			store_id,
			actor_user_id,
			actor_role,
			status,
			severity,
			duration_ms,
			summary,
			metrics,
			metadata,
			created_at;
	`, event.PageKey, event.PagePath, event.EventType, event.EventKey, event.TenantID, event.StoreID, event.ActorUserID, event.ActorRole, event.Status, event.Severity, event.DurationMs, event.Summary, string(metricsJSON), string(metadataJSON)).Scan(
		&stored.ID,
		&stored.PageKey,
		&stored.PagePath,
		&stored.EventType,
		&stored.EventKey,
		&stored.TenantID,
		&stored.StoreID,
		&stored.ActorUserID,
		&stored.ActorRole,
		&stored.Status,
		&stored.Severity,
		&stored.DurationMs,
		&stored.Summary,
		&storedMetrics,
		&storedMetadata,
		&stored.CreatedAt,
	)
	if err != nil {
		return MetricEvent{}, err
	}

	stored.Metrics = unmarshalObject(storedMetrics)
	stored.Metadata = unmarshalObject(storedMetadata)
	return stored, nil
}

func (repository *PostgresRepository) List(ctx context.Context, access AccessContext, filters ListFilters) ([]MetricEvent, error) {
	where := []string{"tenant_id = $1"}
	args := []any{strings.TrimSpace(access.TenantID)}
	nextArg := 2

	appendFilter := func(column string, value string) {
		normalized := strings.TrimSpace(value)
		if normalized == "" {
			return
		}

		where = append(where, fmt.Sprintf("%s = $%d", column, nextArg))
		args = append(args, normalized)
		nextArg++
	}

	appendFilter("page_key", filters.PageKey)
	appendFilter("page_path", filters.PagePath)
	appendFilter("event_type", filters.EventType)
	appendFilter("event_key", filters.EventKey)
	appendFilter("status", filters.Status)
	appendFilter("store_id", filters.StoreID)

	args = append(args, filters.Limit)
	query := fmt.Sprintf(`
		select
			id::text,
			page_key,
			page_path,
			event_type,
			event_key,
			tenant_id,
			store_id,
			actor_user_id,
			actor_role,
			status,
			severity,
			duration_ms,
			summary,
			metrics,
			metadata,
			created_at
		from page_metric_events
		where %s
		order by created_at desc
		limit $%d;
	`, strings.Join(where, " and "), nextArg)

	rows, err := repository.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := make([]MetricEvent, 0)
	for rows.Next() {
		var event MetricEvent
		var metricsJSON []byte
		var metadataJSON []byte
		if err := rows.Scan(
			&event.ID,
			&event.PageKey,
			&event.PagePath,
			&event.EventType,
			&event.EventKey,
			&event.TenantID,
			&event.StoreID,
			&event.ActorUserID,
			&event.ActorRole,
			&event.Status,
			&event.Severity,
			&event.DurationMs,
			&event.Summary,
			&metricsJSON,
			&metadataJSON,
			&event.CreatedAt,
		); err != nil {
			return nil, err
		}

		event.Metrics = unmarshalObject(metricsJSON)
		event.Metadata = unmarshalObject(metadataJSON)
		events = append(events, event)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return events, nil
}

func unmarshalObject(raw []byte) map[string]any {
	if len(raw) == 0 {
		return map[string]any{}
	}

	var value map[string]any
	if err := json.Unmarshal(raw, &value); err != nil {
		return map[string]any{}
	}
	if value == nil {
		return map[string]any{}
	}
	return value
}
