import prisma from '../src/lib/prisma';
import { getMovieDetails } from '../src/services/tmdb';
import { pickExtraBackdrops } from '../src/services/tmdb.utils';

async function main() {
  const movies = await prisma.movieOverride.findMany({
    where: { projections: { some: { active: true, dateFrom: { gte: new Date() } } } },
  });
  console.log(`Trovati ${movies.length} film con proiezioni future.`);

  let updated = 0;
  for (const m of movies) {
    const needsTagline = !m.tagline;
    const needsBackdrops = m.extraBackdrops.length === 0;
    if (!needsTagline && !needsBackdrops) {
      console.log(`- ${m.customTitle} (${m.tmdbId}): già completo, salto.`);
      continue;
    }

    const details = await getMovieDetails(m.tmdbId);
    if (!details) {
      console.log(`- ${m.customTitle} (${m.tmdbId}): TMDB non risponde, salto.`);
      continue;
    }

    const data: { tagline?: string | null; extraBackdrops?: string[] } = {};
    if (needsTagline) data.tagline = details.tagline || null;
    if (needsBackdrops) {
      data.extraBackdrops = pickExtraBackdrops(details.images?.backdrops || [], m.customBackdropPath);
    }

    await prisma.movieOverride.update({ where: { tmdbId: m.tmdbId }, data });
    updated++;
    const t = needsTagline ? (data.tagline ? `"${data.tagline}"` : 'assente su TMDB') : 'già presente';
    const b = needsBackdrops ? `${data.extraBackdrops!.length} trovati` : 'già presenti';
    console.log(`- ${m.customTitle} (${m.tmdbId}): tagline=${t}, extraBackdrops=${b}`);
  }
  console.log(`Fatto: ${updated} film aggiornati su ${movies.length}.`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
