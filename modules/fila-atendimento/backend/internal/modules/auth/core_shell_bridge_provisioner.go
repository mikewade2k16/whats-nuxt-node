package auth

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

type CoreShellBridgeProvisioner struct {
	pool  *pgxpool.Pool
	users *CoreUserStore
}

func NewCoreShellBridgeProvisioner(pool *pgxpool.Pool) *CoreShellBridgeProvisioner {
	if pool == nil {
		return nil
	}

	return &CoreShellBridgeProvisioner{
		pool:  pool,
		users: NewCoreUserStore(pool),
	}
}

func canProvisionShellBridgeWithoutStores(role Role, scopeMode string) bool {
	if strings.EqualFold(strings.TrimSpace(scopeMode), "first_store") {
		return false
	}

	switch role {
	case RoleOwner, RoleMarketing, RolePlatformAdmin:
		return true
	default:
		return false
	}
}

func (provisioner *CoreShellBridgeProvisioner) Provision(ctx context.Context, claims ShellBridgeClaims) (User, error) {
	if provisioner == nil || provisioner.pool == nil || provisioner.users == nil {
		return User{}, ErrShellBridgeDisabled
	}

	role, err := resolveShellBridgeRole(claims)
	if err != nil {
		return User{}, err
	}

	user, err := provisioner.findUser(ctx, claims)
	if err != nil {
		return User{}, err
	}
	if !user.Active {
		return User{}, ErrUserInactive
	}

	scopeMode := resolveShellBridgeScopeMode(claims, role)
	if role == RolePlatformAdmin && scopeMode == "platform" {
		user.Role = RolePlatformAdmin
		user.TenantID = ""
		user.StoreIDs = nil
		return user, nil
	}

	tenantID := strings.TrimSpace(claims.TenantID)
	if tenantID == "" {
		tenantID = strings.TrimSpace(user.TenantID)
	}
	if tenantID == "" {
		return User{}, ErrShellBridgeScopeUnresolved
	}

	activeStores, err := provisioner.listActiveStores(ctx, tenantID)
	if err != nil {
		return User{}, err
	}
	if len(activeStores) == 0 {
		if !canProvisionShellBridgeWithoutStores(role, scopeMode) {
			return User{}, ErrShellBridgeScopeUnresolved
		}

		user.Role = role
		user.TenantID = tenantID
		user.StoreIDs = nil
		return user, nil
	}

	storeIDs := make([]string, 0, len(activeStores))
	for _, store := range activeStores {
		storeIDs = append(storeIDs, store.ID)
	}

	claimedStoreIDs := resolveShellBridgeStoreIDs(claims.StoreIDs, activeStores)
	if len(claims.StoreIDs) > 0 && len(claimedStoreIDs) < 1 {
		return User{}, ErrShellBridgeScopeUnresolved
	}
	if len(claimedStoreIDs) > 0 {
		storeIDs = claimedStoreIDs
	}

	if scopeMode == "first_store" {
		if len(storeIDs) < 1 {
			return User{}, ErrShellBridgeScopeUnresolved
		}
		storeIDs = storeIDs[:1]
	}

	user.Role = role
	user.TenantID = tenantID
	user.StoreIDs = append([]string{}, storeIDs...)
	return user, nil
}

func (provisioner *CoreShellBridgeProvisioner) findUser(ctx context.Context, claims ShellBridgeClaims) (User, error) {
	subject := strings.TrimSpace(claims.Subject)
	if subject != "" {
		user, err := provisioner.users.FindByID(ctx, subject)
		if err == nil {
			return user, nil
		}
		if !errors.Is(err, ErrUnauthorized) {
			return User{}, err
		}
	}

	email := strings.ToLower(strings.TrimSpace(claims.Email))
	if email == "" {
		return User{}, ErrShellBridgeUnauthorized
	}

	user, err := provisioner.users.FindByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, ErrInvalidCredentials) {
			return User{}, ErrShellBridgeUnauthorized
		}
		return User{}, err
	}

	return user, nil
}

func (provisioner *CoreShellBridgeProvisioner) listActiveStores(ctx context.Context, tenantID string) ([]shellBridgeStore, error) {
	rows, err := provisioner.pool.Query(ctx, `
		select id::text, tenant_id::text, code, name, city
		from platform_core.tenant_stores
		where tenant_id = $1::uuid
		  and is_active = true
		order by sort_order asc, created_at asc;
	`, strings.TrimSpace(tenantID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	stores := make([]shellBridgeStore, 0)
	for rows.Next() {
		var store shellBridgeStore
		if err := rows.Scan(&store.ID, &store.TenantID, &store.Code, &store.Name, &store.City); err != nil {
			return nil, err
		}
		stores = append(stores, store)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return stores, nil
}

var _ interface {
	Provision(context.Context, ShellBridgeClaims) (User, error)
} = (*CoreShellBridgeProvisioner)(nil)
