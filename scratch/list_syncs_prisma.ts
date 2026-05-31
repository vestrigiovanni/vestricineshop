import fs from 'fs';
import path from 'path';

// Manual loading of .env.local
try {
  const envPath = path.resolve(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        // Remove surrounding quotes if any
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    }
  }
} catch (e) {
  console.warn("Could not load .env.local manually:", e);
}

// Override connection to use standard sslmode=require instead of verify-full for local execution
const requireSslUrl = "postgresql://neondb_owner:npg_FHb4RK6EczDx@ep-quiet-bar-al8uyd1h-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require";
process.env.DATABASE_URL = requireSslUrl;
process.env.POSTGRES_PRISMA_URL = requireSslUrl;
process.env.POSTGRES_URL = requireSslUrl;
process.env.POSTGRES_URL_NON_POOLING = requireSslUrl;
console.log("Using DATABASE_URL with sslmode=require for local testing.");

import prisma from '../src/lib/prisma';

async function main() {
  try {
    const syncs = await prisma.pretixSync.findMany({
      take: 5,
      orderBy: { dateFrom: 'asc' }
    });
    console.log("=== FIRST 5 PROJECTIONS IN DB ===");
    console.log(JSON.stringify(syncs, null, 2));
  } catch (err) {
    console.error("Query failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
