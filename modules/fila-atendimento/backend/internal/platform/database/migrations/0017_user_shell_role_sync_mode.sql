alter table user_external_identities
	add column if not exists role_sync_mode text not null default 'claims';

update user_external_identities
set role_sync_mode = 'claims'
where coalesce(nullif(trim(role_sync_mode), ''), '') = '';