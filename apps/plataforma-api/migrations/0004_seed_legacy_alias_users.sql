SET search_path TO platform_core, public;

INSERT INTO users (name, display_name, email, password_hash, status, is_platform_admin, email_verified_at)
VALUES
  ('Admin Demo', 'Admin Demo', 'admin@demo.local', crypt('123456', gen_salt('bf')), 'active', false, now()),
  ('Supervisor Demo', 'Supervisor Demo', 'supervisor@demo.local', crypt('123456', gen_salt('bf')), 'active', false, now()),
  ('Agente Demo', 'Agente Demo', 'agente@demo.local', crypt('123456', gen_salt('bf')), 'active', false, now()),
  ('Viewer Demo', 'Viewer Demo', 'viewer@demo.local', crypt('123456', gen_salt('bf')), 'active', false, now())
ON CONFLICT (email) DO UPDATE
SET name = EXCLUDED.name,
    display_name = EXCLUDED.display_name,
    password_hash = EXCLUDED.password_hash,
    status = EXCLUDED.status,
    is_platform_admin = EXCLUDED.is_platform_admin,
    email_verified_at = now(),
    updated_at = now();

INSERT INTO tenant_users (tenant_id, user_id, status, is_owner, joined_at)
SELECT t.id, u.id, 'active'::tenant_user_status, false, now()
FROM tenants t
JOIN users u ON u.email IN ('admin@demo.local', 'supervisor@demo.local', 'agente@demo.local', 'viewer@demo.local')
WHERE t.slug = 'demo-core'
ON CONFLICT (tenant_id, user_id) DO UPDATE
SET status = 'active',
    is_owner = false,
    joined_at = EXCLUDED.joined_at,
    updated_at = now();

INSERT INTO tenant_user_modules (tenant_id, tenant_user_id, module_id, status, granted_at)
SELECT t.id, tu.id, m.id, 'active', now()
FROM tenants t
JOIN tenant_users tu ON tu.tenant_id = t.id
JOIN users u ON u.id = tu.user_id
JOIN modules m ON m.code = 'core_panel'
WHERE t.slug = 'demo-core'
  AND u.email IN ('admin@demo.local', 'supervisor@demo.local', 'agente@demo.local', 'viewer@demo.local')
ON CONFLICT (tenant_user_id, module_id) DO UPDATE
SET status = 'active',
    revoked_at = NULL,
    updated_at = now();

INSERT INTO tenant_user_roles (tenant_user_id, role_id, assigned_at, metadata)
SELECT tu.id, r.id, now(), '{}'::jsonb
FROM tenant_users tu
JOIN users u ON u.id = tu.user_id
JOIN tenants t ON t.id = tu.tenant_id
JOIN roles r ON r.code = 'tenant_admin' AND r.tenant_id IS NULL
WHERE t.slug = 'demo-core'
  AND u.email = 'admin@demo.local'
ON CONFLICT (tenant_user_id, role_id) DO NOTHING;

INSERT INTO tenant_user_roles (tenant_user_id, role_id, assigned_at, metadata)
SELECT tu.id, r.id, now(), '{}'::jsonb
FROM tenant_users tu
JOIN users u ON u.id = tu.user_id
JOIN tenants t ON t.id = tu.tenant_id
JOIN roles r ON r.code = 'module_manager' AND r.tenant_id IS NULL
WHERE t.slug = 'demo-core'
  AND u.email = 'supervisor@demo.local'
ON CONFLICT (tenant_user_id, role_id) DO NOTHING;

INSERT INTO tenant_user_roles (tenant_user_id, role_id, assigned_at, metadata)
SELECT tu.id, r.id, now(), '{}'::jsonb
FROM tenant_users tu
JOIN users u ON u.id = tu.user_id
JOIN tenants t ON t.id = tu.tenant_id
JOIN roles r ON r.code = 'module_agent' AND r.tenant_id IS NULL
WHERE t.slug = 'demo-core'
  AND u.email = 'agente@demo.local'
ON CONFLICT (tenant_user_id, role_id) DO NOTHING;
