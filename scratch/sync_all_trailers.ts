
import * as dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/lib/prisma';
import { getEnrichedMovieMetadata } from '../src/services/tmdb';
import { saveOverride, deleteMovieMetadata } from '../src/services/db.service';

async function syncAllTrailers() {
  console.log('🚀 SYNC ALL TRAILERS\n');
  try {
    const overrides = await prisma.movieOverride.findMany({
      select: { tmdbId: true, customTitle: true }
    });

    console.log(`🎬 Trovati ${overrides.length} film da aggiornare.\n`);

    for (const o of overrides) {
      deleteMovieMetadata(o.tmdbId);
      
      const metadata = await getEnrichedMovieMetadata(o.tmdbId);
      if (metadata) {
        console.log(`🍿 Syncing ${metadata.title}: Found ${metadata.trailerKeys?.length || 0} trailers.`);
        await prisma.movieOverride.update({
          where: { tmdbId: o.tmdbId },
          data: {
            customTrailerKeys: metadata.trailerKeys || []
          }
        });
      }
    }
    console.log('\n✅ SYNC COMPLETATO!');
  } catch (e) {
    console.error('❌ ERRORE:', e);
  } finally {
    await prisma.$disconnect();
  }
}

syncAllTrailers();
