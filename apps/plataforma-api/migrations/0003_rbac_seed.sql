SET search_path TO platform_core, public;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'tenants.read',
  'tenants.update',
  'tenant.users.read',
  'tenant.users.invite',
  'tenant.users.update',
  'tenant.users.modules.assign',
  'tenant.modules.read',
  'tenant.modules.update',
  'tenant.limits.read',
  'tenant.limits.update',
  'audit.read',
  'roles.read',
  'roles.update'
)
WHERE r.code = 'platform_root'
  AND r.tenant_id IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'tenants.read',
  'tenants.update',
  'tenant.users.read',
  'tenant.users.invite',
  'tenant.users.update',
  'tenant.users.modules.assign',
  'tenant.modules.read',
  'tenant.modules.update',
  'tenant.limits.read',
  'tenant.limits.update',
  'audit.read',
  'roles.read',
  'roles.update'
)
WHERE r.code = 'tenant_owner'
  AND r.tenant_id IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'tenants.read',
  'tenant.users.read',
  'tenant.users.invite',
  'tenant.users.update',
  'tenant.users.modules.assign',
  'tenant.modules.read',
  'tenant.modules.update',
  'tenant.limits.read',
  'tenant.limits.update',
  'audit.read',
  'roles.read'
)
WHERE r.code = 'tenant_admin'
  AND r.tenant_id IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'tenant.users.read',
  'tenant.users.modules.assign',
  'tenant.modules.read',
  'tenant.limits.read',
  'audit.read'
)
WHERE r.code = 'module_manager'
  AND r.tenant_id IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'tenant.modules.read',
  'tenant.limits.read'
)
WHERE r.code = 'module_agent'
  AND r.tenant_id IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO tenant_user_roles (tenant_user_id, role_id, assigned_at, metadata)
SELECT tu.id, r.id, now(), '{}'::jsonb
FROM tenant_users tu
JOIN users u ON u.id = tu.user_id
JOIN tenants t ON t.id = tu.tenant_id
JOIN roles r ON r.code = 'tenant_owner' AND r.tenant_id IS NULL
WHERE t.slug = 'demo-core'
  AND u.email = 'admin@demo-core.local'
ON CONFLICT (tenant_user_id, role_id) DO NOTHING;

INSERT INTO tenant_user_roles (tenant_user_id, role_id, assigned_at, metadata)
SELECT tu.id, r.id, now(), '{}'::jsonb
FROM tenant_users tu
JOIN users u ON u.id = tu.user_id
JOIN tenants t ON t.id = tu.tenant_id
JOIN roles r ON r.code = 'module_agent' AND r.tenant_id IS NULL
WHERE t.slug = 'demo-core'
  AND u.email = 'agent@demo-core.local'
ON CONFLICT (tenant_user_id, role_id) DO NOTHING;
