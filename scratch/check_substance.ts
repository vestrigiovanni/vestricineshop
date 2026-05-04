import prisma from '../src/lib/prisma';

async function main() {
  const movie = await prisma.movieOverride.findFirst({
    where: {
      OR: [
        { customTitle: { contains: 'Substance', mode: 'insensitive' } },
        { tmdbId: '933260' }
      ]
    },
    include: {
      awards: true
    }
  });

  if (movie) {
    console.log('Movie found:', JSON.stringify(movie, null, 2));
  } else {
    console.log('Movie "The Substance" not found in MovieOverride');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
