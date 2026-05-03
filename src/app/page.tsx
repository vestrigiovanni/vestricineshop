import prisma from '@/lib/prisma';
import MovieShowcase, { GroupedMovie } from '@/components/MovieShowcase/MovieShowcase';
import WeeklyCinemaCalendar from '@/components/WeeklyCinemaCalendar/WeeklyCinemaCalendar';
import { extractYouTubeId } from '@/utils/youtubeUtils';
import styles from './page.module.css';
import { unstable_noStore as noStore } from 'next/cache';
import type { MovieOverride, PretixSync } from '@prisma/client';

// Define the type for the projection with the included movie
type ProjectionWithMovie = PretixSync & {
  movie: MovieOverride | null;
};

// SSR puro: legge i dati sincronizzati dal database Neon.
export const dynamic = 'force-dynamic';

export default async function Home() {
  noStore();
  
  console.log('[SSR] Caricamento homepage dal Database Neon...');
  const startTime = Date.now();

  // BACKGROUND SYNC (Standard Tecnico): 
  // Triggera una sincronizzazione chirurgica delle proiezioni future in background.
  // Essendo asincrona e non attesa (no await), non rallenta il caricamento della pagina.
  // La funzione interna gestisce il throttling (60s) per non sovraccaricare Pretix.
  (async () => {
    try {
      const { syncFutureSubeventsSurgically } = await import('@/services/sync.service');
      syncFutureSubeventsSurgically().catch(e => console.error('[BG-SYNC] Error:', e));
    } catch (e) {}
  })();

  // Una sola query SQL per recuperare tutto grazie alla relazione definita in Prisma
  const projections = (await (prisma.pretixSync as any).findMany({
    where: {
      active: true,
      isHidden: false,
      dateFrom: {
        gte: new Date(new Date().getTime() - 10 * 60 * 1000) // Mostra film iniziati da max 10 minuti
      }
    },
    include: {
      movie: {
        include: {
          awards: true
        }
      }
    },
    orderBy: {
      dateFrom: 'asc'
    }
  })) as ProjectionWithMovie[];

  // Raggruppiamo per film (tmdbId)
  const groupedRecord: Record<string, { movie: MovieOverride, subevents: any[] }> = {};
  
  for (const p of projections) {
    if (!p.tmdbId || !p.movie) continue;

    const tmdbId = p.tmdbId;
    if (!groupedRecord[tmdbId]) {
      groupedRecord[tmdbId] = { movie: p.movie, subevents: [] };
    }

    // Rispetta l'override del Sold Out manuale o quello di Pretix
    const isSoldOut = p.movie.manualSoldOut || p.isSoldOut;
    // Rispetta l'override del nome sala
    const roomName = p.movie.customRoomName || p.roomName || 'Sala';

    groupedRecord[tmdbId].subevents.push({
      id: p.pretixId,
      date: p.dateFrom.toISOString(),
      isSoldOut: isSoldOut,
      language: p.metaLingua || '',
      subtitles: p.metaSottotitoli || '',
      format: p.metaFormat || '',
      rating: p.movie.customRating || 'T',
      roomName: roomName
    });
  }

  // Prepariamo l'array finale dei film per lo Showcase
  const movies: GroupedMovie[] = Object.values(groupedRecord).map(({ movie, subevents }) => {
    // Il film è considerato Sold Out se TUTTE le sue proiezioni future lo sono
    const isMovieSoldOut = subevents.length > 0 && subevents.every((se: any) => se.isSoldOut);

    return {
      id: parseInt(movie.tmdbId),
      title: movie.customTitle || 'Senza Titolo',
      overview: movie.customOverview || '',
      poster_path: movie.customPosterPath || '',
      backdrop_path: movie.customBackdropPath || '',
      logo_path: (movie as any).customLogoPath || '', 
      release_date: (movie as any).releaseDate || '', 
      director: movie.customDirector || '',
      runtime: (movie as any).runtime || null, 
      subevents: subevents,
      isSoldOut: isMovieSoldOut,
      cast: movie.customCast ? movie.customCast.split(',').map((s: string) => s.trim()) : [],
      trailerKey: extractYouTubeId(movie.customTrailerUrl || '') || '',
      trailerKeys: [],
      rating: movie.customRating || 'T',
      versionLanguage: movie.versionLanguage || 'ITA',
      subtitles: movie.subtitles || 'NESSUNO',
      awards: (movie as any).awards || [],
    };
  });

  // Ordinamento: Film disponibili prima, poi per data prossima proiezione
  movies.sort((a, b) => {
    if (!a.isSoldOut && b.isSoldOut) return -1;
    if (a.isSoldOut && !b.isSoldOut) return 1;

    const getNextShowDate = (m: GroupedMovie) => {
      const shows = m.isSoldOut ? m.subevents : m.subevents.filter((se: any) => !se.isSoldOut);
      if (shows.length === 0) return Infinity;
      return Math.min(...shows.map((s: any) => new Date(s.date).getTime()));
    };

    return getNextShowDate(a) - getNextShowDate(b);
  });

  // Prepariamo i dati per il Calendario Settimanale
  const enrichedSubEvents = projections.map(p => ({
    id: p.pretixId,
    name: { it: p.name },
    date_from: p.dateFrom.toISOString(),
    isSoldOut: p.movie?.manualSoldOut || p.isSoldOut,
    roomName: p.movie?.customRoomName || p.roomName || 'Sala',
    active: p.active,
    meta_data: {
      lingua: p.metaLingua,
      sottotitoli: p.metaSottotitoli,
      format: p.metaFormat,
      versionLanguage: p.movie?.versionLanguage || 'ITA',
      subtitles: p.movie?.subtitles || 'NESSUNO',
      rating: p.movie?.customRating || 'T'
    }

  }));

  // Mappa availability per compatibilità component
  const availabilityMap: Record<number, boolean> = {};
  enrichedSubEvents.forEach(se => {
    availabilityMap[se.id] = se.isSoldOut;
  });

  const endTime = Date.now();
  console.log(`[SSR] Homepage caricata dal DB in ${endTime - startTime}ms`);

  const showcaseKey = movies.map(m => `${m.id}-${m.poster_path}-${m.isSoldOut}`).join('|');

  return (
    <main className={styles.main}>
      <MovieShowcase 
        key={showcaseKey}
        movies={movies} 
        initialAvailability={availabilityMap}
      />
      <WeeklyCinemaCalendar subEvents={enrichedSubEvents as any} />
    </main>
  );
}
