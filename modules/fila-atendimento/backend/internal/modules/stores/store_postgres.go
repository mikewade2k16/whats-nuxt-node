package stores

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mikewade2k16/lista-da-vez/back/internal/modules/auth"
)

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

func (repository *PostgresRepository) ListAccessible(ctx context.Context, principal auth.Principal, input ListInput) ([]Store, error) {
	query, args := buildListAccessibleQuery(principal, input)
	rows, err := repository.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	stores := make([]Store, 0)
	for rows.Next() {
		store, err := scanStore(rows)
		if err != nil {
			return nil, err
		}

		stores = append(stores, store)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return stores, nil
}

func (repository *PostgresRepository) FindAccessibleByID(ctx context.Context, principal auth.Principal, storeID string) (Store, error) {
	query, args := buildFindAccessibleQuery(principal, storeID)
	store, err := scanStore(repository.pool.QueryRow(ctx, query, args...))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Store{}, ErrStoreNotFound
		}

		return Store{}, err
	}

	return store, nil
}

func (repository *PostgresRepository) Create(ctx context.Context, store Store) (Store, error) {
	tx, err := repository.pool.Begin(ctx)
	if err != nil {
		return Store{}, err
	}
	defer func() {
		_ = tx.Rollback(ctx)
	}()

	var createdID string
	err = tx.QueryRow(ctx, `
		insert into platform_core.tenant_stores (
			tenant_id,
			code,
			name,
			city,
			is_active,
			sort_order,
			metadata
		)
		values (
			$1::uuid,
			$2,
			$3,
			$4,
			$5,
			coalesce((
				select max(sort_order) + 1
				from platform_core.tenant_stores
				where tenant_id = $1::uuid
			), 0),
			'{}'::jsonb
		)
		returning id::text;
	`, store.TenantID, store.Code, store.Name, store.City, store.Active).Scan(&createdID)
	if err != nil {
		if isUniqueViolation(err) {
			return Store{}, ErrStoreConflict
		}
		return Store{}, err
	}

	if err := upsertStoreProfile(ctx, tx, Store{
		ID:                createdID,
		TenantID:          store.TenantID,
		DefaultTemplateID: store.DefaultTemplateID,
		MonthlyGoal:       store.MonthlyGoal,
		WeeklyGoal:        store.WeeklyGoal,
		AvgTicketGoal:     store.AvgTicketGoal,
		ConversionGoal:    store.ConversionGoal,
		PAGoal:            store.PAGoal,
	}); err != nil {
		return Store{}, err
	}

	if _, err := tx.Exec(ctx, `
		insert into platform_core.tenant_store_charges (
			tenant_id,
			store_id,
			store_name,
			amount,
			sort_order,
			metadata
		)
		select
			$1::uuid,
			$2::uuid,
			$3,
			0,
			coalesce(ts.sort_order, 0),
			'{}'::jsonb
		from platform_core.tenant_stores ts
		where ts.id = $2::uuid
		on conflict (store_id) do update
		set
			tenant_id = excluded.tenant_id,
			store_name = excluded.store_name,
			sort_order = excluded.sort_order,
			updated_at = now();
	`, store.TenantID, createdID, store.Name); err != nil {
		return Store{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return Store{}, err
	}

	return repository.FindAccessibleByID(ctx, auth.Principal{
		UserID:   store.ID,
		Role:     auth.RolePlatformAdmin,
		TenantID: store.TenantID,
	}, createdID)
}

func (repository *PostgresRepository) Update(ctx context.Context, store Store) (Store, error) {
	tx, err := repository.pool.Begin(ctx)
	if err != nil {
		return Store{}, err
	}
	defer func() {
		_ = tx.Rollback(ctx)
	}()

	commandTag, err := tx.Exec(ctx, `
		update platform_core.tenant_stores
		set
			code = $2,
			name = $3,
			city = $4,
			is_active = $5,
			updated_at = now()
		where id = $1::uuid;
	`, store.ID, store.Code, store.Name, store.City, store.Active)
	if err != nil {
		if isUniqueViolation(err) {
			return Store{}, ErrStoreConflict
		}
		return Store{}, err
	}
	if commandTag.RowsAffected() == 0 {
		return Store{}, ErrStoreNotFound
	}

	if err := upsertStoreProfile(ctx, tx, store); err != nil {
		return Store{}, err
	}

	if _, err := tx.Exec(ctx, `
		update platform_core.tenant_store_charges
		set
			store_name = $2,
			updated_at = now()
		where store_id = $1::uuid;
	`, store.ID, store.Name); err != nil {
		return Store{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return Store{}, err
	}

	return repository.FindAccessibleByID(ctx, auth.Principal{
		UserID:   store.ID,
		Role:     auth.RolePlatformAdmin,
		TenantID: store.TenantID,
	}, store.ID)
}

func (repository *PostgresRepository) ListDeleteDependencies(ctx context.Context, storeID string) ([]DeleteDependency, error) {
	rows, err := repository.pool.Query(ctx, `
		with dependency_rows as (
			select 'consultants'::text as key, 'Consultores cadastrados'::text as label, count(*)::integer as total
			from consultants
			where store_id = $1::uuid

			union all

			select 'queue_entries'::text as key, 'Consultores na fila'::text as label, count(*)::integer as total
			from operation_queue_entries
			where store_id = $1::uuid

			union all

			select 'active_services'::text as key, 'Atendimentos ativos'::text as label, count(*)::integer as total
			from operation_active_services
			where store_id = $1::uuid

			union all

			select 'paused_consultants'::text as key, 'Consultores pausados'::text as label, count(*)::integer as total
			from operation_paused_consultants
			where store_id = $1::uuid

			union all

			select 'current_status'::text as key, 'Status operacionais ativos'::text as label, count(*)::integer as total
			from operation_current_status
			where store_id = $1::uuid

			union all

			select 'status_sessions'::text as key, 'Sessoes operacionais historicas'::text as label, count(*)::integer as total
			from operation_status_sessions
			where store_id = $1::uuid

			union all

			select 'service_history'::text as key, 'Historico de atendimentos'::text as label, count(*)::integer as total
			from operation_service_history
			where store_id = $1::uuid
		)
		select key, label, total
		from dependency_rows
		where total > 0
		order by label asc;
	`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	dependencies := make([]DeleteDependency, 0)
	for rows.Next() {
		var dependency DeleteDependency
		if err := rows.Scan(&dependency.Key, &dependency.Label, &dependency.Count); err != nil {
			return nil, err
		}

		dependencies = append(dependencies, dependency)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return dependencies, nil
}

func (repository *PostgresRepository) Delete(ctx context.Context, storeID string) error {
	tx, err := repository.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() {
		_ = tx.Rollback(ctx)
	}()

	if _, err := tx.Exec(ctx, `delete from platform_core.tenant_store_charges where store_id = $1::uuid;`, storeID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `delete from store_profiles where store_id = $1::uuid;`, storeID); err != nil {
		return err
	}

	commandTag, err := tx.Exec(ctx, `
		delete from platform_core.tenant_stores
		where id = $1::uuid;
	`, storeID)
	if err != nil {
		return err
	}

	if commandTag.RowsAffected() == 0 {
		return ErrStoreNotFound
	}

	return tx.Commit(ctx)
}

func buildListAccessibleQuery(principal auth.Principal, input ListInput) (string, []any) {
	activeClause := ""
	if !input.IncludeInactive {
		activeClause = " and s.is_active = true"
	}

	switch principal.Role {
	case auth.RolePlatformAdmin:
		if strings.TrimSpace(input.TenantID) != "" {
			return storeSelectBase() + `
				where s.tenant_id = $1::uuid
				` + activeClause + `
				order by s.sort_order asc, s.created_at asc;
			`, []any{input.TenantID}
		}

		return storeSelectBase() + `
			where 1 = 1
			` + activeClause + `
			order by s.sort_order asc, s.created_at asc;
		`, nil
	case auth.RoleOwner, auth.RoleMarketing:
		return storeSelectBase() + `
			where s.tenant_id = $1::uuid
			` + activeClause + `
			order by s.sort_order asc, s.created_at asc;
		`, []any{principal.TenantID}
	default:
		return storeSelectBase() + `
			where s.tenant_id = $1::uuid
			  and s.id::text = any($2)
			` + activeClause + `
			order by s.sort_order asc, s.created_at asc;
		`, []any{principal.TenantID, append([]string{}, principal.StoreIDs...)}
	}
}

func buildFindAccessibleQuery(principal auth.Principal, storeID string) (string, []any) {
	switch principal.Role {
	case auth.RolePlatformAdmin:
		return storeSelectBase() + `
			where s.id = $1::uuid
			limit 1;
		`, []any{storeID}
	case auth.RoleOwner, auth.RoleMarketing:
		return storeSelectBase() + `
			where s.id = $1::uuid
			  and s.tenant_id = $2::uuid
			limit 1;
		`, []any{storeID, principal.TenantID}
	default:
		return storeSelectBase() + `
			where s.id = $1::uuid
			  and s.tenant_id = $2::uuid
			  and s.id::text = any($3)
			limit 1;
		`, []any{storeID, principal.TenantID, append([]string{}, principal.StoreIDs...)}
	}
}

func storeSelectBase() string {
	return `
		select
			s.id::text,
			s.tenant_id::text,
			s.code,
			s.name,
			s.city,
			coalesce(profile.default_template_id, '') as default_template_id,
			coalesce(profile.monthly_goal, 0)::float8 as monthly_goal,
			coalesce(profile.weekly_goal, 0)::float8 as weekly_goal,
			coalesce(profile.avg_ticket_goal, 0)::float8 as avg_ticket_goal,
			coalesce(profile.conversion_goal, 0)::float8 as conversion_goal,
			coalesce(profile.pa_goal, 0)::float8 as pa_goal,
			s.is_active,
			s.created_at,
			s.updated_at
		from platform_core.tenant_stores s
		left join store_profiles profile on profile.store_id = s.id
	`
}

func upsertStoreProfile(ctx context.Context, tx pgx.Tx, store Store) error {
	_, err := tx.Exec(ctx, `
		insert into store_profiles (
			store_id,
			default_template_id,
			monthly_goal,
			weekly_goal,
			avg_ticket_goal,
			conversion_goal,
			pa_goal
		)
		values (
			$1::uuid,
			$2,
			$3,
			$4,
			$5,
			$6,
			$7
		)
		on conflict (store_id) do update
		set
			default_template_id = excluded.default_template_id,
			monthly_goal = excluded.monthly_goal,
			weekly_goal = excluded.weekly_goal,
			avg_ticket_goal = excluded.avg_ticket_goal,
			conversion_goal = excluded.conversion_goal,
			pa_goal = excluded.pa_goal,
			updated_at = now();
	`,
		store.ID,
		strings.TrimSpace(store.DefaultTemplateID),
		store.MonthlyGoal,
		store.WeeklyGoal,
		store.AvgTicketGoal,
		store.ConversionGoal,
		store.PAGoal,
	)
	return err
}

func scanStore(row pgx.Row) (Store, error) {
	var store Store
	err := row.Scan(
		&store.ID,
		&store.TenantID,
		&store.Code,
		&store.Name,
		&store.City,
		&store.DefaultTemplateID,
		&store.MonthlyGoal,
		&store.WeeklyGoal,
		&store.AvgTicketGoal,
		&store.ConversionGoal,
		&store.PAGoal,
		&store.Active,
		&store.CreatedAt,
		&store.UpdatedAt,
	)
	if err != nil {
		return Store{}, err
	}

	store.Code = strings.ToUpper(strings.TrimSpace(store.Code))
	store.Name = strings.TrimSpace(store.Name)
	store.City = strings.TrimSpace(store.City)
	store.DefaultTemplateID = strings.TrimSpace(store.DefaultTemplateID)

	return store, nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}

	return false
}
