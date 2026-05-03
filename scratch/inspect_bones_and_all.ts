
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const movie = await prisma.movieOverride.findFirst({
    where: {
      OR: [
        { customTrailerUrl: { contains: 'fG2XpMIPPCo' } },
        { customTrailerKeys: { has: 'fG2XpMIPPCo' } }
      ]
    }
  });

  if (movie) {
    console.log('Movie:', movie.customTitle);
    console.log('Keys:', movie.customTrailerKeys);
  } else {
    console.log('Movie not found');
  }
}

main().finally(() => prisma.$disconnect());
