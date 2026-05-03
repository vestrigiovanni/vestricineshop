import prisma from '../src/lib/prisma';

async function listCurrentMovies() {
  const projs = await prisma.pretixSync.findMany({
    where: { dateFrom: { gte: new Date() } },
    select: { name: true, tmdbId: true },
    distinct: ['tmdbId']
  });
  console.log(JSON.stringify(projs, null, 2));
}

listCurrentMovies();
