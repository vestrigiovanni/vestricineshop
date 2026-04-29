import { getEnrichedMovieMetadata, searchMovies } from '@/services/tmdb';
import { listSubEvents, getSeatingPlansMap } from '@/services/pretix';
import { adminGetOverrides } from '@/actions/adminActions';
import { saveOverride } from '@/services/db.service';
import { getAvailabilityMap } from '@/services/availability.service';
import MovieShowcase, { GroupedMovie } from '@/components/MovieShowcase/MovieShowcase';
import WeeklyCinemaCalendar from '@/components/WeeklyCinemaCalendar/WeeklyCinemaCalendar';
import { extractYouTubeId } from '@/utils/youtubeUtils';
import styles from './page.module.css';
import { unstable_noStore as noStore } from 'next/cache';

// SSR puro: ogni richiesta legge sempre gli override aggiornati dal DB.
export const dynamic = 'force-dynamic';

export default async function Home() {
  noStore(); // Forza no-cache a livello di segmento
  
  // Step 1: Get all future sub-events, rooms, overrides AND availability
  const [rawSubEvents, roomsMap, overrides, availabilityMap] = await Promise.all([
    listSubEvents(true),
    getSeatingPlansMap(),
    adminGetOverrides(),
    getAvailabilityMap()
  ]);

  // Step 2: Calculate isSoldOut and map roomName for EVERY subevent
  const subEvents = rawSubEvents.map(se => {
    // Check if it's sold out in the map (or fallback to se.best_availability_state)
    const isSoldOut = availabilityMap[se.id] ?? (se.best_availability_state === 'sold_out');

    // --- Dynamic Room Name ---
    const roomName = se.seating_plan ? (roomsMap[se.seating_plan] || 'Sala') : 'Sala';

    return {
      ...se,
      isSoldOut,
      isHidden: false,
      roomName,
    };
  });

  // Step 5: Resolve TMDB IDs and fetch metadata in PARALLEL
  // This is the key to speeding up the first load.
  const tmdbIdMap = new Map<number, string | null>();
  const titlesToSearch = new Set<string>();
  const seToTitle = new Map<number, string>();

  // A. Initial pass: resolve from comments or prepare for search
  subEvents.forEach(se => {
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

    if (tmdbId) {
      tmdbIdMap.set(se.id, tmdbId.toString());
    } else if (se.name?.it) {
      const cleanTitle = se.name.it
        .replace(/\(.*?\)/g, "")
        .replace(/\[.*?\]/g, "")
        .replace(/Proiezione\s+\d+/gi, "")
        .replace(/ - /g, " ")
        .trim();
      seToTitle.set(se.id, cleanTitle);
      titlesToSearch.add(cleanTitle);
    }
  });

  // B. Search missing titles in parallel
  const searchResultsMap = new Map<string, string | null>();
  await Promise.all(Array.from(titlesToSearch).map(async title => {
    const results = await searchMovies(title, false); // Optimized: no enrichment during initial search
    if (results && results.length > 0) {
      searchResultsMap.set(title, results[0].id.toString());
    }
  }));

  // C. Map searched IDs back to sub-events
  subEvents.forEach(se => {
    if (!tmdbIdMap.has(se.id)) {
      const title = seToTitle.get(se.id);
      if (title && searchResultsMap.has(title)) {
        tmdbIdMap.set(se.id, searchResultsMap.get(title)!);
      }
    }
  });

  // D. Fetch all metadata in parallel
  const uniqueTmdbIds = new Set(Array.from(tmdbIdMap.values()).filter(Boolean) as string[]);
  const metadataMap = new Map<string, any>();
  await Promise.all(Array.from(uniqueTmdbIds).map(async id => {
    const meta = await getEnrichedMovieMetadata(id);
    if (meta) metadataMap.set(id, meta);
  }));

  // Step 6: Final grouping and enrichment
  const groupedRecord: Record<string, { tmdbMovie: any, subevents: any[] }> = {};
  const now = new Date();
  const CUTOFF_MINUTES = 2;

  for (const se of subEvents) {
    const tmdbId = tmdbIdMap.get(se.id);
    if (!tmdbId) continue;

    const movieMetadata = metadataMap.get(tmdbId);
    if (!movieMetadata) continue;

    // Apply metadata and overrides
    const override = overrides[tmdbId];
    
    // [DEBUG] Verifichiamo se l'override viene trovato per questo film
    if (override) {
      console.log(`[SSR] Applicando override per ${movieMetadata.title} (ID: ${tmdbId})`);
    }

    if (!groupedRecord[tmdbId]) {
      groupedRecord[tmdbId] = { tmdbMovie: movieMetadata, subevents: [] };
    }

    // Apply calculated rating
    se.calculatedRating = override?.customRating || movieMetadata.rating;

    // Manual overrides for sold out/room
    if (override?.manualSoldOut) se.isSoldOut = true;
    if (override?.customRoomName) se.roomName = override.customRoomName;

    // Filtering for showcase
    if (!se.active || se.isHidden) continue;
    if (se.seating_plan === null) continue;

    const startTime = new Date(se.date_from);
    if (startTime.getTime() - now.getTime() < CUTOFF_MINUTES * 60 * 1000) continue;

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

  // Use the now-enriched subEvents array for the calendar
  const enrichedSubEvents = subEvents;

  // Format the grouped movies array
  const movies: GroupedMovie[] = Object.values(groupedRecord).map((entry) => {
    const movie = entry.tmdbMovie;

    // Movie-level sold out: ALL future screenings are sold out
    const isSoldOut = entry.subevents.length > 0 && entry.subevents.every(se => se.isSoldOut === true);

    const movieOverride = overrides[movie.id.toString()];

    return {
      id: movie.id,
      title: movieOverride?.customTitle || movie.title,
      overview: movieOverride?.customOverview || movie.overview,
      poster_path: movieOverride?.customPosterPath || movie.poster_path,
      backdrop_path: movieOverride?.customBackdropPath || movie.backdrop_path,
      logo_path: movie.logo_path,
      release_date: movie.release_date,
      director: movieOverride?.customDirector?.join(', ') || movie.director,
      runtime: movie.runtime,
      subevents: entry.subevents,
      isSoldOut: isSoldOut,
      cast: movieOverride?.customCast || movie.cast,
      trailerKey: movieOverride?.customTrailerUrl 
        ? (extractYouTubeId(movieOverride.customTrailerUrl) || movie.trailerKey) 
        : movie.trailerKey,
      trailerKeys: movie.trailerKeys,
      rating: movieOverride?.customRating || movie.rating,
      versionLanguage: movieOverride?.versionLanguage || 'Lingua Originale',
      subtitles: movieOverride?.subtitles || 'Nessuno',
    };
  }).map(movie => {
    // AUTO-PERSISTENCE: If the movie is detected as SOLD OUT and not yet in overrides, save it
    const tmdbIdStr = movie.id.toString();
    if (movie.isSoldOut && !overrides[tmdbIdStr]?.manualSoldOut) {
      console.log(`[AUTO-SOLD-OUT] Persisting Sold Out status for: ${movie.title}`);
      saveOverride(tmdbIdStr, { manualSoldOut: true });
    }
    return movie;
  });
  
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



  // Create a unique key for the showcase based on movie data
  // This forces a full re-mount if metadata (posters, trailers) changes
  const showcaseKey = movies.map(m => `${m.id}-${m.poster_path}-${m.trailerKey}`).join('|');

  return (
    <main className={styles.main}>
      <MovieShowcase 
        key={showcaseKey}
        movies={movies} 
        initialAvailability={availabilityMap}
      />
      <WeeklyCinemaCalendar subEvents={enrichedSubEvents} />
    </main>
  );
}
