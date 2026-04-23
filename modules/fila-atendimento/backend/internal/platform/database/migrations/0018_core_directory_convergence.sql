create temporary table tmp_core_store_map on commit drop as
select
	local_store.id as local_store_id,
	coalesce(core_by_id.id, core_by_name.id) as core_store_id,
	coalesce(core_by_id.tenant_id, core_by_name.tenant_id, local_store.tenant_id) as core_tenant_id
from stores local_store
left join platform_core.tenant_stores core_by_id
  on core_by_id.id = local_store.id
left join platform_core.tenant_stores core_by_name
  on core_by_name.tenant_id = local_store.tenant_id
 and lower(core_by_name.name) = lower(local_store.name);

alter table if exists consultants
	drop constraint if exists consultants_tenant_id_fkey;
alter table if exists consultants
	drop constraint if exists consultants_store_id_fkey;
alter table if exists consultants
	drop constraint if exists consultants_user_id_fkey;

update consultants c
set
	store_id = mapped.core_store_id,
	tenant_id = mapped.core_tenant_id,
	updated_at = now()
from tmp_core_store_map mapped
where c.store_id = mapped.local_store_id
  and mapped.core_store_id is not null
  and c.store_id <> mapped.core_store_id;

update store_operation_settings settings
set store_id = mapped.core_store_id
from tmp_core_store_map mapped
where settings.store_id = mapped.local_store_id
  and mapped.core_store_id is not null
  and settings.store_id <> mapped.core_store_id;

update store_setting_options options
set store_id = mapped.core_store_id
from tmp_core_store_map mapped
where options.store_id = mapped.local_store_id
  and mapped.core_store_id is not null
  and options.store_id <> mapped.core_store_id;

update store_catalog_products products
set store_id = mapped.core_store_id
from tmp_core_store_map mapped
where products.store_id = mapped.local_store_id
  and mapped.core_store_id is not null
  and products.store_id <> mapped.core_store_id;

update store_campaigns campaigns
set store_id = mapped.core_store_id
from tmp_core_store_map mapped
where campaigns.store_id = mapped.local_store_id
  and mapped.core_store_id is not null
  and campaigns.store_id <> mapped.core_store_id;

update operation_queue_entries entries
set store_id = mapped.core_store_id
from tmp_core_store_map mapped
where entries.store_id = mapped.local_store_id
  and mapped.core_store_id is not null
  and entries.store_id <> mapped.core_store_id;

update operation_active_services services
set store_id = mapped.core_store_id
from tmp_core_store_map mapped
where services.store_id = mapped.local_store_id
  and mapped.core_store_id is not null
  and services.store_id <> mapped.core_store_id;

update operation_paused_consultants pauses
set store_id = mapped.core_store_id
from tmp_core_store_map mapped
where pauses.store_id = mapped.local_store_id
  and mapped.core_store_id is not null
  and pauses.store_id <> mapped.core_store_id;

update operation_current_status current_status
set store_id = mapped.core_store_id
from tmp_core_store_map mapped
where current_status.store_id = mapped.local_store_id
  and mapped.core_store_id is not null
  and current_status.store_id <> mapped.core_store_id;

update operation_status_sessions sessions
set store_id = mapped.core_store_id
from tmp_core_store_map mapped
where sessions.store_id = mapped.local_store_id
  and mapped.core_store_id is not null
  and sessions.store_id <> mapped.core_store_id;

update operation_service_history history
set store_id = mapped.core_store_id
from tmp_core_store_map mapped
where history.store_id = mapped.local_store_id
  and mapped.core_store_id is not null
  and history.store_id <> mapped.core_store_id;

delete from store_operation_settings
where store_id in (
	select local_store_id
	from tmp_core_store_map
	where core_store_id is null
);

delete from store_setting_options
where store_id in (
	select local_store_id
	from tmp_core_store_map
	where core_store_id is null
);

delete from store_catalog_products
where store_id in (
	select local_store_id
	from tmp_core_store_map
	where core_store_id is null
);

delete from store_campaigns
where store_id in (
	select local_store_id
	from tmp_core_store_map
	where core_store_id is null
);

delete from operation_queue_entries
where store_id in (
	select local_store_id
	from tmp_core_store_map
	where core_store_id is null
);

delete from operation_active_services
where store_id in (
	select local_store_id
	from tmp_core_store_map
	where core_store_id is null
);

delete from operation_paused_consultants
where store_id in (
	select local_store_id
	from tmp_core_store_map
	where core_store_id is null
);

delete from operation_current_status
where store_id in (
	select local_store_id
	from tmp_core_store_map
	where core_store_id is null
);

delete from operation_status_sessions
where store_id in (
	select local_store_id
	from tmp_core_store_map
	where core_store_id is null
);

delete from operation_service_history
where store_id in (
	select local_store_id
	from tmp_core_store_map
	where core_store_id is null
);

delete from consultants
where store_id in (
	select local_store_id
	from tmp_core_store_map
	where core_store_id is null
);

create table if not exists store_profiles (
	store_id uuid primary key references platform_core.tenant_stores(id) on delete cascade,
	default_template_id text not null default '',
	monthly_goal numeric(14, 2) not null default 0,
	weekly_goal numeric(14, 2) not null default 0,
	avg_ticket_goal numeric(14, 2) not null default 0,
	conversion_goal numeric(8, 2) not null default 0,
	pa_goal numeric(8, 2) not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

insert into store_profiles (
	store_id,
	default_template_id,
	monthly_goal,
	weekly_goal,
	avg_ticket_goal,
	conversion_goal,
	pa_goal,
	created_at,
	updated_at
)
select
	mapped.core_store_id,
	coalesce(local_store.default_template_id, ''),
	coalesce(local_store.monthly_goal, 0),
	coalesce(local_store.weekly_goal, 0),
	coalesce(local_store.avg_ticket_goal, 0),
	coalesce(local_store.conversion_goal, 0),
	coalesce(local_store.pa_goal, 0),
	local_store.created_at,
	local_store.updated_at
from stores local_store
join tmp_core_store_map mapped
  on mapped.local_store_id = local_store.id
where mapped.core_store_id is not null
on conflict (store_id) do update
set
	default_template_id = excluded.default_template_id,
	monthly_goal = excluded.monthly_goal,
	weekly_goal = excluded.weekly_goal,
	avg_ticket_goal = excluded.avg_ticket_goal,
	conversion_goal = excluded.conversion_goal,
	pa_goal = excluded.pa_goal,
	updated_at = now();

update consultants c
set user_id = core_user.id
from platform_core.users core_user
where c.user_id is not null
  and lower(core_user.email::text) = lower((
	select local_user.email
	from users local_user
	where local_user.id = c.user_id
	limit 1
  ));

update consultants c
set user_id = null
where c.user_id is not null
  and not exists (
	select 1
	from platform_core.users core_user
	where core_user.id = c.user_id
  );

alter table if exists consultants
	add constraint consultants_tenant_id_fkey
	foreign key (tenant_id) references platform_core.tenants(id) on delete cascade;
alter table if exists consultants
	add constraint consultants_store_id_fkey
	foreign key (store_id) references platform_core.tenant_stores(id) on delete cascade;
alter table if exists consultants
	add constraint consultants_user_id_fkey
	foreign key (user_id) references platform_core.users(id) on delete restrict;

alter table if exists store_operation_settings
	drop constraint if exists store_operation_settings_store_id_fkey;
alter table if exists store_operation_settings
	add constraint store_operation_settings_store_id_fkey
	foreign key (store_id) references platform_core.tenant_stores(id) on delete cascade;

alter table if exists store_setting_options
	drop constraint if exists store_setting_options_store_id_fkey;
alter table if exists store_setting_options
	add constraint store_setting_options_store_id_fkey
	foreign key (store_id) references platform_core.tenant_stores(id) on delete cascade;

alter table if exists store_catalog_products
	drop constraint if exists store_catalog_products_store_id_fkey;
alter table if exists store_catalog_products
	add constraint store_catalog_products_store_id_fkey
	foreign key (store_id) references platform_core.tenant_stores(id) on delete cascade;

alter table if exists store_campaigns
	drop constraint if exists store_campaigns_store_id_fkey;
alter table if exists store_campaigns
	add constraint store_campaigns_store_id_fkey
	foreign key (store_id) references platform_core.tenant_stores(id) on delete cascade;

alter table if exists operation_queue_entries
	drop constraint if exists operation_queue_entries_store_id_fkey;
alter table if exists operation_queue_entries
	add constraint operation_queue_entries_store_id_fkey
	foreign key (store_id) references platform_core.tenant_stores(id) on delete cascade;

alter table if exists operation_active_services
	drop constraint if exists operation_active_services_store_id_fkey;
alter table if exists operation_active_services
	add constraint operation_active_services_store_id_fkey
	foreign key (store_id) references platform_core.tenant_stores(id) on delete cascade;

alter table if exists operation_paused_consultants
	drop constraint if exists operation_paused_consultants_store_id_fkey;
alter table if exists operation_paused_consultants
	add constraint operation_paused_consultants_store_id_fkey
	foreign key (store_id) references platform_core.tenant_stores(id) on delete cascade;

alter table if exists operation_current_status
	drop constraint if exists operation_current_status_store_id_fkey;
alter table if exists operation_current_status
	add constraint operation_current_status_store_id_fkey
	foreign key (store_id) references platform_core.tenant_stores(id) on delete cascade;

alter table if exists operation_status_sessions
	drop constraint if exists operation_status_sessions_store_id_fkey;
alter table if exists operation_status_sessions
	add constraint operation_status_sessions_store_id_fkey
	foreign key (store_id) references platform_core.tenant_stores(id) on delete cascade;

alter table if exists operation_service_history
	drop constraint if exists operation_service_history_store_id_fkey;
alter table if exists operation_service_history
	add constraint operation_service_history_store_id_fkey
	foreign key (store_id) references platform_core.tenant_stores(id) on delete cascade;
