import prisma from '../src/lib/prisma';

async function checkDiva() {
  const d = await prisma.movieOverride.findUnique({
    where: { tmdbId: '1141163' },
    include: { awards: true }
  });
  console.log(JSON.stringify(d?.awards, null, 2));
}

checkDiva();
