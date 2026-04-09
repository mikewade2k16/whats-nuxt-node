package core

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func (s *Service) ListPermissions(ctx context.Context) ([]Permission, error) {
	rows, err := s.pool.Query(
		ctx,
		`SELECT p.id, p.code, p.name, p.description, m.code, p.is_active
		 FROM permissions p
		 LEFT JOIN modules m ON m.id = p.module_id
		 ORDER BY p.code ASC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list permissions: %w", err)
	}
	defer rows.Close()

	items := make([]Permission, 0)
	for rows.Next() {
		var item Permission
		if err := rows.Scan(
			&item.ID,
			&item.Code,
			&item.Name,
			&item.Description,
			&item.ModuleCode,
			&item.IsActive,
		); err != nil {
			return nil, fmt.Errorf("scan permission row: %w", err)
		}
		items = append(items, item)
	}
	if rows.Err() != nil {
		return nil, fmt.Errorf("iterate permission rows: %w", rows.Err())
	}

	return items, nil
}

func (s *Service) ListRoles(ctx context.Context, tenantID string) ([]Role, error) {
	rows, err := s.pool.Query(
		ctx,
		`SELECT r.id,
		        r.tenant_id,
		        m.code AS module_code,
		        r.code,
		        r.name,
		        r.description,
		        r.is_system,
		        r.is_active,
		        COALESCE(array_remove(array_agg(DISTINCT p.code), NULL), '{}') AS permission_codes,
		        r.created_at,
		        r.updated_at
		 FROM roles r
		 LEFT JOIN modules m ON m.id = r.module_id
		 LEFT JOIN role_permissions rp ON rp.role_id = r.id
		 LEFT JOIN permissions p ON p.id = rp.permission_id
		 WHERE r.tenant_id IS NULL OR r.tenant_id = $1
		 GROUP BY r.id, m.code
		 ORDER BY
		   CASE WHEN r.tenant_id IS NULL THEN 0 ELSE 1 END,
		   r.is_system DESC,
		   r.code ASC`,
		tenantID,
	)
	if err != nil {
		return nil, fmt.Errorf("list roles: %w", err)
	}
	defer rows.Close()

	items := make([]Role, 0)
	for rows.Next() {
		var item Role
		if err := rows.Scan(
			&item.ID,
			&item.TenantID,
			&item.ModuleCode,
			&item.Code,
			&item.Name,
			&item.Description,
			&item.IsSystem,
			&item.IsActive,
			&item.PermissionCodes,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan role row: %w", err)
		}
		sort.Strings(item.PermissionCodes)
		items = append(items, item)
	}
	if rows.Err() != nil {
		return nil, fmt.Errorf("iterate role rows: %w", rows.Err())
	}

	return items, nil
}

func (s *Service) CreateRole(ctx context.Context, input CreateRoleInput) (Role, error) {
	code := strings.TrimSpace(input.Code)
	name := strings.TrimSpace(input.Name)
	if code == "" || name == "" {
		return Role{}, ErrInvalidInput
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Role{}, fmt.Errorf("begin create role tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var moduleID interface{}
	if input.ModuleCode != nil && strings.TrimSpace(*input.ModuleCode) != "" {
		foundModuleID, err := findModuleIDByCode(ctx, tx, strings.TrimSpace(*input.ModuleCode))
		if err != nil {
			return Role{}, err
		}
		moduleID = foundModuleID
	}

	var roleID string
	err = tx.QueryRow(
		ctx,
		`INSERT INTO roles (
		   tenant_id,
		   module_id,
		   code,
		   name,
		   description,
		   is_system,
		   is_active,
		   metadata
		 ) VALUES ($1, $2, $3, $4, $5, false, true, '{}'::jsonb)
		 RETURNING id`,
		input.TenantID,
		moduleID,
		code,
		name,
		normalizedStringOrNil(input.Description),
	).Scan(&roleID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return Role{}, ErrInvalidInput
		}
		return Role{}, fmt.Errorf("insert role: %w", err)
	}

	if err := replaceRolePermissions(ctx, tx, roleID, input.PermissionCodes); err != nil {
		return Role{}, err
	}

	role, err := getRoleByID(ctx, tx, input.TenantID, roleID)
	if err != nil {
		return Role{}, err
	}

	if err := insertAuditTx(ctx, tx, auditInput{
		TenantID:   input.TenantID,
		UserID:     input.ActorUserID,
		Action:     "role.created",
		EntityType: "role",
		EntityID:   roleID,
		AfterData:  role,
	}); err != nil {
		return Role{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return Role{}, fmt.Errorf("commit create role tx: %w", err)
	}

	return role, nil
}

func (s *Service) UpdateRole(ctx context.Context, input UpdateRoleInput) (Role, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Role{}, fmt.Errorf("begin update role tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var isSystem bool
	err = tx.QueryRow(
		ctx,
		`SELECT is_system
		 FROM roles
		 WHERE id = $1
		   AND tenant_id = $2`,
		input.RoleID,
		input.TenantID,
	).Scan(&isSystem)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Role{}, ErrNotFound
		}
		return Role{}, fmt.Errorf("load role for update: %w", err)
	}
	if isSystem {
		return Role{}, ErrForbidden
	}

	_, err = tx.Exec(
		ctx,
		`UPDATE roles
		 SET name = COALESCE($3, name),
		     description = COALESCE($4, description),
		     is_active = COALESCE($5, is_active),
		     updated_at = now()
		 WHERE id = $1
		   AND tenant_id = $2`,
		input.RoleID,
		input.TenantID,
		normalizedStringOrNil(input.Name),
		normalizedStringOrNil(input.Description),
		input.IsActive,
	)
	if err != nil {
		return Role{}, fmt.Errorf("update role: %w", err)
	}

	if input.PermissionCodes != nil {
		if err := replaceRolePermissions(ctx, tx, input.RoleID, *input.PermissionCodes); err != nil {
			return Role{}, err
		}
	}

	role, err := getRoleByID(ctx, tx, input.TenantID, input.RoleID)
	if err != nil {
		return Role{}, err
	}

	if err := insertAuditTx(ctx, tx, auditInput{
		TenantID:   input.TenantID,
		UserID:     input.ActorUserID,
		Action:     "role.updated",
		EntityType: "role",
		EntityID:   input.RoleID,
		AfterData:  role,
	}); err != nil {
		return Role{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return Role{}, fmt.Errorf("commit update role tx: %w", err)
	}

	return role, nil
}

func (s *Service) ListTenantUserRoles(ctx context.Context, tenantID, tenantUserID string) ([]TenantUserRole, error) {
	if err := s.ensureTenantUserBelongsToTenant(ctx, tenantID, tenantUserID); err != nil {
		return nil, err
	}

	rows, err := s.pool.Query(
		ctx,
		`SELECT tur.id, r.id, r.code, r.name, r.is_system, tur.assigned_at
		 FROM tenant_user_roles tur
		 JOIN roles r ON r.id = tur.role_id
		 WHERE tur.tenant_user_id = $1
		   AND (r.tenant_id IS NULL OR r.tenant_id = $2)
		 ORDER BY r.code ASC`,
		tenantUserID,
		tenantID,
	)
	if err != nil {
		return nil, fmt.Errorf("list tenant user roles: %w", err)
	}
	defer rows.Close()

	items := make([]TenantUserRole, 0)
	for rows.Next() {
		var item TenantUserRole
		if err := rows.Scan(
			&item.TenantUserRoleID,
			&item.RoleID,
			&item.RoleCode,
			&item.RoleName,
			&item.IsSystem,
			&item.AssignedAt,
		); err != nil {
			return nil, fmt.Errorf("scan tenant user role row: %w", err)
		}
		items = append(items, item)
	}
	if rows.Err() != nil {
		return nil, fmt.Errorf("iterate tenant user role rows: %w", rows.Err())
	}

	return items, nil
}

func (s *Service) AssignRoleToTenantUser(ctx context.Context, input AssignTenantUserRoleInput) (AssignTenantUserRoleOutput, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return AssignTenantUserRoleOutput{}, fmt.Errorf("begin assign role tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := ensureTenantUserBelongsToTenantTx(ctx, tx, input.TenantID, input.TenantUserID); err != nil {
		return AssignTenantUserRoleOutput{}, err
	}

	if _, err := findRoleForTenantTx(ctx, tx, input.TenantID, input.RoleID); err != nil {
		return AssignTenantUserRoleOutput{}, err
	}

	var tenantUserRoleID string
	err = tx.QueryRow(
		ctx,
		`SELECT id
		 FROM tenant_user_roles
		 WHERE tenant_user_id = $1
		   AND role_id = $2
		 LIMIT 1`,
		input.TenantUserID,
		input.RoleID,
	).Scan(&tenantUserRoleID)
	if err == nil {
		if err := tx.Commit(ctx); err != nil {
			return AssignTenantUserRoleOutput{}, fmt.Errorf("commit assign role idempotent tx: %w", err)
		}
		return AssignTenantUserRoleOutput{TenantUserRoleID: tenantUserRoleID, AlreadyAssigned: true}, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return AssignTenantUserRoleOutput{}, fmt.Errorf("check existing tenant user role: %w", err)
	}

	err = tx.QueryRow(
		ctx,
		`INSERT INTO tenant_user_roles (tenant_user_id, role_id, assigned_by_user_id, metadata)
		 VALUES ($1, $2, $3, '{}'::jsonb)
		 RETURNING id`,
		input.TenantUserID,
		input.RoleID,
		nullableString(input.ActorUserID),
	).Scan(&tenantUserRoleID)
	if err != nil {
		return AssignTenantUserRoleOutput{}, fmt.Errorf("insert tenant user role: %w", err)
	}

	if err := insertAuditTx(ctx, tx, auditInput{
		TenantID:   input.TenantID,
		UserID:     input.ActorUserID,
		Action:     "tenant.user.role.assigned",
		EntityType: "tenant_user_role",
		EntityID:   tenantUserRoleID,
		Metadata: map[string]any{
			"tenantUserId": input.TenantUserID,
			"roleId":       input.RoleID,
		},
	}); err != nil {
		return AssignTenantUserRoleOutput{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return AssignTenantUserRoleOutput{}, fmt.Errorf("commit assign role tx: %w", err)
	}

	return AssignTenantUserRoleOutput{TenantUserRoleID: tenantUserRoleID, AlreadyAssigned: false}, nil
}

func (s *Service) RevokeRoleFromTenantUser(ctx context.Context, input RevokeTenantUserRoleInput) (RevokeTenantUserRoleOutput, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return RevokeTenantUserRoleOutput{}, fmt.Errorf("begin revoke role tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := ensureTenantUserBelongsToTenantTx(ctx, tx, input.TenantID, input.TenantUserID); err != nil {
		return RevokeTenantUserRoleOutput{}, err
	}

	if _, err := findRoleForTenantTx(ctx, tx, input.TenantID, input.RoleID); err != nil {
		return RevokeTenantUserRoleOutput{}, err
	}

	var removedID string
	err = tx.QueryRow(
		ctx,
		`DELETE FROM tenant_user_roles
		 WHERE tenant_user_id = $1
		   AND role_id = $2
		 RETURNING id`,
		input.TenantUserID,
		input.RoleID,
	).Scan(&removedID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			if err := tx.Commit(ctx); err != nil {
				return RevokeTenantUserRoleOutput{}, fmt.Errorf("commit revoke role no-op tx: %w", err)
			}
			return RevokeTenantUserRoleOutput{Revoked: false}, nil
		}
		return RevokeTenantUserRoleOutput{}, fmt.Errorf("delete tenant user role: %w", err)
	}

	if err := insertAuditTx(ctx, tx, auditInput{
		TenantID:   input.TenantID,
		UserID:     input.ActorUserID,
		Action:     "tenant.user.role.revoked",
		EntityType: "tenant_user_role",
		EntityID:   removedID,
		Metadata: map[string]any{
			"tenantUserId": input.TenantUserID,
			"roleId":       input.RoleID,
		},
	}); err != nil {
		return RevokeTenantUserRoleOutput{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return RevokeTenantUserRoleOutput{}, fmt.Errorf("commit revoke role tx: %w", err)
	}

	return RevokeTenantUserRoleOutput{Revoked: true}, nil
}

func (s *Service) ensureTenantUserBelongsToTenant(ctx context.Context, tenantID, tenantUserID string) error {
	return ensureTenantUserBelongsToTenantTx(ctx, s.pool, tenantID, tenantUserID)
}

func ensureTenantUserBelongsToTenantTx(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...interface{}) pgx.Row
}, tenantID, tenantUserID string) error {
	var exists bool
	err := q.QueryRow(
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
		return fmt.Errorf("check tenant user binding: %w", err)
	}
	if !exists {
		return ErrNotFound
	}
	return nil
}

func findRoleForTenantTx(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...interface{}) pgx.Row
}, tenantID, roleID string) (Role, error) {
	role, err := getRoleByID(ctx, q, tenantID, roleID)
	if err != nil {
		return Role{}, err
	}
	if !role.IsActive {
		return Role{}, ErrForbidden
	}
	return role, nil
}

func replaceRolePermissions(ctx context.Context, tx pgx.Tx, roleID string, codes []string) error {
	normalizedCodes := normalizeCodes(codes)

	if _, err := tx.Exec(ctx, `DELETE FROM role_permissions WHERE role_id = $1`, roleID); err != nil {
		return fmt.Errorf("clear role permissions: %w", err)
	}

	if len(normalizedCodes) == 0 {
		return nil
	}

	rows, err := tx.Query(
		ctx,
		`SELECT code
		 FROM permissions
		 WHERE code = ANY($1)
		   AND is_active = true`,
		normalizedCodes,
	)
	if err != nil {
		return fmt.Errorf("validate permission codes: %w", err)
	}
	defer rows.Close()

	found := make(map[string]struct{}, len(normalizedCodes))
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err != nil {
			return fmt.Errorf("scan permission validation row: %w", err)
		}
		found[code] = struct{}{}
	}
	if rows.Err() != nil {
		return fmt.Errorf("iterate permission validation rows: %w", rows.Err())
	}

	for _, code := range normalizedCodes {
		if _, ok := found[code]; !ok {
			return ErrInvalidInput
		}
	}

	if _, err := tx.Exec(
		ctx,
		`INSERT INTO role_permissions (role_id, permission_id)
		 SELECT $1, p.id
		 FROM permissions p
		 WHERE p.code = ANY($2)
		 ON CONFLICT (role_id, permission_id) DO NOTHING`,
		roleID,
		normalizedCodes,
	); err != nil {
		return fmt.Errorf("insert role permissions: %w", err)
	}

	return nil
}

func getRoleByID(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...interface{}) pgx.Row
}, tenantID, roleID string) (Role, error) {
	var role Role
	err := q.QueryRow(
		ctx,
		`SELECT r.id,
		        r.tenant_id,
		        m.code AS module_code,
		        r.code,
		        r.name,
		        r.description,
		        r.is_system,
		        r.is_active,
		        COALESCE(array_remove(array_agg(DISTINCT p.code), NULL), '{}') AS permission_codes,
		        r.created_at,
		        r.updated_at
		 FROM roles r
		 LEFT JOIN modules m ON m.id = r.module_id
		 LEFT JOIN role_permissions rp ON rp.role_id = r.id
		 LEFT JOIN permissions p ON p.id = rp.permission_id
		 WHERE r.id = $1
		   AND (r.tenant_id IS NULL OR r.tenant_id = $2)
		 GROUP BY r.id, m.code`,
		roleID,
		tenantID,
	).Scan(
		&role.ID,
		&role.TenantID,
		&role.ModuleCode,
		&role.Code,
		&role.Name,
		&role.Description,
		&role.IsSystem,
		&role.IsActive,
		&role.PermissionCodes,
		&role.CreatedAt,
		&role.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Role{}, ErrNotFound
		}
		return Role{}, fmt.Errorf("get role by id: %w", err)
	}

	sort.Strings(role.PermissionCodes)
	return role, nil
}

func normalizeCodes(raw []string) []string {
	set := make(map[string]struct{}, len(raw))
	for _, item := range raw {
		normalized := strings.TrimSpace(item)
		if normalized == "" {
			continue
		}
		set[normalized] = struct{}{}
	}
	codes := make([]string, 0, len(set))
	for code := range set {
		codes = append(codes, code)
	}
	sort.Strings(codes)
	return codes
}

func normalizedStringOrNil(value *string) interface{} {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return trimmed
}
