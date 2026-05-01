const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Testing DB connection...');
  const count = await prisma.pretixSync.count();
  console.log('Projections count:', count);
  
  const sample = await prisma.pretixSync.findFirst();
  console.log('Sample Projection:', JSON.stringify(sample, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
