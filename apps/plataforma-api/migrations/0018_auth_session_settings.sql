CREATE TABLE IF NOT EXISTS auth_session_settings (
  scope_key varchar(32) PRIMARY KEY,
  ttl_minutes integer NOT NULL CHECK (ttl_minutes BETWEEN 30 AND 10080),
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);