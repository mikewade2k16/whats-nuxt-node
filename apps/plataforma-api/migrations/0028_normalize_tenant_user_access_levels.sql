update platform_core.tenant_users
set
	access_level = case lower(coalesce(nullif(trim(business_role), ''), ''))
		when 'consultant' then 'consultant'
		when 'store_manager' then 'manager'
		when 'general_manager' then 'manager'
		when 'marketing' then 'marketing'
		when 'finance' then 'finance'
		when 'viewer' then 'viewer'
		when 'owner' then 'admin'
		when 'system_admin' then 'admin'
		else access_level
	end,
	updated_at = now()
where lower(coalesce(nullif(trim(business_role), ''), '')) in (
	'consultant',
	'store_manager',
	'general_manager',
	'marketing',
	'finance',
	'viewer',
	'owner',
	'system_admin'
)
and access_level is distinct from case lower(coalesce(nullif(trim(business_role), ''), ''))
	when 'consultant' then 'consultant'
	when 'store_manager' then 'manager'
	when 'general_manager' then 'manager'
	when 'marketing' then 'marketing'
	when 'finance' then 'finance'
	when 'viewer' then 'viewer'
	when 'owner' then 'admin'
	when 'system_admin' then 'admin'
	else access_level
end;
