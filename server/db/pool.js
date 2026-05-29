import pg from "pg";

const { Pool, types } = pg;

types.setTypeParser(20, (value) => Number(value));
types.setTypeParser(1700, (value) => Number(value));

let pool;

function getConnectionConfig() {
  if (process.env.DATABASE_URL?.trim()) {
    return {
      connectionString: process.env.DATABASE_URL.trim(),
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    };
  }

  return {
    host: process.env.PGHOST?.trim() || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE?.trim() || "setu_portal",
    user: process.env.PGUSER?.trim() || "setu",
    password: process.env.PGPASSWORD ?? "setu_dev",
  };
}

export function getPool() {
  if (!pool) {
    pool = new Pool({
      ...getConnectionConfig(),
      max: Number(process.env.DB_POOL_MAX || 10),
      idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
      connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 5000),
      statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 15000),
    });

    pool.on("error", (error) => {
      console.error("Unexpected Postgres pool error", error);
    });
  }

  return pool;
}

export async function query(text, params = []) {
  return getPool().query(text, params);
}

export async function withTransaction(work, options = {}) {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    if (options.readOnly) {
      await client.query("SET TRANSACTION READ ONLY");
    }

    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) {
    const activePool = pool;
    pool = undefined;
    await activePool.end();
  }
}
