import prisma from '../src/lib/prisma';
import { getEnrichedMovieMetadata } from '../src/services/tmdb';
import { saveOverride } from '../src/services/db.service';

async function refreshAllAwards() {
  console.log('🚀 REFRESH TOTALE PREMI (NUOVA TABELLA)\n');

  try {
    const upcomingProjections = await prisma.pretixSync.findMany({
      where: {
        dateFrom: { gte: new Date() },
        tmdbId: { not: null }
      },
      select: { tmdbId: true },
      distinct: ['tmdbId']
    });

    const tmdbIds = upcomingProjections.map(p => p.tmdbId as string);
    console.log(`🎬 Elaborazione di ${tmdbIds.length} film.\n`);

    for (const tmdbId of tmdbIds) {
      // Puliamo la cache per forzare il recupero dei nuovi festival
      const { deleteMovieMetadata } = await import('../src/services/db.service');
      deleteMovieMetadata(tmdbId);

      const metadata = await getEnrichedMovieMetadata(tmdbId);
      if (!metadata) continue;

      console.log(`🍿 Film: ${metadata.title}`);
      const awards = metadata.awards || [];
      
      if (awards.length > 0) {
        console.log(`   🏆 Trovati ${awards.length} premi: ${awards.map((a: any) => a.type).join(', ')}`);
      }

      await saveOverride(tmdbId, {
        mubiId: metadata.mubiId,
        awards: awards
      });
      console.log('   ✅ DB Aggiornato.');
    }

    console.log('\n✨ REFRESH COMPLETATO!');
  } catch (error) {
    console.error('❌ ERRORE:', error);
  } finally {
    await prisma.$disconnect();
  }
}

refreshAllAwards();
