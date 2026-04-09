create table if not exists user_external_identities (
	id uuid primary key default gen_random_uuid(),
	provider text not null,
	external_subject text not null,
	user_id uuid not null references users(id) on delete cascade,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (provider, external_subject),
	unique (user_id, provider)
);

create index if not exists user_external_identities_user_id_idx
	on user_external_identities (user_id);
