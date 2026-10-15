import pg from 'pg';
import { randomBytes, scryptSync } from 'node:crypto';

const { DATABASE_URL, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, BOOTSTRAP_ADMIN_NAME = 'Hendy Operator' } = process.env;
if (!DATABASE_URL || !BOOTSTRAP_ADMIN_EMAIL || !BOOTSTRAP_ADMIN_PASSWORD) {
  console.error('Set DATABASE_URL, BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD.'); process.exit(1);
}
if (BOOTSTRAP_ADMIN_PASSWORD.length < 14) { console.error('Admin password must contain at least 14 characters.'); process.exit(1); }
const email = BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error('BOOTSTRAP_ADMIN_EMAIL is not valid.'); process.exit(1); }
const salt = randomBytes(16).toString('hex');
const hash = `scrypt$${salt}$${scryptSync(BOOTSTRAP_ADMIN_PASSWORD, salt, 64).toString('hex')}`;
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const existing = await client.query('SELECT id FROM app_users WHERE lower(email)=lower($1) LIMIT 1', [email]);
  let userId;
  if (existing.rowCount) {
    userId = existing.rows[0].id;
    await client.query("UPDATE app_users SET password_hash=$1, display_name=$2, status='active', updated_at=now() WHERE id=$3", [hash, BOOTSTRAP_ADMIN_NAME, userId]);
  } else {
    const inserted = await client.query("INSERT INTO app_users(external_subject,email,display_name,password_hash,status) VALUES($1,$2,$3,$4,'active') RETURNING id", [`local:${email}`, email, BOOTSTRAP_ADMIN_NAME, hash]);
    userId = inserted.rows[0].id;
  }
  const role = await client.query("SELECT id FROM roles WHERE name='admin'");
  if (!role.rowCount) throw new Error('admin role missing; run npm run db:migrate first');
  await client.query('INSERT INTO user_roles(user_id,role_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [userId, role.rows[0].id]);
  await client.query('COMMIT');
  console.log(`Admin account ready: ${email}`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  console.error('Could not bootstrap admin:', error instanceof Error ? error.message : error); process.exitCode=1;
} finally { client.release(); await pool.end(); }
