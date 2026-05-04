import prisma from '../src/lib/prisma';
import { fetchMubiAwards } from '../src/services/mubi';

async function main() {
  const tmdbId = '933260';
  const movie = await prisma.movieOverride.findUnique({
    where: { tmdbId },
    include: { awards: true }
  });

  if (!movie) {
    console.log('Movie not found');
    return;
  }

  console.log('Current awards count:', movie.awards.length);

  const mubiData = await fetchMubiAwards(tmdbId, 'The Substance', 'The Substance', '2024');
  if (!mubiData) {
    console.log('No MUBI data found');
    return;
  }

  console.log('MUBI awards found:', mubiData.awards.length);

  // Delete old awards and insert new ones
  await prisma.movieAward.deleteMany({
    where: { tmdbId }
  });

  for (const award of mubiData.awards) {
    await prisma.movieAward.create({
      data: {
        tmdbId,
        type: award.type,
        label: award.label,
        details: award.details,
        year: award.year
      }
    });
  }

  // Also update mubiId if it's missing or different
  if (mubiData.mubiId && movie.mubiId !== mubiData.mubiId) {
    await prisma.movieOverride.update({
      where: { tmdbId },
      data: { mubiId: mubiData.mubiId }
    });
  }

  console.log('Updated awards for The Substance');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
