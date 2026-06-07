import { query } from "../db/pool.js";

export async function listEngagementStatus() {
  const result = await query(`
    SELECT
      customer_id,
      email,
      engagement_status,
      as_of
    FROM customer_engagement_status
    ORDER BY customer_id ASC
  `);

  return result.rows.map((row) => ({
    customer_id: row.customer_id,
    email: row.email,
    engagement_status: row.engagement_status,
    as_of: row.as_of instanceof Date ? row.as_of.toISOString() : row.as_of,
  }));
}
