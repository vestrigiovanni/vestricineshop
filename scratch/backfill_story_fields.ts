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
    const needsGenres = m.genres.length === 0;
    const needsVote = m.voteAverage == null;
    if (!needsTagline && !needsBackdrops && !needsGenres && !needsVote) {
      console.log(`- ${m.customTitle} (${m.tmdbId}): già completo, salto.`);
      continue;
    }

    const details = await getMovieDetails(m.tmdbId);
    if (!details) {
      console.log(`- ${m.customTitle} (${m.tmdbId}): TMDB non risponde, salto.`);
      continue;
    }

    const data: { tagline?: string | null; extraBackdrops?: string[]; genres?: string[]; voteAverage?: number | null } = {};
    if (needsTagline) data.tagline = details.tagline || null;
    if (needsBackdrops) {
      data.extraBackdrops = pickExtraBackdrops(details.images?.backdrops || [], m.customBackdropPath);
    }
    if (needsGenres) data.genres = (details.genres || []).map(g => g.name).filter(Boolean);
    if (needsVote) data.voteAverage = details.vote_average || null;

    await prisma.movieOverride.update({ where: { tmdbId: m.tmdbId }, data });
    updated++;
    const parts = [
      needsTagline ? `tagline=${data.tagline ? `"${data.tagline}"` : 'assente'}` : null,
      needsBackdrops ? `backdrops=${data.extraBackdrops!.length}` : null,
      needsGenres ? `generi=[${data.genres!.join(', ')}]` : null,
      needsVote ? `voto=${data.voteAverage ?? 'n/d'}` : null,
    ].filter(Boolean).join(', ');
    console.log(`- ${m.customTitle} (${m.tmdbId}): ${parts}`);
  }
  console.log(`Fatto: ${updated} film aggiornati su ${movies.length}.`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
