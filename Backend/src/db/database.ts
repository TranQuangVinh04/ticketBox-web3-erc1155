import { Pool, type PoolConfig, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

import { env } from "../config/env";

let pool: Pool | undefined;

function truthy(v: string | undefined) {
  if (!v) return false;
  return ["1", "true", "yes", "y", "on"].includes(v.trim().toLowerCase());
}

function buildPoolConfig(): PoolConfig {
  const sslEnabled = truthy(env.DB_SSL);
  const ssl = sslEnabled ? { rejectUnauthorized: false } : undefined;

  if (env.DATABASE_URL) {
    return { connectionString: env.DATABASE_URL, ssl };
  }

  if (!env.DB_HOST || !env.DB_USER || !env.DB_NAME) {
    throw new Error(
      "Postgres is not configured. Set DATABASE_URL or DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME in .env"
    );
  }

  return {
    host: env.DB_HOST,
    port: env.DB_PORT ?? 5432,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ssl
  };
}

export function getPool() {
  if (!pool) pool = new Pool(buildPoolConfig());
  return pool;
}

export async function dbQuery<T extends QueryResultRow = any>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params as any);
}

export async function dbGetClient(): Promise<PoolClient> {
  return getPool().connect();
}

export async function dbClosePool() {
  if (!pool) return;
  await pool.end();
  pool = undefined;
}

