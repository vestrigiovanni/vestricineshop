
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const projections = await prisma.pretixSync.findMany({
    where: { active: true, isHidden: false },
    take: 5,
    include: {
      movie: true
    }
  });

  console.log('Current Active Movies and Trailers:');
  projections.forEach(p => {
    console.log(`- ${p.name} (TMDB: ${p.tmdbId})`);
    console.log(`  Url: ${p.movie?.customTrailerUrl}`);
    console.log(`  Keys: ${JSON.stringify((p.movie as any)?.customTrailerKeys)}`);
  });
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
