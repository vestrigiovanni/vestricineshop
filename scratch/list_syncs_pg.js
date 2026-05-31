const { Pool } = require('pg');

const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_FHb4RK6EczDx@ep-quiet-bar-al8uyd1h-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"
});

async function main() {
  try {
    const res = await pool.query('SELECT * FROM "PretixSync" ORDER BY "dateFrom" ASC LIMIT 5');
    console.log("=== FIRST 5 PROJECTIONS IN DB ===");
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error("Query failed:", err);
  } finally {
    await pool.end();
  }
}

main();
