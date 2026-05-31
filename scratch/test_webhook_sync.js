const { Pool } = require('pg');

const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_FHb4RK6EczDx@ep-quiet-bar-al8uyd1h-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"
});

async function getRecord(subeventId) {
  const res = await pool.query('SELECT * FROM "PretixSync" WHERE "pretixId" = $1', [subeventId]);
  return res.rows[0];
}

async function main() {
  const subeventId = 4953147;
  
  try {
    // 1. Fetch before state
    const before = await getRecord(subeventId);
    console.log("=== BEFORE WEBHOOK SYNC ===");
    console.log(`Pretix ID: ${before.pretixId}`);
    console.log(`isSoldOut: ${before.isSoldOut}`);
    console.log(`availableSeats: ${before.availableSeats}`);
    console.log(`updatedAt: ${before.updatedAt}`);

    // 2. Trigger webhook POST request
    const payload = {
      action: "pretix.event.order.placed",
      organizer: "vestri",
      event: "npkez",
      data: {
        code: "TEST12345",
        positions: [
          {
            id: 888888,
            subevent: subeventId
          }
        ]
      }
    };

    console.log("\nSending mock webhook request to localhost:3001...");
    const response = await fetch("http://localhost:3001/api/webhooks/pretix", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const resJson = await response.json();
    console.log("Webhook response status:", response.status);
    console.log("Webhook response body:", resJson);

    // 3. Wait for database update to finish (it is asynchronous)
    console.log("\nWaiting 4 seconds for database sync to complete...");
    await new Promise(resolve => setTimeout(resolve, 4000));

    // 4. Fetch after state
    const after = await getRecord(subeventId);
    console.log("\n=== AFTER WEBHOOK SYNC ===");
    console.log(`Pretix ID: ${after.pretixId}`);
    console.log(`isSoldOut: ${after.isSoldOut}`);
    console.log(`availableSeats: ${after.availableSeats}`);
    console.log(`updatedAt: ${after.updatedAt}`);
    
    if (new Date(after.updatedAt).getTime() > new Date(before.updatedAt).getTime()) {
      console.log("\nSUCCESS: The database was updated successfully in real-time by the webhook!");
    } else {
      console.log("\nFAILURE: The database updatedAt did not change.");
    }

  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    await pool.end();
  }
}

main();
