const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const projections = await prisma.pretixSync.findMany({
    include: { movie: true },
    take: 5
  });
  console.log(JSON.stringify(projections, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
