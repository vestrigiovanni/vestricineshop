import prisma from '../src/lib/prisma';

async function test() {
  console.log('Searching for movies in DB...');
  const allMovies = await prisma.movieOverride.findMany({});
  console.log('Total movies in MovieOverride:', allMovies.length);
  for (const m of allMovies) {
    console.log(`- TMDB ID: ${m.tmdbId} | Title: ${m.customTitle} | Director: ${m.customDirector} | Logo: ${m.customLogoPath}`);
  }
  
  const allSyncs = await prisma.pretixSync.findMany({});
  console.log('\nTotal projections in PretixSync:', allSyncs.length);
  for (const s of allSyncs) {
    console.log(`- Pretix ID: ${s.pretixId} | Name: ${s.name} | TMDB ID: ${s.tmdbId}`);
  }
}

test().catch(console.error);
