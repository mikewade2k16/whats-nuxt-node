package core

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	pool              *pgxpool.Pool
	defaultUsersLimit int
}

const (
	defaultAtendimentoUsersLimit     = 3
	defaultAtendimentoInstancesLimit = 1
)

func NewService(pool *pgxpool.Pool, defaultUsersLimit int) *Service {
	return &Service{pool: pool, defaultUsersLimit: defaultUsersLimit}
}

func (s *Service) UserCanManageTenant(ctx context.Context, tenantID, userID string, isPlatformAdmin bool) (bool, error) {
	if isPlatformAdmin {
		return true, nil
	}

	var exists bool
	err := s.pool.QueryRow(
		ctx,
		`SELECT EXISTS(
			SELECT 1 FROM tenant_users
			WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'
		)`,
		tenantID,
		userID,
	).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check tenant membership: %w", err)
	}

	return exists, nil
}

func (s *Service) ResolveLimit(ctx context.Context, tenantID, moduleCode, limitKey string) (ResolvedLimit, error) {
	limit, err := s.resolveLimit(ctx, s.pool, tenantID, moduleCode, limitKey)
	if err != nil {
		return ResolvedLimit{}, err
	}

	return s.applyDefaultLimit(moduleCode, limitKey, limit), nil
}

func (s *Service) AssignTenantUserToModule(ctx context.Context, input AssignTenantUserInput) (AssignTenantUserOutput, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return AssignTenantUserOutput{}, fmt.Errorf("begin tx: %w", err)
	}
	defer func() {
		_ = tx.Rollback(ctx)
	}()

	if err := ensureTenantActive(ctx, tx, input.TenantID); err != nil {
		return AssignTenantUserOutput{}, err
	}

	moduleID, err := findActiveTenantModule(ctx, tx, input.TenantID, input.ModuleCode)
	if err != nil {
		return AssignTenantUserOutput{}, err
	}

	if err := ensureTenantUserActive(ctx, tx, input.TenantID, input.TenantUserID); err != nil {
		return AssignTenantUserOutput{}, err
	}

	existingID, hasExisting, err := findActiveAssignment(ctx, tx, input.TenantUserID, moduleID)
	if err != nil {
		return AssignTenantUserOutput{}, err
	}

	resolvedLimit, err := s.resolveLimit(ctx, tx, input.TenantID, input.ModuleCode, input.LimitKey)
	if err != nil {
		return AssignTenantUserOutput{}, err
	}
	resolvedLimit = s.applyDefaultLimit(input.ModuleCode, input.LimitKey, resolvedLimit)

	activeUsers, err := countActiveUsersByModule(ctx, tx, input.TenantID, moduleID)
	if err != nil {
		return AssignTenantUserOutput{}, err
	}

	if hasExisting {
		if err := tx.Commit(ctx); err != nil {
			return AssignTenantUserOutput{}, fmt.Errorf("commit idempotent assign tx: %w", err)
		}
		return AssignTenantUserOutput{
			AssignmentID:    existingID,
			AlreadyAssigned: true,
			ResolvedLimit:   resolvedLimit,
			ActiveUsers:     activeUsers,
		}, nil
	}

	if !resolvedLimit.IsUnlimited {
		if resolvedLimit.Value == nil {
			return AssignTenantUserOutput{}, ErrLimitNotConfigured
		}
		if activeUsers >= *resolvedLimit.Value {
			return AssignTenantUserOutput{}, ErrLimitReached
		}
	}

	assignmentID, err := upsertAssignment(ctx, tx, input, moduleID)
	if err != nil {
		return AssignTenantUserOutput{}, err
	}

	activeUsers, err = countActiveUsersByModule(ctx, tx, input.TenantID, moduleID)
	if err != nil {
		return AssignTenantUserOutput{}, err
	}

	if err := insertAssignAudit(ctx, tx, input, moduleID, assignmentID, resolvedLimit, activeUsers); err != nil {
		return AssignTenantUserOutput{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return AssignTenantUserOutput{}, fmt.Errorf("commit assign tx: %w", err)
	}

	return AssignTenantUserOutput{
		AssignmentID:    assignmentID,
		AlreadyAssigned: false,
		ResolvedLimit:   resolvedLimit,
		ActiveUsers:     activeUsers,
	}, nil
}

func (s *Service) UnassignTenantUserFromModule(ctx context.Context, input UnassignTenantUserInput) (UnassignTenantUserOutput, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return UnassignTenantUserOutput{}, fmt.Errorf("begin tx: %w", err)
	}
	defer func() {
		_ = tx.Rollback(ctx)
	}()

	if err := ensureTenantActive(ctx, tx, input.TenantID); err != nil {
		return UnassignTenantUserOutput{}, err
	}

	moduleID, err := findActiveTenantModule(ctx, tx, input.TenantID, input.ModuleCode)
	if err != nil {
		return UnassignTenantUserOutput{}, err
	}

	if err := ensureTenantUserExists(ctx, tx, input.TenantID, input.TenantUserID); err != nil {
		return UnassignTenantUserOutput{}, err
	}

	assignmentID, hasExisting, err := findActiveAssignment(ctx, tx, input.TenantUserID, moduleID)
	if err != nil {
		return UnassignTenantUserOutput{}, err
	}

	if !hasExisting {
		activeUsers, countErr := countActiveUsersByModule(ctx, tx, input.TenantID, moduleID)
		if countErr != nil {
			return UnassignTenantUserOutput{}, countErr
		}

		if err := tx.Commit(ctx); err != nil {
			return UnassignTenantUserOutput{}, fmt.Errorf("commit idempotent unassign tx: %w", err)
		}

		return UnassignTenantUserOutput{
			AlreadyUnassigned: true,
			ActiveUsers:       activeUsers,
		}, nil
	}

	if err := deactivateAssignment(ctx, tx, assignmentID, input.ActorUserID); err != nil {
		return UnassignTenantUserOutput{}, err
	}

	activeUsers, err := countActiveUsersByModule(ctx, tx, input.TenantID, moduleID)
	if err != nil {
		return UnassignTenantUserOutput{}, err
	}

	if err := insertUnassignAudit(ctx, tx, input, moduleID, assignmentID, activeUsers); err != nil {
		return UnassignTenantUserOutput{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return UnassignTenantUserOutput{}, fmt.Errorf("commit unassign tx: %w", err)
	}

	return UnassignTenantUserOutput{
		AssignmentID:      assignmentID,
		AlreadyUnassigned: false,
		ActiveUsers:       activeUsers,
	}, nil
}

type querier interface {
	QueryRow(ctx context.Context, sql string, args ...interface{}) pgx.Row
	Exec(ctx context.Context, sql string, arguments ...interface{}) (pgconnCommandTag, error)
}

type pgconnCommandTag interface {
	RowsAffected() int64
}

func (s *Service) resolveLimit(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...interface{}) pgx.Row
}, tenantID, moduleCode, limitKey string) (ResolvedLimit, error) {
	query := `
WITH active_subscription AS (
  SELECT ts.plan_id
  FROM tenant_subscriptions ts
  WHERE ts.tenant_id = $1
    AND ts.status IN ('trialing', 'active')
  ORDER BY ts.created_at DESC
  LIMIT 1
),
tenant_override AS (
  SELECT tml.id, tml.is_unlimited, tml.limit_value_int
  FROM tenant_module_limits tml
  JOIN modules m ON m.id = tml.module_id
  WHERE tml.tenant_id = $1
    AND m.code = $2
    AND tml.limit_key = $3
  LIMIT 1
),
plan_limit AS (
  SELECT pml.id, pml.is_unlimited, pml.limit_value_int
  FROM plan_module_limits pml
  JOIN modules m ON m.id = pml.module_id
  JOIN active_subscription s ON s.plan_id = pml.plan_id
  WHERE m.code = $2
    AND pml.limit_key = $3
  LIMIT 1
)
SELECT
  COALESCE(tover.is_unlimited, pl.is_unlimited, false) AS is_unlimited,
  COALESCE(tover.limit_value_int, pl.limit_value_int) AS limit_value_int,
  CASE
    WHEN tover.id IS NOT NULL THEN 'tenant_override'
    WHEN pl.id IS NOT NULL THEN 'plan_limit'
    ELSE 'default'
  END AS source
FROM tenant_override tover
FULL OUTER JOIN plan_limit pl ON true;
`

	var limit ResolvedLimit
	var value *int
	err := q.QueryRow(ctx, query, tenantID, moduleCode, limitKey).Scan(&limit.IsUnlimited, &value, &limit.Source)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			limit = ResolvedLimit{IsUnlimited: false, Source: "default"}
			return limit, nil
		}
		return ResolvedLimit{}, fmt.Errorf("resolve limit query: %w", err)
	}
	limit.Value = value
	return limit, nil
}

func (s *Service) applyDefaultLimit(moduleCode, limitKey string, limit ResolvedLimit) ResolvedLimit {
	if limit.IsUnlimited {
		return limit
	}
	if limit.Value != nil {
		return limit
	}
	if limitKey == "users" && s.defaultUsersLimit > 0 {
		value := s.defaultUsersLimit
		if moduleCode == "atendimento" {
			value = defaultAtendimentoUsersLimit
		}
		limit.Value = &value
		if limit.Source == "" {
			limit.Source = "default"
		}
	}
	if moduleCode == "atendimento" && limitKey == "instances" {
		value := defaultAtendimentoInstancesLimit
		limit.Value = &value
		if limit.Source == "" {
			limit.Source = "default"
		}
	}
	if limit.Source == "" {
		limit.Source = "default"
	}
	return limit
}

func ensureTenantActive(ctx context.Context, tx pgx.Tx, tenantID string) error {
	var status string
	err := tx.QueryRow(
		ctx,
		`SELECT status
		 FROM tenants
		 WHERE id = $1 AND deleted_at IS NULL`,
		tenantID,
	).Scan(&status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return fmt.Errorf("load tenant status: %w", err)
	}

	if status != "active" && status != "trialing" {
		return ErrForbidden
	}
	return nil
}

func findActiveTenantModule(ctx context.Context, tx pgx.Tx, tenantID, moduleCode string) (string, error) {
	var moduleID string
	err := tx.QueryRow(
		ctx,
		`SELECT m.id
		 FROM modules m
		 JOIN tenant_modules tm ON tm.module_id = m.id
		 WHERE tm.tenant_id = $1
		   AND m.code = $2
		   AND tm.status = 'active'
		 LIMIT 1`,
		tenantID,
		moduleCode,
	).Scan(&moduleID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrModuleInactive
		}
		return "", fmt.Errorf("find active tenant module: %w", err)
	}
	return moduleID, nil
}

func ensureTenantUserActive(ctx context.Context, tx pgx.Tx, tenantID, tenantUserID string) error {
	var status string
	err := tx.QueryRow(
		ctx,
		`SELECT status
		 FROM tenant_users
		 WHERE id = $1 AND tenant_id = $2`,
		tenantUserID,
		tenantID,
	).Scan(&status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return fmt.Errorf("load tenant user status: %w", err)
	}
	if status != "active" {
		return ErrUserInactive
	}
	return nil
}

func ensureTenantUserExists(ctx context.Context, tx pgx.Tx, tenantID, tenantUserID string) error {
	var exists bool
	err := tx.QueryRow(
		ctx,
		`SELECT EXISTS(
			SELECT 1
			FROM tenant_users
			WHERE id = $1
			  AND tenant_id = $2
		)`,
		tenantUserID,
		tenantID,
	).Scan(&exists)
	if err != nil {
		return fmt.Errorf("check tenant user existence: %w", err)
	}
	if !exists {
		return ErrNotFound
	}
	return nil
}

func findActiveAssignment(ctx context.Context, tx pgx.Tx, tenantUserID, moduleID string) (assignmentID string, exists bool, err error) {
	err = tx.QueryRow(
		ctx,
		`SELECT id
		 FROM tenant_user_modules
		 WHERE tenant_user_id = $1
		   AND module_id = $2
		   AND status = 'active'
		 LIMIT 1`,
		tenantUserID,
		moduleID,
	).Scan(&assignmentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", false, nil
		}
		return "", false, fmt.Errorf("find existing assignment: %w", err)
	}
	return assignmentID, true, nil
}

func countActiveUsersByModule(ctx context.Context, tx pgx.Tx, tenantID, moduleID string) (int, error) {
	var count int
	err := tx.QueryRow(
		ctx,
		`SELECT COUNT(*)::int
		 FROM tenant_user_modules tum
		 JOIN tenant_users tu ON tu.id = tum.tenant_user_id
		 WHERE tum.tenant_id = $1
		   AND tum.module_id = $2
		   AND tum.status = 'active'
		   AND tu.status = 'active'`,
		tenantID,
		moduleID,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count active module users: %w", err)
	}
	return count, nil
}

func upsertAssignment(ctx context.Context, tx pgx.Tx, input AssignTenantUserInput, moduleID string) (string, error) {
	var assignmentID string
	err := tx.QueryRow(
		ctx,
		`INSERT INTO tenant_user_modules (
		   tenant_id,
		   tenant_user_id,
		   module_id,
		   status,
		   granted_by_user_id,
		   granted_at,
		   metadata
		 ) VALUES ($1, $2, $3, 'active', $4, now(), '{}'::jsonb)
		 ON CONFLICT (tenant_user_id, module_id)
		 DO UPDATE SET
		   status = 'active',
		   revoked_at = NULL,
		   granted_at = now(),
		   granted_by_user_id = EXCLUDED.granted_by_user_id,
		   updated_at = now()
		 RETURNING id`,
		input.TenantID,
		input.TenantUserID,
		moduleID,
		nullableString(input.ActorUserID),
	).Scan(&assignmentID)
	if err != nil {
		return "", fmt.Errorf("upsert tenant user module assignment: %w", err)
	}
	return assignmentID, nil
}

func deactivateAssignment(ctx context.Context, tx pgx.Tx, assignmentID, actorUserID string) error {
	tag, err := tx.Exec(
		ctx,
		`UPDATE tenant_user_modules
		 SET status = 'inactive',
		     revoked_at = COALESCE(revoked_at, now()),
		     granted_by_user_id = COALESCE(granted_by_user_id, $2),
		     updated_at = now()
		 WHERE id = $1`,
		assignmentID,
		nullableString(actorUserID),
	)
	if err != nil {
		return fmt.Errorf("deactivate tenant user module assignment: %w", err)
	}
	if tag.RowsAffected() < 1 {
		return ErrNotFound
	}
	return nil
}

func insertAssignAudit(
	ctx context.Context,
	tx pgx.Tx,
	input AssignTenantUserInput,
	moduleID, assignmentID string,
	limit ResolvedLimit,
	activeUsers int,
) error {
	metadata := map[string]any{
		"moduleCode":          input.ModuleCode,
		"limitKey":            input.LimitKey,
		"resolvedLimit":       limit,
		"activeUsersInModule": activeUsers,
	}
	payload, err := json.Marshal(metadata)
	if err != nil {
		return fmt.Errorf("marshal audit metadata: %w", err)
	}

	_, err = tx.Exec(
		ctx,
		`INSERT INTO audit_logs (
		   tenant_id,
		   user_id,
		   module_id,
		   action,
		   entity_type,
		   entity_id,
		   metadata
		 ) VALUES ($1, $2, $3, 'tenant.user.module.assigned', 'tenant_user_module', $4, $5::jsonb)`,
		input.TenantID,
		nullableString(input.ActorUserID),
		moduleID,
		assignmentID,
		string(payload),
	)
	if err != nil {
		return fmt.Errorf("insert assign audit: %w", err)
	}

	return nil
}

func insertUnassignAudit(
	ctx context.Context,
	tx pgx.Tx,
	input UnassignTenantUserInput,
	moduleID, assignmentID string,
	activeUsers int,
) error {
	metadata := map[string]any{
		"moduleCode":          input.ModuleCode,
		"activeUsersInModule": activeUsers,
	}
	payload, err := json.Marshal(metadata)
	if err != nil {
		return fmt.Errorf("marshal unassign audit metadata: %w", err)
	}

	_, err = tx.Exec(
		ctx,
		`INSERT INTO audit_logs (
		   tenant_id,
		   user_id,
		   module_id,
		   action,
		   entity_type,
		   entity_id,
		   metadata
		 ) VALUES ($1, $2, $3, 'tenant.user.module.unassigned', 'tenant_user_module', $4, $5::jsonb)`,
		input.TenantID,
		nullableString(input.ActorUserID),
		moduleID,
		assignmentID,
		string(payload),
	)
	if err != nil {
		return fmt.Errorf("insert unassign audit: %w", err)
	}

	return nil
}

func nullableString(value string) interface{} {
	if value == "" {
		return nil
	}
	return value
}
