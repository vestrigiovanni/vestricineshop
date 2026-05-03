
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const movies = await prisma.movieOverride.findMany({
    select: {
      tmdbId: true,
      customTitle: true,
      customTrailerUrl: true,
    }
  });

  console.log('Movies and Trailers:');
  movies.forEach(m => {
    console.log(`- ${m.customTitle} (ID: ${m.tmdbId}): ${m.customTrailerUrl}`);
  });
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
