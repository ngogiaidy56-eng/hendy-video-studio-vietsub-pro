import pg from 'pg';
const { Pool } = pg;
let pool: pg.Pool | undefined;
export function getPostgresPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is not configured');
  pool ??= new Pool({ connectionString, max: Number(process.env.PG_POOL_MAX ?? 10), idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
  return pool;
}
