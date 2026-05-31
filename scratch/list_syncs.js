const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
