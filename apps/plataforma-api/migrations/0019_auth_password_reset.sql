SET search_path TO platform_core, public;

CREATE TABLE IF NOT EXISTS auth_password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email citext NOT NULL,
  code_hash varchar(255) NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'expired', 'revoked')),
  requested_ip varchar(64),
  requested_user_agent varchar(500),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_password_resets_email_status
  ON auth_password_resets (email, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_password_resets_user_status
  ON auth_password_resets (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_password_resets_expires_at
  ON auth_password_resets (expires_at);