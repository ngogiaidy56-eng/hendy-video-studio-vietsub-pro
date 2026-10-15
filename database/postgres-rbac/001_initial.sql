CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_subject TEXT UNIQUE NOT NULL,
  email TEXT,
  display_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), resource TEXT NOT NULL, action TEXT NOT NULL,
  UNIQUE(resource, action)
);
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY(role_id, permission_id)
);
CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES app_users(id), granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, role_id)
);
CREATE TABLE IF NOT EXISTS render_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES app_users(id), project_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','active','completed','failed','cancelled')),
  progress SMALLINT NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100), manifest JSONB NOT NULL,
  output_key TEXT, error_code TEXT, error_message TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS render_jobs_user_created_idx ON render_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS render_jobs_status_created_idx ON render_jobs(status, created_at);
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY, actor_user_id UUID REFERENCES app_users(id), action TEXT NOT NULL,
  resource_type TEXT NOT NULL, resource_id TEXT, request_id TEXT, ip_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at DESC);
INSERT INTO roles(name, description) VALUES ('admin','Full administrative access'),('editor','Create and render projects'),('viewer','Read-only project access') ON CONFLICT(name) DO NOTHING;
