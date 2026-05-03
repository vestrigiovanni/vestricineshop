
import prisma from '../src/lib/prisma';

async function main() {
  console.log('--- VERIFICA INCROCIATA ID ---');
  const pretixData = await (prisma as any).$queryRaw`SELECT "name", "tmdbId" FROM "PretixSync" WHERE "name" ILIKE '%Ken Park%' LIMIT 1`;
  const overrideData = await (prisma as any).$queryRaw`SELECT "customTitle", "tmdbId" FROM "MovieOverride" WHERE "customTitle" ILIKE '%Ken Park%' LIMIT 1`;
  
  console.log('ID in PretixSync:', pretixData);
  console.log('ID in MovieOverride:', overrideData);
}

main().catch(console.error).finally(() => prisma.$disconnect());
