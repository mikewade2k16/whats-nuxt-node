package directorysync

import (
	"context"

	"github.com/jackc/pgx/v5/pgconn"
)

type execQuerier interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

func SyncConsultantsByStore(ctx context.Context, db execQuerier, storeID string) error {
	if db == nil {
		return nil
	}

	if _, err := db.Exec(ctx, `
		update consultants
		set
			is_active = false,
			updated_at = now()
		where store_id = $1::uuid
		  and user_id is null
		  and is_active = true;
	`, storeID); err != nil {
		return err
	}

	if _, err := db.Exec(ctx, `
		with scoped_store as (
			select id as store_id, tenant_id
			from platform_core.tenant_stores
			where id = $1::uuid
			  and is_active = true
		),
		eligible as (
			select
				u.id as user_id,
				scoped_store.tenant_id,
				scoped_store.store_id,
				coalesce(nullif(trim(u.nick), ''), nullif(trim(u.name), ''), split_part(lower(u.email::text), '@', 1)) as display_name
			from scoped_store
			join platform_core.tenant_users tu
			  on tu.tenant_id = scoped_store.tenant_id
			 and tu.store_id = scoped_store.store_id
			 and tu.status = 'active'
			 and tu.business_role = 'consultant'
			join platform_core.users u
			  on u.id = tu.user_id
			 and u.status = 'active'
			 and u.deleted_at is null
		)
		,
		updated as (
			update consultants existing
			set
				tenant_id = eligible.tenant_id,
				store_id = eligible.store_id,
				user_id = eligible.user_id,
				name = eligible.display_name,
				initials = upper(
					case
						when array_length(regexp_split_to_array(trim(eligible.display_name), '\s+'), 1) >= 2 then
							left((regexp_split_to_array(trim(eligible.display_name), '\s+'))[1], 1) ||
							left((regexp_split_to_array(trim(eligible.display_name), '\s+'))[2], 1)
						else left(trim(eligible.display_name), 2)
					end
				),
				is_active = true,
				updated_at = now()
			from eligible
			where existing.user_id = eligible.user_id
			returning eligible.user_id
		)
		insert into consultants (
			tenant_id,
			store_id,
			user_id,
			name,
			role_label,
			initials,
			color,
			is_active
		)
		select
			eligible.tenant_id,
			eligible.store_id,
			eligible.user_id,
			eligible.display_name,
			'Consultor',
			upper(
				case
					when array_length(regexp_split_to_array(trim(eligible.display_name), '\s+'), 1) >= 2 then
						left((regexp_split_to_array(trim(eligible.display_name), '\s+'))[1], 1) ||
						left((regexp_split_to_array(trim(eligible.display_name), '\s+'))[2], 1)
					else left(trim(eligible.display_name), 2)
				end
			),
			'#168aad',
			true
		from eligible
		where not exists (
			select 1
			from updated
			where updated.user_id = eligible.user_id
		)
		  and not exists (
			select 1
			from consultants existing
			where existing.user_id = eligible.user_id
		  );
	`, storeID); err != nil {
		return err
	}

	if _, err := db.Exec(ctx, `
		with scoped_store as (
			select id as store_id, tenant_id
			from platform_core.tenant_stores
			where id = $1::uuid
		),
		eligible as (
			select tu.user_id
			from scoped_store
			join platform_core.tenant_users tu
			  on tu.tenant_id = scoped_store.tenant_id
			 and tu.store_id = scoped_store.store_id
			 and tu.status = 'active'
			 and tu.business_role = 'consultant'
		)
		update consultants c
		set
			is_active = false,
			updated_at = now()
		where c.store_id = $1::uuid
		  and c.user_id is not null
		  and c.is_active = true
		  and not exists (
			select 1
			from eligible
			where eligible.user_id = c.user_id
		  );
	`, storeID); err != nil {
		return err
	}

	return nil
}
