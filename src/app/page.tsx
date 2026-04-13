import { getMovieDetails, getCast, getTrailerKey } from '@/services/tmdb';
import { listSubEvents, listQuotas } from '@/services/pretix';
import { ITEM_INTERO_ID } from '@/constants/pretix';
import MovieShowcase, { GroupedMovie } from '@/components/MovieShowcase/MovieShowcase';
import WeeklyCinemaCalendar from '@/components/WeeklyCinemaCalendar/WeeklyCinemaCalendar';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function Home() {
  // Step 1: Get all future sub-events
  const rawSubEvents = await listSubEvents(true);

  // Step 2: For each sub-event, fetch its specific quotas in parallel.
  // This is critical because fetching ALL quotas (6000+) only returns the first
  // page (50 results) which contains old/past sub-events, never the current ones.
  const quotaResults = await Promise.all(
    rawSubEvents.map(se => listQuotas(se.id))
  );

  // Step 3: Build a Map of subeventId -> quotas for fast lookup
  const quotasBySubevent = new Map<number, any[]>();
  rawSubEvents.forEach((se, index) => {
    quotasBySubevent.set(se.id, quotaResults[index]);
  });

  // Step 4: Calculate isSoldOut for EVERY subevent using the precise 'Intero' quota
  const subEvents = rawSubEvents.map(se => {
    const seQuotas = quotasBySubevent.get(se.id) || [];

    // Find the quota that governs "Biglietto Intero" (Item ID 264975)
    const interoQuota = seQuotas.find((q: any) =>
      Array.isArray(q.items) && q.items.includes(ITEM_INTERO_ID)
    );

    // --- Sold Out Logic ---
    // Priority 1: Intero quota available_number is explicitly 0 or below
    // Priority 2: Intero quota has available === false (Pretix boolean flag)
    // Priority 3: Pretix overall best_availability_state says sold_out
    // Safety: If no intero quota found, do NOT mark as sold out (avoid false positives)
    const isSoldOut = interoQuota
      ? (interoQuota.available === false || (interoQuota.available_number !== null && interoQuota.available_number <= 0))
      : (se.best_availability_state === 'sold_out');

    // Diagnostic log (server-side only, visible in terminal running `npm run dev`)
    if (isSoldOut) {
      const title = typeof se.name === 'string' ? se.name : se.name?.it || '?';
      console.log(
        `🔴 SOLD OUT | "${title}" | SubEvent ${se.id} | ` +
        `Quota: ${interoQuota ? `available=${interoQuota.available}, available_number=${interoQuota.available_number}` : 'NO INTERO QUOTA'} | ` +
        `best_availability_state=${se.best_availability_state}`
      );
    }

    return {
      ...se,
      isSoldOut,
    };
  });

  // Group subevents by TMDB ID
  const groupedRecord: Record<string, { tmdbMovie: any, subevents: any[] }> = {};

  const now = new Date();
  const CUTOFF_MINUTES = 2;

  for (const se of subEvents) {
    // ── Pre-Filter ───────────────────────────────────────────
    if (!se.active) continue;
    
    // EXTREMELY IMPORTANT: Only include sub-events that have an ASSIGNED seating plan.
    // If seating_plan is null, the sub-event is "General Admission" (Posto Libero)
    // and the interactive SeatMap will fail/be empty.
    if (se.seating_plan === null) {
      console.log(`[Home] ⚠️ Skipping sub-event ${se.id} ("${se.name?.it}") - NO SEATING PLAN ASSIGNED`);
      continue;
    }

    // Filter out screenings starting in < 2 minutes (or already started)
    const startTime = new Date(se.date_from);
    if (startTime.getTime() - now.getTime() < CUTOFF_MINUTES * 60 * 1000) {
      continue;
    }

    let tmdbId = null;
    if (se.comment) {
      try {
        const commentData = JSON.parse(se.comment);
        tmdbId = commentData.tmdbId;
      } catch (e) {
        // Fallback in case it's a normal string
        const tmdbIdMatch = se.comment.match(/TMDB_ID:(\d+)/);
        tmdbId = tmdbIdMatch ? tmdbIdMatch[1] : null;
      }
    }
    
    if (!tmdbId) continue;
    
    if (!groupedRecord[tmdbId]) {
      const tmdbMovie = await getMovieDetails(tmdbId);
      if (tmdbMovie) {
        groupedRecord[tmdbId] = {
          tmdbMovie,
          subevents: []
        };
      }
    }

    if (groupedRecord[tmdbId]) {
      const lingua = se.meta_data?.lingua || '';
      const sottotitoli = se.meta_data?.sottotitoli || '';
      const format = se.meta_data?.format || '';

      groupedRecord[tmdbId].subevents.push({
        id: se.id,
        date: se.date_from,
        isSoldOut: se.isSoldOut,
        language: lingua,
        subtitles: sottotitoli,
        format: format,
      });
    }
  }

  // Format the grouped movies array
  const movies: GroupedMovie[] = Object.values(groupedRecord).map(entry => {
    const director = entry.tmdbMovie.credits?.crew?.find((c: any) => c.job === 'Director')?.name || 'Sconosciuto';
    
    // Movie-level sold out: ALL future screenings are sold out
    const isSoldOut = entry.subevents.length > 0 && entry.subevents.every(se => se.isSoldOut === true);
    
    // Extract best logo (Italian first, then English, then first available)
    let logo_path = null;
    if (entry.tmdbMovie.images?.logos && entry.tmdbMovie.images.logos.length > 0) {
      const logos = entry.tmdbMovie.images.logos;
      const itLogo = logos.find((l: any) => l.iso_639_1 === 'it');
      const enLogo = logos.find((l: any) => l.iso_639_1 === 'en');
      logo_path = itLogo?.file_path || enLogo?.file_path || logos[0]?.file_path || null;
    }

    return {
      id: entry.tmdbMovie.id,
      title: entry.tmdbMovie.title,
      overview: entry.tmdbMovie.overview,
      poster_path: entry.tmdbMovie.poster_path,
      backdrop_path: entry.tmdbMovie.backdrop_path,
      logo_path: logo_path,
      release_date: entry.tmdbMovie.release_date,
      director: director,
      runtime: entry.tmdbMovie.runtime,
      subevents: entry.subevents,
      isSoldOut: isSoldOut,
      cast: getCast(entry.tmdbMovie, 5),
      trailerKey: getTrailerKey(entry.tmdbMovie),
    };
  });


  return (
    <main className={styles.main}>
      <MovieShowcase movies={movies} />
      <WeeklyCinemaCalendar subEvents={subEvents} />
    </main>
  );
}
