import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const connectionString = process.env.DATABASE_URL;
if (!connectionString) { console.error('DATABASE_URL is required.'); process.exit(1); }
const pool = new pg.Pool({ connectionString, max: 2, connectionTimeoutMillis: 8000 });
try {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const dir = join(root, 'database/postgres-rbac');
  const files = (await readdir(dir)).filter(name => /^\d+.*\.sql$/.test(name)).sort();
  for (const file of files) {
    const already = await pool.query('SELECT 1 FROM schema_migrations WHERE version=$1', [file]);
    if (already.rowCount) { console.log(`skip ${file}`); continue; }
    const sql = await readFile(join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [file]);
      await client.query('COMMIT');
      console.log(`applied ${file}`);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
} catch (error) {
  console.error('Database migration failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally { await pool.end(); }
