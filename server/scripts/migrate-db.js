import { runMigrations } from "../db/migrations.js";
import { closePool } from "../db/pool.js";

try {
  await runMigrations();
  console.log("Postgres migrations complete.");
} finally {
  await closePool();
}
