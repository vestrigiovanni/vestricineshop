import prisma from '../src/lib/prisma';

async function listAwards() {
  const awards = await prisma.movieAward.findMany({
    include: { movie: { select: { customTitle: true } } }
  });
  
  console.log(`\n🏆 LISTA PREMI NEL DB (${awards.length} record)\n`);
  
  awards.forEach(a => {
    console.log(`🎬 Film: ${a.movie.customTitle} (${a.tmdbId})`);
    console.log(`   🏆 ${a.label} (${a.type}): ${a.details}`);
    console.log('---');
  });
}

listAwards();
