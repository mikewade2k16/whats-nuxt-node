package auth

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	ShellBridgeIdentityProvider   = "painel-web-shell"
	ShellBridgeRoleSyncModeClaims = "claims"
	ShellBridgeRoleSyncModeManual = "explicit"
)

type ShellBridgeProvisioner struct {
	pool              *pgxpool.Pool
	defaultTenantSlug string
	users             *PostgresUserStore
}

type shellBridgeProjection struct {
	Role     Role
	TenantID string
	StoreIDs []string
}

type shellBridgeTenant struct {
	ID   string
	Slug string
	Name string
}

type shellBridgeStore struct {
	ID       string
	TenantID string
	Code     string
	Name     string
}

func NewShellBridgeProvisioner(pool *pgxpool.Pool, defaultTenantSlug string) *ShellBridgeProvisioner {
	return &ShellBridgeProvisioner{
		pool:              pool,
		defaultTenantSlug: strings.TrimSpace(defaultTenantSlug),
		users:             NewPostgresUserStore(pool),
	}
}

func (provisioner *ShellBridgeProvisioner) Provision(ctx context.Context, claims ShellBridgeClaims) (User, error) {
	if provisioner == nil || provisioner.pool == nil {
		return User{}, ErrShellBridgeDisabled
	}

	projection, err := provisioner.resolveProjection(ctx, claims)
	if err != nil {
		return User{}, err
	}

	tx, err := provisioner.pool.Begin(ctx)
	if err != nil {
		return User{}, err
	}
	defer func() {
		_ = tx.Rollback(ctx)
	}()

	userID, err := provisioner.ensureUserIdentity(ctx, tx, claims)
	if err != nil {
		return User{}, err
	}

	if err := provisioner.syncUserRoles(ctx, tx, userID, projection); err != nil {
		return User{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return User{}, err
	}

	return provisioner.users.FindByID(ctx, userID)
}

func (provisioner *ShellBridgeProvisioner) resolveProjection(ctx context.Context, claims ShellBridgeClaims) (shellBridgeProjection, error) {
	role, err := resolveShellBridgeRole(claims)
	if err != nil {
		return shellBridgeProjection{}, err
	}

	scopeMode := resolveShellBridgeScopeMode(claims, role)

	if role == RolePlatformAdmin {
		return shellBridgeProjection{
			Role:     role,
			TenantID: "",
			StoreIDs: nil,
		}, nil
	}

	tenant, err := provisioner.resolveTenant(ctx, claims)
	if err != nil {
		return shellBridgeProjection{}, err
	}

	stores, err := provisioner.listActiveStores(ctx, tenant.ID)
	if err != nil {
		return shellBridgeProjection{}, err
	}

	if len(stores) == 0 {
		return shellBridgeProjection{}, ErrShellBridgeScopeUnresolved
	}

	storeIDs := make([]string, 0, len(stores))
	for _, store := range stores {
		storeIDs = append(storeIDs, store.ID)
	}

	claimedStoreIDs := resolveShellBridgeStoreIDs(claims.StoreIDs, stores)
	if len(claims.StoreIDs) > 0 && len(claimedStoreIDs) < 1 {
		return shellBridgeProjection{}, ErrShellBridgeScopeUnresolved
	}
	if len(claimedStoreIDs) > 0 {
		storeIDs = claimedStoreIDs
	}

	if scopeMode == "first_store" {
		storeIDs = storeIDs[:1]
	}

	return shellBridgeProjection{
		Role:     role,
		TenantID: tenant.ID,
		StoreIDs: storeIDs,
	}, nil
}

func resolveShellBridgeRole(claims ShellBridgeClaims) (Role, error) {
	if claims.IsPlatformAdmin {
		return RolePlatformAdmin, nil
	}

	switch strings.ToLower(strings.TrimSpace(claims.BusinessRole)) {
	case "owner":
		return RoleOwner, nil
	case "system_admin":
		return RolePlatformAdmin, nil
	case "general_manager", "store_manager":
		return RoleManager, nil
	case "consultant":
		return RoleConsultant, nil
	case "marketing":
		return RoleMarketing, nil
	}

	switch strings.ToLower(strings.TrimSpace(claims.UserLevel)) {
	case "admin":
		return RoleOwner, nil
	case "consultant":
		return RoleConsultant, nil
	case "manager":
		return RoleManager, nil
	case "marketing":
		return RoleMarketing, nil
	default:
		return "", ErrShellBridgeForbidden
	}
}

func resolveShellBridgeScopeMode(claims ShellBridgeClaims, role Role) string {
	scopeMode := strings.ToLower(strings.TrimSpace(claims.ScopeMode))
	if scopeMode != "" {
		return scopeMode
	}

	switch strings.ToLower(strings.TrimSpace(claims.BusinessRole)) {
	case "consultant", "store_manager":
		return "first_store"
	case "general_manager":
		return "all_stores"
	}

	if role == RoleManager {
		return "first_store"
	}

	if role == RolePlatformAdmin {
		return "platform"
	}

	return "all_stores"
}

func resolveShellBridgeStoreIDs(claimed []string, activeStores []shellBridgeStore) []string {
	if len(claimed) < 1 || len(activeStores) < 1 {
		return nil
	}

	allowed := make(map[string]struct{}, len(activeStores))
	for _, store := range activeStores {
		allowed[strings.TrimSpace(store.ID)] = struct{}{}
	}

	result := make([]string, 0, len(claimed))
	seen := make(map[string]struct{}, len(claimed))
	for _, storeID := range claimed {
		trimmed := strings.TrimSpace(storeID)
		if trimmed == "" {
			continue
		}
		if _, ok := allowed[trimmed]; !ok {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		result = append(result, trimmed)
	}

	return result
}

func (provisioner *ShellBridgeProvisioner) resolveTenant(ctx context.Context, claims ShellBridgeClaims) (shellBridgeTenant, error) {
	candidates := make([]string, 0, 3)
	if strings.TrimSpace(claims.TenantSlug) != "" {
		candidates = append(candidates, strings.TrimSpace(claims.TenantSlug))
	}
	if provisioner.defaultTenantSlug != "" {
		candidates = append(candidates, provisioner.defaultTenantSlug)
	}
	if strings.TrimSpace(claims.TenantID) != "" {
		candidates = append(candidates, strings.TrimSpace(claims.TenantID))
	}

	for _, candidate := range candidates {
		tenant, err := provisioner.findTenantByHint(ctx, candidate)
		if err == nil {
			return tenant, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return shellBridgeTenant{}, err
		}
	}

	rows, err := provisioner.pool.Query(ctx, `
		select id::text, slug, name
		from tenants
		where is_active = true
		order by created_at asc, name asc;
	`)
	if err != nil {
		return shellBridgeTenant{}, err
	}
	defer rows.Close()

	tenants := make([]shellBridgeTenant, 0, 2)
	for rows.Next() {
		var tenant shellBridgeTenant
		if err := rows.Scan(&tenant.ID, &tenant.Slug, &tenant.Name); err != nil {
			return shellBridgeTenant{}, err
		}
		tenants = append(tenants, tenant)
	}

	if err := rows.Err(); err != nil {
		return shellBridgeTenant{}, err
	}

	if len(tenants) == 1 {
		return tenants[0], nil
	}

	return shellBridgeTenant{}, ErrShellBridgeScopeUnresolved
}

func (provisioner *ShellBridgeProvisioner) findTenantByHint(ctx context.Context, hint string) (shellBridgeTenant, error) {
	var tenant shellBridgeTenant
	err := provisioner.pool.QueryRow(ctx, `
		select id::text, slug, name
		from tenants
		where is_active = true
			and (id::text = $1 or slug = $1)
		limit 1;
	`, strings.TrimSpace(hint)).Scan(&tenant.ID, &tenant.Slug, &tenant.Name)
	if err != nil {
		return shellBridgeTenant{}, err
	}

	return tenant, nil
}

func (provisioner *ShellBridgeProvisioner) listActiveStores(ctx context.Context, tenantID string) ([]shellBridgeStore, error) {
	rows, err := provisioner.pool.Query(ctx, `
		select id::text, tenant_id::text, code, name
		from stores
		where tenant_id = $1::uuid
			and is_active = true
		order by created_at asc, code asc;
	`, strings.TrimSpace(tenantID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	stores := make([]shellBridgeStore, 0)
	for rows.Next() {
		var store shellBridgeStore
		if err := rows.Scan(&store.ID, &store.TenantID, &store.Code, &store.Name); err != nil {
			return nil, err
		}
		stores = append(stores, store)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return stores, nil
}

func (provisioner *ShellBridgeProvisioner) ensureUserIdentity(ctx context.Context, tx pgx.Tx, claims ShellBridgeClaims) (string, error) {
	email := strings.ToLower(strings.TrimSpace(claims.Email))
	displayName := strings.TrimSpace(claims.DisplayName)
	if displayName == "" {
		displayName = email
	}

	var userID string
	var roleSyncMode string
	err := tx.QueryRow(ctx, `
		select identity.user_id::text, identity.role_sync_mode
		from user_external_identities identity
		where identity.provider = $1
			and identity.external_subject = $2
		limit 1;
	`, ShellBridgeIdentityProvider, strings.TrimSpace(claims.Subject)).Scan(&userID, &roleSyncMode)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}

	if strings.TrimSpace(userID) == "" {
		err = tx.QueryRow(ctx, `
			select id::text
			from users
			where lower(email) = lower($1)
			limit 1;
		`, email).Scan(&userID)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return "", err
		}
	}

	if strings.TrimSpace(userID) != "" && strings.TrimSpace(roleSyncMode) == "" {
		roleSyncMode, err = provisioner.loadRoleSyncMode(ctx, tx, userID)
		if err != nil {
			return "", err
		}
	}

	if strings.TrimSpace(userID) == "" {
		if err := tx.QueryRow(ctx, `
			insert into users (email, display_name, password_hash, is_active)
			values ($1, $2, '', true)
			returning id::text;
		`, email, displayName).Scan(&userID); err != nil {
			return "", err
		}
	}

	if strings.TrimSpace(roleSyncMode) == ShellBridgeRoleSyncModeManual {
		if _, err := tx.Exec(ctx, `
			update users
			set
				email = $2,
				display_name = $3,
				updated_at = now()
			where id = $1::uuid;
		`, userID, email, displayName); err != nil {
			return "", err
		}
	} else {
		if _, err := tx.Exec(ctx, `
			update users
			set
				email = $2,
				display_name = $3,
				is_active = true,
				updated_at = now()
			where id = $1::uuid;
		`, userID, email, displayName); err != nil {
			return "", err
		}
	}

	if _, err := tx.Exec(ctx, `
		insert into user_external_identities (provider, external_subject, user_id)
		values ($1, $2, $3::uuid)
		on conflict (user_id, provider) do update
		set
			external_subject = excluded.external_subject,
			user_id = excluded.user_id,
			updated_at = now();
	`, ShellBridgeIdentityProvider, strings.TrimSpace(claims.Subject), userID); err != nil {
		return "", err
	}

	return userID, nil
}

func (provisioner *ShellBridgeProvisioner) loadRoleSyncMode(ctx context.Context, tx pgx.Tx, userID string) (string, error) {
	var roleSyncMode string
	err := tx.QueryRow(ctx, `
		select role_sync_mode
		from user_external_identities
		where provider = $1
			and user_id = $2::uuid
		limit 1;
	`, ShellBridgeIdentityProvider, strings.TrimSpace(userID)).Scan(&roleSyncMode)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ShellBridgeRoleSyncModeClaims, nil
		}

		return "", err
	}

	roleSyncMode = strings.TrimSpace(roleSyncMode)
	if roleSyncMode == "" {
		return ShellBridgeRoleSyncModeClaims, nil
	}

	return roleSyncMode, nil
}

func (provisioner *ShellBridgeProvisioner) syncUserRoles(ctx context.Context, tx pgx.Tx, userID string, projection shellBridgeProjection) error {
	roleSyncMode, err := provisioner.loadRoleSyncMode(ctx, tx, userID)
	if err != nil {
		return err
	}

	if roleSyncMode == ShellBridgeRoleSyncModeManual && projection.Role != RolePlatformAdmin {
		return nil
	}

	if _, err := tx.Exec(ctx, `delete from user_platform_roles where user_id = $1::uuid;`, userID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `delete from user_tenant_roles where user_id = $1::uuid;`, userID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `delete from user_store_roles where user_id = $1::uuid;`, userID); err != nil {
		return err
	}

	switch projection.Role {
	case RolePlatformAdmin:
		_, err = tx.Exec(ctx, `
			insert into user_platform_roles (user_id, role)
			values ($1::uuid, 'platform_admin')
			on conflict (user_id) do update
			set role = excluded.role;
		`, userID)
		return err
	case RoleOwner, RoleMarketing:
		_, err := tx.Exec(ctx, `
			insert into user_tenant_roles (user_id, tenant_id, role)
			values ($1::uuid, $2::uuid, $3)
			on conflict (user_id, tenant_id, role) do nothing;
		`, userID, projection.TenantID, string(projection.Role))
		return err
	case RoleManager:
		for _, storeID := range projection.StoreIDs {
			if _, err := tx.Exec(ctx, `
				insert into user_store_roles (user_id, store_id, role)
				values ($1::uuid, $2::uuid, $3)
				on conflict (user_id, store_id, role) do nothing;
			`, userID, storeID, string(projection.Role)); err != nil {
				return err
			}
		}
		return nil
	default:
		return ErrShellBridgeForbidden
	}
}
