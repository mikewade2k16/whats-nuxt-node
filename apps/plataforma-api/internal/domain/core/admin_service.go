package core

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

func (s *Service) HasTenantPermission(ctx context.Context, tenantID, userID, permissionCode string, isPlatformAdmin bool) (bool, error) {
	if isPlatformAdmin {
		return true, nil
	}

	var isOwner bool
	err := s.pool.QueryRow(
		ctx,
		`SELECT is_owner
		 FROM tenant_users
		 WHERE tenant_id = $1
		   AND user_id = $2
		   AND status = 'active'
		 LIMIT 1`,
		tenantID,
		userID,
	).Scan(&isOwner)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, fmt.Errorf("load tenant membership: %w", err)
	}
	if isOwner {
		return true, nil
	}

	var allowed bool
	err = s.pool.QueryRow(
		ctx,
		`SELECT EXISTS(
			SELECT 1
			FROM tenant_users tu
			JOIN tenant_user_roles tur ON tur.tenant_user_id = tu.id
			JOIN roles r ON r.id = tur.role_id
			JOIN role_permissions rp ON rp.role_id = r.id
			JOIN permissions p ON p.id = rp.permission_id
			WHERE tu.tenant_id = $1
			  AND tu.user_id = $2
			  AND tu.status = 'active'
			  AND r.is_active = true
			  AND p.is_active = true
			  AND p.code = $3
			  AND (r.tenant_id IS NULL OR r.tenant_id = $1)
		)`,
		tenantID,
		userID,
		permissionCode,
	).Scan(&allowed)
	if err != nil {
		return false, fmt.Errorf("check tenant permission: %w", err)
	}

	return allowed, nil
}

func (s *Service) ListTenants(ctx context.Context, userID string, isPlatformAdmin bool) ([]Tenant, error) {
	var rows pgx.Rows
	var err error

	if isPlatformAdmin {
		rows, err = s.pool.Query(
			ctx,
			`SELECT id, slug, name, status::text, contact_email, timezone, locale, created_at, updated_at, deleted_at
			 FROM tenants
			 ORDER BY created_at DESC`,
		)
	} else {
		rows, err = s.pool.Query(
			ctx,
			`SELECT t.id, t.slug, t.name, t.status::text, t.contact_email, t.timezone, t.locale, t.created_at, t.updated_at, t.deleted_at
			 FROM tenants t
			 JOIN tenant_users tu ON tu.tenant_id = t.id
			 WHERE tu.user_id = $1
			   AND tu.status = 'active'
			 ORDER BY t.created_at DESC`,
			userID,
		)
	}
	if err != nil {
		return nil, fmt.Errorf("list tenants: %w", err)
	}
	defer rows.Close()

	tenants := make([]Tenant, 0)
	for rows.Next() {
		var item Tenant
		if err := rows.Scan(
			&item.ID,
			&item.Slug,
			&item.Name,
			&item.Status,
			&item.ContactEmail,
			&item.Timezone,
			&item.Locale,
			&item.CreatedAt,
			&item.UpdatedAt,
			&item.DeletedAt,
		); err != nil {
			return nil, fmt.Errorf("scan tenant row: %w", err)
		}
		tenants = append(tenants, item)
	}

	if rows.Err() != nil {
		return nil, fmt.Errorf("iterate tenant rows: %w", rows.Err())
	}

	return tenants, nil
}

func (s *Service) CreateTenant(ctx context.Context, input CreateTenantInput) (Tenant, error) {
	status := strings.TrimSpace(input.Status)
	if status == "" {
		status = "trialing"
	}
	locale := strings.TrimSpace(input.Locale)
	if locale == "" {
		locale = "pt-BR"
	}
	timezone := strings.TrimSpace(input.Timezone)
	if timezone == "" {
		timezone = "America/Sao_Paulo"
	}

	var tenant Tenant
	err := s.pool.QueryRow(
		ctx,
		`INSERT INTO tenants (slug, name, status, contact_email, timezone, locale)
		 VALUES ($1, $2, $3::tenant_status, $4, $5, $6)
		 RETURNING id, slug, name, status::text, contact_email, timezone, locale, created_at, updated_at, deleted_at`,
		strings.TrimSpace(input.Slug),
		strings.TrimSpace(input.Name),
		status,
		nullableString(strings.TrimSpace(input.ContactEmail)),
		timezone,
		locale,
	).Scan(
		&tenant.ID,
		&tenant.Slug,
		&tenant.Name,
		&tenant.Status,
		&tenant.ContactEmail,
		&tenant.Timezone,
		&tenant.Locale,
		&tenant.CreatedAt,
		&tenant.UpdatedAt,
		&tenant.DeletedAt,
	)
	if err != nil {
		return Tenant{}, fmt.Errorf("create tenant: %w", err)
	}

	if strings.TrimSpace(input.ActorUserID) != "" {
		_ = s.insertAudit(ctx, auditInput{
			TenantID:   tenant.ID,
			UserID:     input.ActorUserID,
			Action:     "tenant.created",
			EntityType: "tenant",
			EntityID:   tenant.ID,
			AfterData:  tenant,
		})
	}

	return tenant, nil
}

func (s *Service) GetTenantByID(ctx context.Context, tenantID string) (Tenant, error) {
	var tenant Tenant
	err := s.pool.QueryRow(
		ctx,
		`SELECT id, slug, name, status::text, contact_email, timezone, locale, created_at, updated_at, deleted_at
		 FROM tenants
		 WHERE id = $1`,
		tenantID,
	).Scan(
		&tenant.ID,
		&tenant.Slug,
		&tenant.Name,
		&tenant.Status,
		&tenant.ContactEmail,
		&tenant.Timezone,
		&tenant.Locale,
		&tenant.CreatedAt,
		&tenant.UpdatedAt,
		&tenant.DeletedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Tenant{}, ErrNotFound
		}
		return Tenant{}, fmt.Errorf("get tenant by id: %w", err)
	}

	return tenant, nil
}

func (s *Service) UpdateTenant(ctx context.Context, input UpdateTenantInput) (Tenant, error) {
	var tenant Tenant
	err := s.pool.QueryRow(
		ctx,
		`UPDATE tenants
		 SET name = COALESCE($2, name),
		     status = COALESCE($3::tenant_status, status),
		     contact_email = COALESCE($4, contact_email),
		     timezone = COALESCE($5, timezone),
		     locale = COALESCE($6, locale),
		     updated_at = now()
		 WHERE id = $1
		 RETURNING id, slug, name, status::text, contact_email, timezone, locale, created_at, updated_at, deleted_at`,
		input.TenantID,
		input.Name,
		input.Status,
		input.ContactEmail,
		input.Timezone,
		input.Locale,
	).Scan(
		&tenant.ID,
		&tenant.Slug,
		&tenant.Name,
		&tenant.Status,
		&tenant.ContactEmail,
		&tenant.Timezone,
		&tenant.Locale,
		&tenant.CreatedAt,
		&tenant.UpdatedAt,
		&tenant.DeletedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Tenant{}, ErrNotFound
		}
		return Tenant{}, fmt.Errorf("update tenant: %w", err)
	}

	if strings.TrimSpace(input.ActorUserID) != "" {
		_ = s.insertAudit(ctx, auditInput{
			TenantID:   tenant.ID,
			UserID:     input.ActorUserID,
			Action:     "tenant.updated",
			EntityType: "tenant",
			EntityID:   tenant.ID,
			AfterData:  tenant,
		})
	}

	return tenant, nil
}

func (s *Service) ListTenantUsers(ctx context.Context, tenantID string) ([]TenantUser, error) {
	rows, err := s.pool.Query(
		ctx,
		`SELECT tu.id, u.id, u.name, u.email::text, tu.status::text, tu.is_owner, tu.joined_at, tu.last_seen_at
		 FROM tenant_users tu
		 JOIN users u ON u.id = tu.user_id
		 WHERE tu.tenant_id = $1
		 ORDER BY tu.created_at ASC`,
		tenantID,
	)
	if err != nil {
		return nil, fmt.Errorf("list tenant users: %w", err)
	}
	defer rows.Close()

	users := make([]TenantUser, 0)
	for rows.Next() {
		var item TenantUser
		if err := rows.Scan(
			&item.TenantUserID,
			&item.UserID,
			&item.Name,
			&item.Email,
			&item.Status,
			&item.IsOwner,
			&item.JoinedAt,
			&item.LastSeenAt,
		); err != nil {
			return nil, fmt.Errorf("scan tenant user row: %w", err)
		}
		users = append(users, item)
	}
	if rows.Err() != nil {
		return nil, fmt.Errorf("iterate tenant user rows: %w", rows.Err())
	}

	return users, nil
}

func (s *Service) InviteTenantUser(ctx context.Context, input InviteTenantUserInput) (InviteTenantUserOutput, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return InviteTenantUserOutput{}, fmt.Errorf("begin invite tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := ensureTenantExists(ctx, tx, input.TenantID); err != nil {
		return InviteTenantUserOutput{}, err
	}

	email := strings.TrimSpace(strings.ToLower(input.Email))
	name := strings.TrimSpace(input.Name)
	if name == "" {
		name = email
	}

	userID, createdUser, err := upsertUserByEmail(ctx, tx, email, name, input.Password)
	if err != nil {
		return InviteTenantUserOutput{}, err
	}

	tenantUserID, err := upsertTenantUser(ctx, tx, input.TenantID, userID, input.IsOwner)
	if err != nil {
		return InviteTenantUserOutput{}, err
	}

	if len(input.RoleCodes) > 0 {
		if err := assignRoles(ctx, tx, input.TenantID, tenantUserID, input.ActorUserID, input.RoleCodes); err != nil {
			return InviteTenantUserOutput{}, err
		}
	}

	metadata := map[string]any{
		"email":     email,
		"roleCodes": input.RoleCodes,
		"isOwner":   input.IsOwner,
	}
	if err := insertAuditTx(ctx, tx, auditInput{
		TenantID:   input.TenantID,
		UserID:     input.ActorUserID,
		Action:     "tenant.user.invited",
		EntityType: "tenant_user",
		EntityID:   tenantUserID,
		Metadata:   metadata,
	}); err != nil {
		return InviteTenantUserOutput{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return InviteTenantUserOutput{}, fmt.Errorf("commit invite tx: %w", err)
	}

	return InviteTenantUserOutput{
		TenantUserID: tenantUserID,
		UserID:       userID,
		CreatedUser:  createdUser,
	}, nil
}

func (s *Service) ListTenantModules(ctx context.Context, tenantID string) ([]TenantModule, error) {
	rows, err := s.pool.Query(
		ctx,
		`SELECT m.id,
		        m.code,
		        m.name,
		        m.is_core,
		        CASE
		          WHEN tm.status IS NOT NULL THEN tm.status::text
		          WHEN inherited_module.is_active THEN 'active'
		          ELSE 'inactive'
		        END AS status,
		        COALESCE(tm.source::text, CASE WHEN inherited_module.is_active THEN 'plan' ELSE '' END) AS source,
		        tm.activated_at,
		        tm.deactivated_at
		 FROM modules m
		 LEFT JOIN tenant_modules tm
		   ON tm.module_id = m.id
		  AND tm.tenant_id = $1
		 LEFT JOIN LATERAL (
		   SELECT true AS is_active
		   FROM tenant_subscriptions ts
		   JOIN plan_modules pm
		     ON pm.plan_id = ts.plan_id
		    AND pm.enabled = true
		   WHERE ts.tenant_id = $1
		     AND ts.status IN ('trialing', 'active')
		     AND pm.module_id = m.id
		   LIMIT 1
		 ) inherited_module ON true
		 WHERE m.is_active = true
		 ORDER BY m.is_core DESC, m.code ASC`,
		tenantID,
	)
	if err != nil {
		return nil, fmt.Errorf("list tenant modules: %w", err)
	}
	defer rows.Close()

	items := make([]TenantModule, 0)
	for rows.Next() {
		var item TenantModule
		if err := rows.Scan(
			&item.ModuleID,
			&item.Code,
			&item.Name,
			&item.IsCore,
			&item.Status,
			&item.Source,
			&item.ActivatedAt,
			&item.DeactivatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan tenant module row: %w", err)
		}
		items = append(items, item)
	}
	if rows.Err() != nil {
		return nil, fmt.Errorf("iterate tenant module rows: %w", rows.Err())
	}

	return items, nil
}

func (s *Service) SetTenantModuleStatus(ctx context.Context, input SetTenantModuleStatusInput) (TenantModule, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return TenantModule{}, fmt.Errorf("begin set module status tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	moduleID, err := findModuleIDByCode(ctx, tx, input.ModuleCode)
	if err != nil {
		return TenantModule{}, err
	}

	status := strings.TrimSpace(strings.ToLower(input.Status))
	if status != "active" && status != "inactive" && status != "suspended" {
		return TenantModule{}, ErrInvalidInput
	}

	if _, err := tx.Exec(
		ctx,
		`INSERT INTO tenant_modules (tenant_id, module_id, status, source, activated_at, deactivated_at)
		 VALUES (
		   $1,
		   $2,
		   $3::tenant_module_status,
		   CASE WHEN $3 = 'active' THEN 'custom'::module_source ELSE 'custom'::module_source END,
		   CASE WHEN $3 = 'active' THEN now() ELSE now() END,
		   CASE WHEN $3 = 'active' THEN NULL ELSE now() END
		 )
		 ON CONFLICT (tenant_id, module_id)
		 DO UPDATE SET
		   status = EXCLUDED.status,
		   source = EXCLUDED.source,
		   activated_at = CASE WHEN EXCLUDED.status = 'active' THEN now() ELSE tenant_modules.activated_at END,
		   deactivated_at = CASE WHEN EXCLUDED.status = 'active' THEN NULL ELSE now() END,
		   updated_at = now()`,
		input.TenantID,
		moduleID,
		status,
	); err != nil {
		return TenantModule{}, fmt.Errorf("upsert tenant module status: %w", err)
	}

	if err := insertAuditTx(ctx, tx, auditInput{
		TenantID:   input.TenantID,
		UserID:     input.ActorUserID,
		ModuleID:   moduleID,
		Action:     "tenant.module.updated",
		EntityType: "tenant_module",
		EntityID:   moduleID,
		Metadata: map[string]any{
			"moduleCode": input.ModuleCode,
			"status":     status,
		},
	}); err != nil {
		return TenantModule{}, err
	}

	var module TenantModule
	err = tx.QueryRow(
		ctx,
		`SELECT m.id, m.code, m.name, m.is_core, tm.status::text, tm.source::text, tm.activated_at, tm.deactivated_at
		 FROM modules m
		 JOIN tenant_modules tm ON tm.module_id = m.id
		 WHERE tm.tenant_id = $1 AND m.id = $2`,
		input.TenantID,
		moduleID,
	).Scan(
		&module.ModuleID,
		&module.Code,
		&module.Name,
		&module.IsCore,
		&module.Status,
		&module.Source,
		&module.ActivatedAt,
		&module.DeactivatedAt,
	)
	if err != nil {
		return TenantModule{}, fmt.Errorf("load tenant module after status update: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return TenantModule{}, fmt.Errorf("commit set module status tx: %w", err)
	}

	return module, nil
}

func (s *Service) UpsertTenantModuleLimit(ctx context.Context, input UpsertTenantModuleLimitInput) (UpsertTenantModuleLimitOutput, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return UpsertTenantModuleLimitOutput{}, fmt.Errorf("begin upsert limit tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	moduleID, err := findModuleIDByCode(ctx, tx, input.ModuleCode)
	if err != nil {
		return UpsertTenantModuleLimitOutput{}, err
	}

	value := input.ValueInt
	if input.IsUnlimited {
		value = nil
	}
	source := strings.TrimSpace(input.Source)
	if source == "" {
		source = "manual_override"
	}

	var limitID string
	err = tx.QueryRow(
		ctx,
		`INSERT INTO tenant_module_limits (
		   tenant_id,
		   module_id,
		   limit_key,
		   limit_value_int,
		   is_unlimited,
		   source,
		   notes,
		   created_by_user_id,
		   metadata
		 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '{}'::jsonb)
		 ON CONFLICT (tenant_id, module_id, limit_key)
		 DO UPDATE SET
		   limit_value_int = EXCLUDED.limit_value_int,
		   is_unlimited = EXCLUDED.is_unlimited,
		   source = EXCLUDED.source,
		   notes = EXCLUDED.notes,
		   created_by_user_id = EXCLUDED.created_by_user_id,
		   updated_at = now()
		 RETURNING id`,
		input.TenantID,
		moduleID,
		input.LimitKey,
		value,
		input.IsUnlimited,
		source,
		input.Notes,
		nullableString(input.ActorUserID),
	).Scan(&limitID)
	if err != nil {
		return UpsertTenantModuleLimitOutput{}, fmt.Errorf("upsert tenant module limit: %w", err)
	}

	resolved, err := s.resolveLimit(ctx, tx, input.TenantID, input.ModuleCode, input.LimitKey)
	if err != nil {
		return UpsertTenantModuleLimitOutput{}, err
	}
	resolved = s.applyDefaultLimit(input.ModuleCode, input.LimitKey, resolved)

	if err := insertAuditTx(ctx, tx, auditInput{
		TenantID:   input.TenantID,
		UserID:     input.ActorUserID,
		ModuleID:   moduleID,
		Action:     "tenant.limit.updated",
		EntityType: "tenant_module_limit",
		EntityID:   limitID,
		Metadata: map[string]any{
			"moduleCode": input.ModuleCode,
			"limitKey":   input.LimitKey,
			"resolved":   resolved,
		},
	}); err != nil {
		return UpsertTenantModuleLimitOutput{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return UpsertTenantModuleLimitOutput{}, fmt.Errorf("commit upsert limit tx: %w", err)
	}

	return UpsertTenantModuleLimitOutput{LimitID: limitID, Resolved: resolved}, nil
}

func ensureTenantExists(ctx context.Context, tx pgx.Tx, tenantID string) error {
	var exists bool
	err := tx.QueryRow(
		ctx,
		`SELECT EXISTS(SELECT 1 FROM tenants WHERE id = $1)`,
		tenantID,
	).Scan(&exists)
	if err != nil {
		return fmt.Errorf("check tenant existence: %w", err)
	}
	if !exists {
		return ErrNotFound
	}
	return nil
}

func upsertUserByEmail(ctx context.Context, tx pgx.Tx, email, name, password string) (userID string, created bool, err error) {
	err = tx.QueryRow(ctx, `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`, email).Scan(&userID)
	if err == nil {
		_, err = tx.Exec(
			ctx,
			`UPDATE users SET name = $2, status = 'active', updated_at = now() WHERE id = $1`,
			userID,
			name,
		)
		if err != nil {
			return "", false, fmt.Errorf("update user by email: %w", err)
		}
		return userID, false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", false, fmt.Errorf("find user by email for invite: %w", err)
	}

	if strings.TrimSpace(password) == "" {
		password = fmt.Sprintf("temp-%d", time.Now().UnixNano())
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", false, fmt.Errorf("hash invite password: %w", err)
	}

	err = tx.QueryRow(
		ctx,
		`INSERT INTO users (name, email, password_hash, status, email_verified_at)
		 VALUES ($1, $2, $3, 'active', now())
		 RETURNING id`,
		name,
		email,
		string(hash),
	).Scan(&userID)
	if err != nil {
		return "", false, fmt.Errorf("insert invited user: %w", err)
	}

	return userID, true, nil
}

func upsertTenantUser(ctx context.Context, tx pgx.Tx, tenantID, userID string, isOwner bool) (string, error) {
	var tenantUserID string
	err := tx.QueryRow(
		ctx,
		`INSERT INTO tenant_users (tenant_id, user_id, status, is_owner, joined_at, metadata)
		 VALUES ($1, $2, 'active', $3, now(), '{}'::jsonb)
		 ON CONFLICT (tenant_id, user_id)
		 DO UPDATE SET
		   status = 'active',
		   is_owner = CASE WHEN EXCLUDED.is_owner THEN true ELSE tenant_users.is_owner END,
		   joined_at = COALESCE(tenant_users.joined_at, now()),
		   updated_at = now()
		 RETURNING id`,
		tenantID,
		userID,
		isOwner,
	).Scan(&tenantUserID)
	if err != nil {
		return "", fmt.Errorf("upsert tenant user: %w", err)
	}
	return tenantUserID, nil
}

func assignRoles(ctx context.Context, tx pgx.Tx, tenantID, tenantUserID, actorUserID string, roleCodes []string) error {
	for _, roleCodeRaw := range roleCodes {
		roleCode := strings.TrimSpace(roleCodeRaw)
		if roleCode == "" {
			continue
		}

		var roleID string
		err := tx.QueryRow(
			ctx,
			`SELECT id
			 FROM roles
			 WHERE code = $1
			   AND is_active = true
			   AND (tenant_id IS NULL OR tenant_id = $2)
			 ORDER BY CASE WHEN tenant_id = $2 THEN 0 ELSE 1 END
			 LIMIT 1`,
			roleCode,
			tenantID,
		).Scan(&roleID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrNotFound
			}
			return fmt.Errorf("find role for code %s: %w", roleCode, err)
		}

		if _, err := tx.Exec(
			ctx,
			`INSERT INTO tenant_user_roles (tenant_user_id, role_id, assigned_by_user_id, metadata)
			 VALUES ($1, $2, $3, '{}'::jsonb)
			 ON CONFLICT (tenant_user_id, role_id) DO NOTHING`,
			tenantUserID,
			roleID,
			nullableString(actorUserID),
		); err != nil {
			return fmt.Errorf("assign role %s to tenant user: %w", roleCode, err)
		}
	}

	return nil
}

func findModuleIDByCode(ctx context.Context, tx pgx.Tx, moduleCode string) (string, error) {
	var moduleID string
	err := tx.QueryRow(
		ctx,
		`SELECT id
		 FROM modules
		 WHERE code = $1
		   AND is_active = true
		 LIMIT 1`,
		moduleCode,
	).Scan(&moduleID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", fmt.Errorf("find module by code: %w", err)
	}
	return moduleID, nil
}

type auditInput struct {
	TenantID   string
	UserID     string
	ModuleID   string
	Action     string
	EntityType string
	EntityID   string
	BeforeData any
	AfterData  any
	Metadata   any
}

func (s *Service) insertAudit(ctx context.Context, input auditInput) error {
	_, err := s.pool.Exec(
		ctx,
		`INSERT INTO audit_logs (tenant_id, user_id, module_id, action, entity_type, entity_id, before_data, after_data, metadata)
		 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)`,
		nullableString(input.TenantID),
		nullableString(input.UserID),
		nullableString(input.ModuleID),
		input.Action,
		nullableString(input.EntityType),
		nullableString(input.EntityID),
		jsonOrEmpty(input.BeforeData),
		jsonOrEmpty(input.AfterData),
		jsonOrEmpty(input.Metadata),
	)
	if err != nil {
		return fmt.Errorf("insert audit: %w", err)
	}
	return nil
}

func insertAuditTx(ctx context.Context, tx pgx.Tx, input auditInput) error {
	_, err := tx.Exec(
		ctx,
		`INSERT INTO audit_logs (tenant_id, user_id, module_id, action, entity_type, entity_id, before_data, after_data, metadata)
		 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)`,
		nullableString(input.TenantID),
		nullableString(input.UserID),
		nullableString(input.ModuleID),
		input.Action,
		nullableString(input.EntityType),
		nullableString(input.EntityID),
		jsonOrEmpty(input.BeforeData),
		jsonOrEmpty(input.AfterData),
		jsonOrEmpty(input.Metadata),
	)
	if err != nil {
		return fmt.Errorf("insert audit tx: %w", err)
	}
	return nil
}

func jsonOrEmpty(value any) string {
	if value == nil {
		return "{}"
	}
	payload, err := json.Marshal(value)
	if err != nil {
		return "{}"
	}
	if len(payload) == 0 {
		return "{}"
	}
	return string(payload)
}
