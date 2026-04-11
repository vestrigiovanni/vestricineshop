'use server';

import { listSubEvents, listQuotas } from '@/services/pretix';
import { ITEM_INTERO_ID } from '@/constants/pretix';
import { getMovieDetails } from '@/services/tmdb';

export interface DisplayMovieData {
  id: number;
  title: string;
  date_from: string;
  date_to: string;
  posterPath: string;
  backdropPath: string;
  director: string;
  cast: string;
  overview: string;
  runtime: number;
  language: string;
  subtitles: string;
  logoPath?: string;
  isSoldOut?: boolean;
}

export async function getDisplayData() {
  try {
    // 1. Fetch all upcoming/current events from Pretix and all quotas
    const [events, allQuotas] = await Promise.all([
      listSubEvents(true),
      listQuotas()
    ]);
    
    // 2. Parse metadata and check availability from event object
    const movieDetailsPromises = events.map(async (event) => {
      let metadata: any = {};
      try {
        if (event.comment) {
          metadata = JSON.parse(event.comment);
        }
      } catch (e) {
        console.error('Failed to parse metadata for event', event.id, e);
      }

      // 3. Real-time availability check using 'Biglietto Intero' Quota
      // Find the quota that matches this sub-event and includes the 'Intero' item
      const interoQuota = allQuotas.find((q: any) => 
        q.subevent === event.id && 
        q.items.includes(ITEM_INTERO_ID)
      );

      // Trigger SOLD OUT if:
      // - The specific 'Intero' quota is 0 or less
      // - OR Pretix says the whole sub-event is 'sold_out'
      // - OR presale is explicitly marked as not running
      const isSoldOut = 
        (interoQuota && interoQuota.available_number !== null && interoQuota.available_number <= 0) ||
        event.best_availability_state === 'sold_out' ||
        (event.active && event.presale_is_running === false);

      // 4. Fetch additional TMDB assets
      let backdropPath = metadata.backdropPath || '';
      let logoPath = '';
      
      if (metadata.tmdbId) {
        const tmdbDetails = await getMovieDetails(metadata.tmdbId);
        if (tmdbDetails) {
          backdropPath = tmdbDetails.backdrop_path || backdropPath;
          if (tmdbDetails.images?.logos && tmdbDetails.images.logos.length > 0) {
             const logo = tmdbDetails.images.logos.find(l => l.iso_639_1 === 'it') || 
                          tmdbDetails.images.logos.find(l => l.iso_639_1 === 'en') || 
                          tmdbDetails.images.logos[0];
             logoPath = logo.file_path;
          }
        }
      }

      return {
        id: event.id,
        title: event.name.it || event.name,
        date_from: event.date_from,
        date_to: event.date_to,
        posterPath: metadata.posterPath || '',
        backdropPath,
        logoPath,
        director: metadata.director || 'N/D',
        cast: Array.isArray(metadata.cast) ? metadata.cast.join(', ') : (metadata.cast || ''),
        overview: metadata.overview || '',
        runtime: metadata.runtime || 120,
        language: metadata.language || 'Italiano',
        subtitles: metadata.subtitles || 'Italiano',
        isSoldOut
      } as DisplayMovieData;
    });

    const displayMovies = await Promise.all(movieDetailsPromises);
    
    // Sort by date_from (just in case, listSubEvents should already do this)
    return displayMovies.sort((a, b) => new Date(a.date_from).getTime() - new Date(b.date_from).getTime());
  } catch (error) {
    console.error('Error in getDisplayData:', error);
    return [];
  }
}
