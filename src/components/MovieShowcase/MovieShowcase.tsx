'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Image from 'next/image';
import useSWR from 'swr';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import { useAutoScroll } from '@/context/AutoScrollContext';
import BookingDrawer from '../BookingDrawer/BookingDrawer';
import { choicesFromShowcase } from '../BookingDrawer/showChoices';
import CustomVideoPlayer from '../CustomVideoPlayer/CustomVideoPlayer';
import ShowcaseHero from './ShowcaseHero';
import FilmStrip from './FilmStrip';
import styles from './MovieShowcase.module.css';

// Nove secondi: cinque non bastavano a leggere trama e orari prima che la
// hero cambiasse film sotto gli occhi.
const AUTO_SCROLL_INTERVAL = 9000;
const fetcher = (url: string) => fetch(url).then(res => res.json());

export interface GroupedMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  logo_path?: string | null;
  release_date: string;
  /** Anno già estratto lato server, per non calcolarlo dopo l'hydration. */
  release_year?: string;
  director?: string;
  runtime?: number;
  isSoldOut?: boolean;
  cast?: string[];
  trailerKey?: string | null;
  trailerKeys?: string[];
  rating?: string;
  versionLanguage?: string;
  subtitles?: string;
  format?: string;
  /** Le specifiche comuni a tutti gli spettacoli del film. Vedi `app/page.tsx`. */
  specs?: string[];
  subevents: any[];
  awards?: any[];
  tagline?: string;
  extraBackdrops?: string[];
  genres?: string[];
  voteAverage?: number | null;
}

interface MovieShowcaseProps {
  movies: GroupedMovie[];
  initialAvailability?: Record<number, boolean>;
  /** Da `?film=`: il film da cui parte l'hero. Già controllato dal server. */
  initialMovieId?: number | null;
  /** Da `?subevent=`: la prenotazione parte già aperta su questo spettacolo. */
  initialSubeventId?: number | null;
}

export default function MovieShowcase({ movies: initialMovies, initialAvailability, initialMovieId, initialSubeventId }: MovieShowcaseProps) {
  const { data: availabilityData } = useSWR('/api/availability', fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
    fallbackData: initialAvailability
  });

  const [activeMovieId, setActiveMovieId] = useState<number>(initialMovieId ?? initialMovies[0]?.id ?? 0);
  const [drawerOpen, setDrawerOpen] = useState(initialSubeventId != null);
  const [checkoutSubeventId, setCheckoutSubeventId] = useState<number | null>(initialSubeventId ?? null);
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);
  const [isImmersiveMode, setIsImmersiveMode] = useState(false);
  // Solo mouse: su touch `pointerleave` può non arrivare mai e la rotazione
  // resterebbe bloccata per sempre.
  const [isPointerOverHero, setIsPointerOverHero] = useState(false);
  const [timerKey, setTimerKey] = useState(0);
  const [isHydrated, setIsHydrated] = useState(false);
  // La rotazione automatica gira solo quando la hero è davvero visibile:
  // cambiare backdrop full-screen mentre l'utente sta scorrendo lo
  // scrollytelling in basso causava scatti periodici su tutta la pagina.
  const showcaseRef = useRef<HTMLDivElement>(null);
  const [heroInView, setHeroInView] = useState(true);

  useEffect(() => {
    const el = showcaseRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setHeroInView(entry.isIntersecting),
      { threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { isAutoScrollEnabled, suspendAutoScroll, holdAutoScroll, releaseAutoScroll } = useAutoScroll();

  // Chi arriva da un link a un film deve trovarlo lì, non vederlo scivolare
  // via dopo nove secondi.
  useEffect(() => {
    if (initialMovieId != null) suspendAutoScroll();
  }, [initialMovieId, suspendAutoScroll]);

  const liveMovies: GroupedMovie[] = useMemo(() => {
    if (!availabilityData) return initialMovies;

    return initialMovies.map((movie: GroupedMovie) => {
      const updatedSubevents = movie.subevents.map((se: any) => {
        const liveIsSoldOut = availabilityData[se.id] === true || availabilityData[se.id.toString()] === true;
        // Esaurito resta esaurito: il dato dal vivo può solo aggiungere.
        return { ...se, isSoldOut: se.isSoldOut || liveIsSoldOut };
      });
      const allSubeventsSoldOut = updatedSubevents.length > 0 && updatedSubevents.every((se: any) => se.isSoldOut === true);
      return { ...movie, subevents: updatedSubevents, isSoldOut: allSubeventsSoldOut };
    });
  }, [initialMovies, availabilityData]);

  // Durante l'hydration si disegna esattamente quello che ha disegnato il
  // server; dopo, i film esauriti scendono in fondo.
  const sortedMovies: GroupedMovie[] = useMemo(() => {
    if (!isHydrated || !availabilityData) return initialMovies;

    const sortDate = (movie: GroupedMovie) => {
      const shows = movie.isSoldOut ? movie.subevents : movie.subevents.filter(se => !se.isSoldOut);
      if (shows.length === 0) return Infinity;
      return Math.min(...shows.map(s => new Date(s.date).getTime()));
    };

    return [...liveMovies].sort((a, b) => {
      if (!a.isSoldOut && b.isSoldOut) return -1;
      if (a.isSoldOut && !b.isSoldOut) return 1;
      return sortDate(a) - sortDate(b);
    });
  }, [liveMovies, availabilityData, isHydrated, initialMovies]);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const availableMovies = useMemo(() => sortedMovies.filter(m => !m.isSoldOut), [sortedMovies]);

  const goToNextMovie = useCallback(() => {
    if (availableMovies.length <= 1) return;
    setActiveMovieId(prevId => {
      const currentIndex = availableMovies.findIndex(m => m.id === prevId);
      // Film esaurito aperto a mano, oppure l'ultimo: si riparte dal primo.
      if (currentIndex === -1 || currentIndex === availableMovies.length - 1) {
        return availableMovies[0].id;
      }
      return availableMovies[currentIndex + 1].id;
    });
    setTimerKey(prev => prev + 1);
  }, [availableMovies]);

  useEffect(() => {
    // Il puntatore sopra la hero è uno stato locale e non passa dal context:
    // farlo transitare dal provider avrebbe ridisegnato l'intero showcase a
    // ogni entrata e uscita del mouse.
    if (availableMovies.length <= 1 || !isAutoScrollEnabled || !heroInView || isPointerOverHero) return;
    const interval = setInterval(goToNextMovie, AUTO_SCROLL_INTERVAL);
    return () => clearInterval(interval);
  }, [goToNextMovie, availableMovies.length, timerKey, isAutoScrollEnabled, heroInView, isPointerOverHero]);

  // Finché una di queste condizioni è vera la hero non cambia film: c'è
  // qualcosa che l'utente sta leggendo o guardando. Al rilascio la rotazione
  // riprende da sola.
  const AUTO_SCROLL_BLOCKS = useMemo(() => ({
    drawer: drawerOpen,
    overview: isOverviewExpanded,
    trailer: isImmersiveMode,
  }), [drawerOpen, isOverviewExpanded, isImmersiveMode]);

  useEffect(() => {
    for (const [reason, active] of Object.entries(AUTO_SCROLL_BLOCKS)) {
      if (active) holdAutoScroll(reason);
      else releaseAutoScroll(reason);
    }
  }, [AUTO_SCROLL_BLOCKS, holdAutoScroll, releaseAutoScroll]);

  useEffect(() => () => {
    ['drawer', 'overview', 'trailer'].forEach(releaseAutoScroll);
  }, [releaseAutoScroll]);

  useEffect(() => {
    setIsOverviewExpanded(false);
    setIsImmersiveMode(false);
  }, [activeMovieId]);

  const handleMovieSelect = (movieId: number) => {
    setActiveMovieId(movieId);
    setTimerKey(prev => prev + 1);
    suspendAutoScroll();
  };

  // Selezione film richiesta dal racconto (CinematicStory) più in basso.
  useEffect(() => {
    const handler = (e: Event) => {
      const movieId = Number((e as CustomEvent).detail?.movieId);
      if (Number.isNaN(movieId)) return;
      setActiveMovieId(movieId);
      setTimerKey(prev => prev + 1);
      suspendAutoScroll();
    };
    window.addEventListener('vestri:select-movie', handler);
    return () => window.removeEventListener('vestri:select-movie', handler);
  }, [suspendAutoScroll]);

  if (liveMovies.length === 0) {
    return (
      <div className={styles.empty}>
        <p>Nessun film in programmazione</p>
      </div>
    );
  }

  const activeMovie = sortedMovies.find(m => m.id === activeMovieId) || sortedMovies[0];

  const handleBook = (subeventId: number) => {
    setCheckoutSubeventId(subeventId);
    setDrawerOpen(true);
  };

  const hidden = isImmersiveMode ? ` ${styles.uiHidden}` : '';

  return (
    <div ref={showcaseRef} className={styles.showcase}>
      <div
        className={styles.hero}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') setIsPointerOverHero(true); }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setIsPointerOverHero(false); }}
        onFocusCapture={suspendAutoScroll}
      >
        <div className={`${styles.backdrop}${hidden}`}>
          <Image
            src={getTMDBImageUrl(activeMovie.backdrop_path, 'original') || getTMDBImageUrl(activeMovie.poster_path, 'original') || ''}
            alt=""
            fill
            className={styles.backdropImage}
            sizes="100vw"
            priority
            suppressHydrationWarning
          />
          <div className={styles.shadeSide} />
          <div className={styles.shadeBottom} />
        </div>

        <div className={`${styles.content}${hidden}`}>
          <ShowcaseHero
            key={activeMovie.id}
            movie={activeMovie}
            isOverviewExpanded={isOverviewExpanded}
            onToggleOverview={() => setIsOverviewExpanded(v => !v)}
            onBook={handleBook}
            onTrailer={() => setIsImmersiveMode(true)}
          />
          <FilmStrip movies={sortedMovies} activeId={activeMovie.id} onSelect={handleMovieSelect} />
        </div>

        <CustomVideoPlayer
          videoId={activeMovie.trailerKey || null}
          backdropUrl={getTMDBImageUrl(activeMovie.backdrop_path, 'original')}
          isPlaying={isImmersiveMode}
          onClose={() => setIsImmersiveMode(false)}
        />
      </div>

      <BookingDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        subeventId={checkoutSubeventId}
        movieTitle={activeMovie.title}
        choices={choicesFromShowcase(activeMovie.subevents)}
      />
    </div>
  );
}
