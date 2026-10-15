ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_status_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_status_check CHECK (status IN ('active','invited','suspended','deleted'));
CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_lower_unique ON app_users (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS video_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  project_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS video_projects_owner_updated_idx ON video_projects(owner_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS media_assets (
  asset_id TEXT PRIMARY KEY,
  owner_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
  storage_key TEXT NOT NULL,
  sha256 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_assets_owner_created_idx ON media_assets(owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS system_feature_flags (
  key TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-zA-Z0-9]{1,80}$'),
  enabled BOOLEAN NOT NULL DEFAULT false,
  description TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO system_feature_flags(key, enabled, description) VALUES
 ('aiTranslation', true, 'Enable subtitle translation adapter'),
 ('renderQueue', true, 'Allow render job submission'),
 ('cloudflareEdge', false, 'Cloudflare Edge integration'),
 ('maintenanceMode', false, 'Maintenance banner and write guard')
ON CONFLICT(key) DO NOTHING;

ALTER TABLE render_jobs ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
ALTER TABLE render_jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS render_jobs_updated_idx ON render_jobs(updated_at DESC);

INSERT INTO permissions(resource, action) VALUES
 ('users','read'),('users','write'),('jobs','read'),('jobs','write'),('flags','read'),('flags','write'),('audit','read'),('projects','read'),('projects','write'),('assets','write')
ON CONFLICT(resource, action) DO NOTHING;
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name='admin'
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (p.resource, p.action) IN (('projects','read'),('projects','write'),('assets','write'),('jobs','read'),('jobs','write')) WHERE r.name='editor'
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (p.resource, p.action) IN (('projects','read'),('jobs','read')) WHERE r.name='viewer'
ON CONFLICT DO NOTHING;


CREATE TABLE IF NOT EXISTS user_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_invitations_expiry_idx ON user_invitations(expires_at) WHERE accepted_at IS NULL;
