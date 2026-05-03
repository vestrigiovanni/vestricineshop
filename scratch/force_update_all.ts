import prisma from '../src/lib/prisma';
import { getEnrichedMovieMetadata } from '../src/services/tmdb';
import { saveOverride } from '../src/services/db.service';

async function forceUpdateAll() {
  console.log('🚀 FORCE UPDATE ALL MOVIES\n');
  try {
    const overrides = await prisma.movieOverride.findMany({
      select: { tmdbId: true }
    });

    console.log(`🎬 Trovati ${overrides.length} film da aggiornare.\n`);

    for (const o of overrides) {
      const { deleteMovieMetadata } = await import('../src/services/db.service');
      deleteMovieMetadata(o.tmdbId);
      
      const metadata = await getEnrichedMovieMetadata(o.tmdbId);
      if (metadata) {
        console.log(`🍿 Syncing: ${metadata.title} [Awards: ${metadata.awards?.length || 0}]`);
        await saveOverride(o.tmdbId, {
          mubiId: metadata.mubiId,
          awards: metadata.awards
        });
      }
    }
    console.log('\n✅ UPDATE COMPLETATO!');
  } catch (e) {
    console.error('❌ ERRORE:', e);
  } finally {
    await prisma.$disconnect();
  }
}

forceUpdateAll();
