create table if not exists page_metric_events (
	id uuid primary key default gen_random_uuid(),
	page_key text not null,
	page_path text not null default '',
	event_type text not null,
	event_key text not null,
	tenant_id text not null default '',
	store_id text not null default '',
	actor_user_id text not null default '',
	actor_role text not null default '',
	status text not null default 'ok',
	severity text not null default 'info',
	duration_ms integer not null default 0,
	summary text not null default '',
	metrics jsonb not null default '{}'::jsonb,
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now()
);

create index if not exists idx_page_metric_events_page_created
	on page_metric_events (page_key, created_at desc);

create index if not exists idx_page_metric_events_tenant_created
	on page_metric_events (tenant_id, created_at desc);

create index if not exists idx_page_metric_events_event_key_created
	on page_metric_events (event_key, created_at desc);
