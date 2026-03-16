SET search_path TO platform_core, public;

UPDATE users
SET is_platform_admin = true,
    updated_at = now()
WHERE email::text = 'root@core.local';
