package auth

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type CoreUserStore struct {
	pool *pgxpool.Pool
}

type coreUserRecord struct {
	ID           string
	DisplayName  string
	Email        string
	AvatarPath   string
	Active       bool
	CreatedAt    time.Time
	IsPlatform   bool
	TenantID     string
	AccessLevel  string
	UserType     string
	BusinessRole string
	StoreID      string
}

func NewCoreUserStore(pool *pgxpool.Pool) *CoreUserStore {
	return &CoreUserStore{pool: pool}
}

func (store *CoreUserStore) FindByEmail(ctx context.Context, email string) (User, error) {
	record, err := store.findRecord(ctx, "lower(u.email::text) = lower($1)", strings.ToLower(strings.TrimSpace(email)))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return User{}, ErrInvalidCredentials
		}
		return User{}, err
	}

	return store.buildUser(ctx, record)
}

func (store *CoreUserStore) FindByID(ctx context.Context, id string) (User, error) {
	record, err := store.findRecord(ctx, "u.id = $1::uuid", strings.TrimSpace(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return User{}, ErrUnauthorized
		}
		return User{}, err
	}

	return store.buildUser(ctx, record)
}

func (store *CoreUserStore) UpdateProfile(context.Context, string, string, string) (User, error) {
	return User{}, ErrForbidden
}

func (store *CoreUserStore) UpdatePassword(context.Context, string, string, bool) (User, error) {
	return User{}, ErrForbidden
}

func (store *CoreUserStore) UpdateAvatarPath(context.Context, string, string) (User, error) {
	return User{}, ErrForbidden
}

func (store *CoreUserStore) findRecord(ctx context.Context, predicate string, arg string) (coreUserRecord, error) {
	query := `
		select
			u.id::text,
			coalesce(nullif(trim(u.nick), ''), nullif(trim(u.name), ''), split_part(lower(u.email::text), '@', 1)) as display_name,
			lower(u.email::text) as email,
			coalesce(nullif(trim(u.avatar_url), ''), '') as avatar_path,
			(u.status = 'active') as is_active,
			u.created_at,
			u.is_platform_admin,
			coalesce(scope.tenant_id::text, '') as tenant_id,
			coalesce(scope.access_level, '') as access_level,
			coalesce(scope.user_type, '') as user_type,
			coalesce(scope.business_role, '') as business_role,
			coalesce(scope.store_id::text, '') as store_id
		from platform_core.users u
		left join lateral (
			select
				tu.tenant_id,
				tu.access_level,
				tu.user_type,
				tu.business_role,
				tu.store_id,
				tu.is_owner,
				tu.created_at
			from platform_core.tenant_users tu
			join platform_core.tenants t on t.id = tu.tenant_id
			where tu.user_id = u.id
			  and tu.status = 'active'
			  and t.deleted_at is null
			order by
				tu.is_owner desc,
				case coalesce(tu.business_role, '')
					when 'owner' then 0
					when 'general_manager' then 1
					when 'marketing' then 2
					when 'store_manager' then 3
					when 'consultant' then 4
					else 99
				end,
				tu.created_at asc
			limit 1
		) scope on true
		where ` + predicate + `
		  and u.deleted_at is null
		limit 1;
	`

	var record coreUserRecord
	err := store.pool.QueryRow(ctx, query, arg).Scan(
		&record.ID,
		&record.DisplayName,
		&record.Email,
		&record.AvatarPath,
		&record.Active,
		&record.CreatedAt,
		&record.IsPlatform,
		&record.TenantID,
		&record.AccessLevel,
		&record.UserType,
		&record.BusinessRole,
		&record.StoreID,
	)
	if err != nil {
		return coreUserRecord{}, err
	}

	return record, nil
}

func (store *CoreUserStore) buildUser(ctx context.Context, record coreUserRecord) (User, error) {
	role := resolveCoreDirectoryRole(record.IsPlatform, record.BusinessRole, record.AccessLevel)
	tenantID := strings.TrimSpace(record.TenantID)
	storeIDs, err := store.findStoreIDs(ctx, role, tenantID, record.StoreID)
	if err != nil {
		return User{}, err
	}

	user := User{
		ID:          record.ID,
		DisplayName: strings.TrimSpace(record.DisplayName),
		Email:       strings.ToLower(strings.TrimSpace(record.Email)),
		AvatarPath:  strings.TrimSpace(record.AvatarPath),
		Role:        role,
		TenantID:    tenantID,
		StoreIDs:    storeIDs,
		Active:      record.Active,
		CreatedAt:   record.CreatedAt,
	}

	if user.DisplayName == "" {
		user.DisplayName = user.Email
	}

	return user, nil
}

func (store *CoreUserStore) findStoreIDs(ctx context.Context, role Role, tenantID string, storeID string) ([]string, error) {
	switch role {
	case RoleOwner, RoleMarketing:
		if strings.TrimSpace(tenantID) == "" {
			return nil, nil
		}

		rows, err := store.pool.Query(ctx, `
			select id::text
			from platform_core.tenant_stores
			where tenant_id = $1::uuid
			  and is_active = true
			order by sort_order asc, created_at asc;
		`, tenantID)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		storeIDs := make([]string, 0)
		for rows.Next() {
			var item string
			if err := rows.Scan(&item); err != nil {
				return nil, err
			}
			storeIDs = append(storeIDs, strings.TrimSpace(item))
		}

		return storeIDs, rows.Err()
	case RoleManager, RoleConsultant, RoleStoreTerminal:
		trimmed := strings.TrimSpace(storeID)
		if trimmed == "" {
			return nil, nil
		}
		return []string{trimmed}, nil
	default:
		return nil, nil
	}
}

func resolveCoreDirectoryRole(isPlatform bool, businessRole string, accessLevel string) Role {
	if isPlatform {
		return RolePlatformAdmin
	}

	switch strings.ToLower(strings.TrimSpace(businessRole)) {
	case "consultant":
		return RoleConsultant
	case "store_manager":
		return RoleManager
	case "marketing":
		return RoleMarketing
	case "general_manager", "owner":
		return RoleOwner
	}

	switch strings.ToLower(strings.TrimSpace(accessLevel)) {
	case "consultant":
		return RoleConsultant
	case "manager":
		return RoleManager
	case "marketing":
		return RoleMarketing
	case "admin":
		return RoleOwner
	default:
		return ""
	}
}
