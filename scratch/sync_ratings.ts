import { listSubEvents, updateSubEvent } from '../src/services/pretix';
import { getMovieDetails, getEnhancedRating } from '../src/services/tmdb';

async function syncRatings() {
  console.log('🚀 Avvio sincronizzazione rating su Pretix...');
  
  try {
    const subevents = await listSubEvents(true); // Solo futuri
    console.log(`Trovati ${subevents.length} eventi da controllare.`);

    for (const se of subevents) {
      let tmdbId = null;
      let currentMetadata: any = {};

      if (se.comment) {
        try {
          currentMetadata = JSON.parse(se.comment);
          tmdbId = currentMetadata.tmdbId;
        } catch (e) {
          const tmdbIdMatch = se.comment.match(/TMDB_ID:(\d+)/);
          tmdbId = tmdbIdMatch ? tmdbIdMatch[1] : null;
        }
      }

      if (!tmdbId) {
        console.log(`[Sync] Salto evento ${se.id} ("${se.name.it || se.name}"): Nessun TMDB ID.`);
        continue;
      }

      const details = await getMovieDetails(tmdbId);
      if (!details) {
        console.log(`[Sync] Salto evento ${se.id}: Impossibile recuperare dettagli TMDB per ID ${tmdbId}.`);
        continue;
      }

      const correctRating = await getEnhancedRating(details);
      
      if (currentMetadata.rating !== correctRating) {
        console.log(`[Sync] Aggiornamento rating per "${se.name.it || se.name}": ${currentMetadata.rating || 'N/D'} -> ${correctRating}`);
        
        const newMetadata = {
          ...currentMetadata,
          rating: correctRating
        };

        await updateSubEvent(se.id, {
          comment: JSON.stringify(newMetadata)
        });
        console.log(`[Sync] ✅ ID ${se.id} aggiornato.`);
      } else {
        console.log(`[Sync] Rating già corretto per "${se.name.it || se.name}" (${correctRating}).`);
      }
    }

    console.log('✨ Sincronizzazione completata!');
  } catch (error) {
    console.error('❌ Errore durante la sincronizzazione:', error);
  }
}

syncRatings();
