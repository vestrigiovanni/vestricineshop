import { getMovieDetails, getCast, getMovieTrailer, getMovieTrailers, searchMovies, getItalianRating, getEnhancedRating } from '@/services/tmdb';
import { listSubEvents, listQuotas, getSeatingPlansMap, limitConcurrency } from '@/services/pretix';
import { ITEM_INTERO_ID, ITEM_VIP_ID } from '@/constants/pretix';
import MovieShowcase, { GroupedMovie } from '@/components/MovieShowcase/MovieShowcase';
import WeeklyCinemaCalendar from '@/components/WeeklyCinemaCalendar/WeeklyCinemaCalendar';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function Home() {
  // Step 1: Get all future sub-events and seating plans
  const [rawSubEvents, roomsMap] = await Promise.all([
    listSubEvents(true),
    getSeatingPlansMap(),
  ]);

  // Step 2: For each sub-event, fetch its specific quotas in parallel with concurrency limit.
  // This prevents 429 errors when many sub-events are present.
  const quotaResults = await limitConcurrency(
    rawSubEvents.map(se => () => listQuotas(se.id)),
    5 // Slightly higher limit for homepage if only fetching one type of data
  );

  // Step 3: Build a Map of subeventId -> quotas for fast lookup
  const quotasBySubevent = new Map<number, any[]>();
  rawSubEvents.forEach((se, index) => {
    quotasBySubevent.set(se.id, quotaResults[index]);
  });
  // Step 4: Calculate isSoldOut and map roomName for EVERY subevent
  const subEvents = rawSubEvents.map(se => {
    const seQuotas = quotasBySubevent.get(se.id) || [];

    let isSoldOut = false;
    let totalAvailable = 0;

    if (!seQuotas || seQuotas.length === 0) {
      // FAIL-SAFE: Se non ci sono dati sulle quote o l'API fallisce, la variabile isSoldOut deve essere sempre FALSE.
      isSoldOut = false;
    } else {
      const relevantQuotas = seQuotas.filter((q: any) =>
        Array.isArray(q.items) && q.items.some((id: any) =>
          String(id) === String(ITEM_INTERO_ID) || String(id) === String(ITEM_VIP_ID)
        )
      );

      const hasUnlimited = relevantQuotas.some((q: any) => q.available_number === null);

      if (relevantQuotas.length === 0 || hasUnlimited) {
        // FAIL-SAFE: Se non troviamo quote specifiche o sono illimitate, consideriamo disponibile.
        isSoldOut = false;
      } else {
        totalAvailable = relevantQuotas.reduce((acc: number, q: any) => acc + (Number(q.available_number) || 0), 0);
        isSoldOut = totalAvailable === 0; // Solo se la somma totale è zero è davvero esaurito
      }
    }

    // Manual presale override
    if (se.active && se.presale_is_running === false) {
      isSoldOut = true;
    }

    // --- Dynamic Room Name ---
    const roomName = se.seating_plan ? (roomsMap[se.seating_plan] || 'Sala') : 'Sala';

    return {
      ...se,
      isSoldOut,
      isHidden: false,
      roomName,
    };
  });

  // Group subevents by TMDB ID
  const groupedRecord: Record<string, { tmdbMovie: any, subevents: any[] }> = {};

  const now = new Date();
  const CUTOFF_MINUTES = 2;

  for (const se of subEvents) {
    // ── TMDB ID Resolution ───────────────────────────────────
    let tmdbId = null;
    if (se.comment) {
      try {
        const commentData = JSON.parse(se.comment);
        tmdbId = commentData.tmdbId;
      } catch (e) {
        const tmdbIdMatch = se.comment.match(/TMDB_ID:(\d+)/);
        tmdbId = tmdbIdMatch ? tmdbIdMatch[1] : null;
      }
    }

    if (!tmdbId && se.name?.it) {
      const cleanTitle = se.name.it
        .replace(/\(.*?\)/g, "")
        .replace(/\[.*?\]/g, "")
        .replace(/Proiezione\s+\d+/gi, "")
        .replace(/ - /g, " ")
        .trim();
        
      const results = await searchMovies(cleanTitle);
      if (results && results.length > 0) {
        tmdbId = results[0].id.toString();
      }
    }

    // ── Apply Calculated Rating to ALL subevents (for Calendar) ──
    if (tmdbId) {
      if (!groupedRecord[tmdbId]) {
        const tmdbMovie = await getMovieDetails(tmdbId);
        if (tmdbMovie) {
          groupedRecord[tmdbId] = { tmdbMovie, subevents: [] };
        }
      }
      
      if (groupedRecord[tmdbId]) {
        const calculatedRating = await getEnhancedRating(groupedRecord[tmdbId].tmdbMovie);
        se.calculatedRating = calculatedRating;
      }
    }

    // ── Showcase Filtering ────────────────────────────────────
    if (!se.active || se.isHidden) continue;

    // EXTREMELY IMPORTANT: Only include sub-events that have an ASSIGNED seating plan.
    if (se.seating_plan === null) {
      console.log(`[Home] ⚠️ Skipping showcase entry for sub-event ${se.id} ("${se.name?.it}") - NO SEATING PLAN`);
      continue;
    }

    // Filter out screenings starting in < 2 minutes (or already started)
    const startTime = new Date(se.date_from);
    if (startTime.getTime() - now.getTime() < CUTOFF_MINUTES * 60 * 1000) {
      continue;
    }

    if (!tmdbId) continue;

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
        rating: se.calculatedRating
      });
    }
  }

  // Use the now-enriched subEvents array for the calendar
  const enrichedSubEvents = subEvents;

  // Format the grouped movies array
  const movies: GroupedMovie[] = await Promise.all(Object.values(groupedRecord).map(async (entry) => {
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

    const trailerKeys = await getMovieTrailers(String(entry.tmdbMovie.id), entry.tmdbMovie.original_language);
    const trailerKey = trailerKeys[0] || null;

    // Extract a consistent, high-quality "no language" backdrop (still)
    let backdrop_path = entry.tmdbMovie.backdrop_path;
    if (entry.tmdbMovie.images?.backdrops && entry.tmdbMovie.images.backdrops.length > 0) {
      const allBackdrops = entry.tmdbMovie.images.backdrops;
      // 1. Filter for "no language" (language-agnostic)
      const noLangBackdrops = allBackdrops.filter((b: any) => !b.iso_639_1);
      
      // 2. Filter for high quality (HD+) and sort by rating
      const highQualityPool = (noLangBackdrops.length > 0 ? noLangBackdrops : allBackdrops)
        .filter((b: any) => b.width >= 1920)
        .sort((a: any, b: any) => (b.vote_average || 0) - (a.vote_average || 0) || (b.vote_count || 0) - (a.vote_count || 0));

      // 3. Fallback to basic pool if no HD found
      const finalPool = highQualityPool.length > 0 ? highQualityPool : (noLangBackdrops.length > 0 ? noLangBackdrops : allBackdrops);
      
      // 4. Deterministic selection based on ID (no change on refresh)
      const backdropIndex = Number(entry.tmdbMovie.id) % finalPool.length;
      backdrop_path = finalPool[backdropIndex].file_path;
    }

    return {
      id: entry.tmdbMovie.id,
      title: entry.tmdbMovie.title,
      overview: entry.tmdbMovie.overview,
      poster_path: entry.tmdbMovie.poster_path,
      backdrop_path: backdrop_path,
      logo_path: logo_path,
      release_date: entry.tmdbMovie.release_date,
      director: director,
      runtime: entry.tmdbMovie.runtime,
      subevents: entry.subevents,
      isSoldOut: isSoldOut,
      cast: getCast(entry.tmdbMovie, 5),
      trailerKey: trailerKey,
      trailerKeys: trailerKeys,
      rating: await getEnhancedRating(entry.tmdbMovie),
    };
  }));
  
  // --- Server-side Sorting ---
  // Ensure the movies are sorted by availability and next showtime before being sent to the client.
  // This minimizes hydration mismatches and ensures the carousel starts on the correct movie.
  movies.sort((a, b) => {
    // 1. Available movies first
    if (!a.isSoldOut && b.isSoldOut) return -1;
    if (a.isSoldOut && !b.isSoldOut) return 1;

    // 2. Sort by next showtime
    const getNextShowDate = (m: GroupedMovie) => {
      // If movie is sold out, use all subevents. If NOT, use only available ones.
      const shows = m.isSoldOut 
        ? m.subevents 
        : m.subevents.filter(se => !se.isSoldOut);
      
      if (shows.length === 0) return Infinity;
      return Math.min(...shows.map(s => new Date(s.date).getTime()));
    };

    return getNextShowDate(a) - getNextShowDate(b);
  });



  return (
    <main className={styles.main}>
      <MovieShowcase movies={movies} />
      <WeeklyCinemaCalendar subEvents={enrichedSubEvents} />
    </main>
  );
}
