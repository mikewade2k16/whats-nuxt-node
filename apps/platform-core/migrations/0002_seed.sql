SET search_path TO platform_core, public;

INSERT INTO modules (code, name, description, is_core)
VALUES
  ('core_panel', 'Core Panel', 'Platform core administration module', true),
  ('atendimento', 'Atendimento', 'Omnichannel operations module', false),
  ('kanban', 'Kanban', 'Pipeline and board management module', false)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_core = EXCLUDED.is_core,
    updated_at = now();

INSERT INTO plans (code, name, status, currency, price_monthly, price_yearly)
VALUES
  ('starter', 'Starter', 'active', 'BRL', 79.90, 799.00),
  ('pro', 'Pro', 'active', 'BRL', 199.90, 1990.00)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    status = EXCLUDED.status,
    currency = EXCLUDED.currency,
    price_monthly = EXCLUDED.price_monthly,
    price_yearly = EXCLUDED.price_yearly,
    updated_at = now();

INSERT INTO plan_modules (plan_id, module_id, enabled)
SELECT p.id, m.id, true
FROM plans p
JOIN modules m ON m.code IN ('core_panel', 'atendimento', 'kanban')
WHERE p.code IN ('starter', 'pro')
ON CONFLICT (plan_id, module_id) DO UPDATE
SET enabled = EXCLUDED.enabled;

INSERT INTO plan_module_limits (plan_id, module_id, limit_key, limit_value_int, is_unlimited)
SELECT p.id, m.id, 'users',
  CASE p.code
    WHEN 'starter' THEN CASE m.code
      WHEN 'core_panel' THEN 3
      WHEN 'atendimento' THEN 1
      WHEN 'kanban' THEN 2
    END
    WHEN 'pro' THEN CASE m.code
      WHEN 'core_panel' THEN 15
      WHEN 'atendimento' THEN 3
      WHEN 'kanban' THEN 5
    END
  END,
  false
FROM plans p
JOIN modules m ON m.code IN ('core_panel', 'atendimento', 'kanban')
WHERE p.code IN ('starter', 'pro')
ON CONFLICT (plan_id, module_id, limit_key) DO UPDATE
SET limit_value_int = EXCLUDED.limit_value_int,
    is_unlimited = EXCLUDED.is_unlimited,
    updated_at = now();

INSERT INTO permissions (code, name, description, module_id)
SELECT v.code, v.name, v.description, m.id
FROM (
  VALUES
    ('tenants.read', 'Read tenants', 'List tenants and tenant details', NULL),
    ('tenants.update', 'Update tenants', 'Update tenant metadata', NULL),
    ('tenant.users.read', 'Read tenant users', 'List users inside a tenant', 'core_panel'),
    ('tenant.users.invite', 'Invite tenant users', 'Invite and activate tenant users', 'core_panel'),
    ('tenant.users.update', 'Update tenant users', 'Update tenant user profile or status', 'core_panel'),
    ('tenant.users.modules.assign', 'Assign user modules', 'Assign users to tenant modules', 'core_panel'),
    ('tenant.modules.read', 'Read tenant modules', 'List active tenant modules', 'core_panel'),
    ('tenant.modules.update', 'Update tenant modules', 'Activate or deactivate tenant modules', 'core_panel'),
    ('tenant.limits.read', 'Read tenant limits', 'Read resolved limits', 'core_panel'),
    ('tenant.limits.update', 'Update tenant limits', 'Override tenant limits', 'core_panel'),
    ('audit.read', 'Read audit logs', 'Read audit trail entries', 'core_panel'),
    ('roles.read', 'Read roles', 'Read RBAC roles and bindings', 'core_panel'),
    ('roles.update', 'Update roles', 'Create and update RBAC roles', 'core_panel')
) AS v(code, name, description, module_code)
LEFT JOIN modules m ON m.code = v.module_code
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    module_id = EXCLUDED.module_id,
    is_active = true;

INSERT INTO roles (tenant_id, module_id, code, name, description, is_system, is_active)
SELECT NULL, NULL, x.code, x.name, x.description, true, true
FROM (
  VALUES
    ('platform_root', 'Platform Root', 'Global platform administrator template'),
    ('tenant_owner', 'Tenant Owner', 'Owner role template'),
    ('tenant_admin', 'Tenant Admin', 'Admin role template'),
    ('module_manager', 'Module Manager', 'Manager role template'),
    ('module_agent', 'Module Agent', 'Agent role template')
) AS x(code, name, description)
WHERE NOT EXISTS (
  SELECT 1
  FROM roles r
  WHERE r.tenant_id IS NULL
    AND r.module_id IS NULL
    AND r.code = x.code
);

INSERT INTO tenants (slug, name, status, contact_email)
VALUES ('demo-core', 'Demo Core Tenant', 'active', 'admin@demo-core.local')
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    status = EXCLUDED.status,
    contact_email = EXCLUDED.contact_email,
    updated_at = now();

INSERT INTO users (name, display_name, email, password_hash, status, is_platform_admin, email_verified_at)
VALUES
  ('Platform Root', 'Platform Root', 'root@core.local', crypt('123456', gen_salt('bf')), 'active', true, now()),
  ('Demo Owner', 'Demo Owner', 'admin@demo-core.local', crypt('123456', gen_salt('bf')), 'active', false, now()),
  ('Demo Agent', 'Demo Agent', 'agent@demo-core.local', crypt('123456', gen_salt('bf')), 'active', false, now())
ON CONFLICT (email) DO UPDATE
SET name = EXCLUDED.name,
    display_name = EXCLUDED.display_name,
    password_hash = EXCLUDED.password_hash,
    status = EXCLUDED.status,
    is_platform_admin = EXCLUDED.is_platform_admin,
    email_verified_at = now(),
    updated_at = now();

INSERT INTO tenant_users (tenant_id, user_id, status, is_owner, joined_at)
SELECT t.id, u.id,
  CASE
    WHEN u.email = 'admin@demo-core.local' THEN 'active'::tenant_user_status
    WHEN u.email = 'agent@demo-core.local' THEN 'active'::tenant_user_status
    ELSE 'invited'::tenant_user_status
  END,
  CASE WHEN u.email = 'admin@demo-core.local' THEN true ELSE false END,
  now()
FROM tenants t
JOIN users u ON u.email IN ('admin@demo-core.local', 'agent@demo-core.local')
WHERE t.slug = 'demo-core'
ON CONFLICT (tenant_id, user_id) DO UPDATE
SET status = EXCLUDED.status,
    is_owner = EXCLUDED.is_owner,
    joined_at = EXCLUDED.joined_at,
    updated_at = now();

DELETE FROM tenant_subscriptions ts
USING tenants t
WHERE ts.tenant_id = t.id
  AND t.slug = 'demo-core'
  AND ts.status IN ('trialing', 'active');

INSERT INTO tenant_subscriptions (tenant_id, plan_id, status, billing_cycle, starts_at, currency, price_snapshot)
SELECT t.id, p.id, 'active', 'monthly', now(), p.currency, p.price_monthly
FROM tenants t
JOIN plans p ON p.code = 'pro'
WHERE t.slug = 'demo-core';

INSERT INTO tenant_modules (tenant_id, module_id, status, source, activated_at)
SELECT t.id, m.id, 'active', 'plan', now()
FROM tenants t
JOIN modules m ON m.code IN ('core_panel', 'atendimento', 'kanban')
WHERE t.slug = 'demo-core'
ON CONFLICT (tenant_id, module_id) DO UPDATE
SET status = EXCLUDED.status,
    source = EXCLUDED.source,
    activated_at = EXCLUDED.activated_at,
    deactivated_at = NULL,
    updated_at = now();

INSERT INTO tenant_user_modules (tenant_id, tenant_user_id, module_id, status, granted_at)
SELECT t.id, tu.id, m.id, 'active', now()
FROM tenants t
JOIN tenant_users tu ON tu.tenant_id = t.id
JOIN users u ON u.id = tu.user_id
JOIN modules m ON m.code = 'core_panel'
WHERE t.slug = 'demo-core'
  AND u.email IN ('admin@demo-core.local', 'agent@demo-core.local')
ON CONFLICT (tenant_user_id, module_id) DO UPDATE
SET status = 'active',
    revoked_at = NULL,
    updated_at = now();
