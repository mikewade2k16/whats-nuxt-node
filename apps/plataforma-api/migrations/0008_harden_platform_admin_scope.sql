SET search_path TO platform_core, public;

-- Keep platform admin scoped to root/system-owner accounts by default.
-- Tenant admins (for example admin@demo.local) must not have global platform privileges.
UPDATE users
SET is_platform_admin = false,
    updated_at = now()
WHERE is_platform_admin = true
  AND email::text <> 'root@core.local';
