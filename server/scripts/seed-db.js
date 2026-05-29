import { closePool } from "../db/pool.js";
import { prepareDatabase, seedDatabase } from "../db/seed.js";

const force = process.argv.includes("--force");

try {
  if (force) {
    await prepareDatabase();
    await seedDatabase({ force: true });
    console.log("Postgres database reseeded from the local source state.");
  } else {
    await prepareDatabase();
    console.log("Postgres database is ready and seeded if it was empty.");
  }
} finally {
  await closePool();
}
