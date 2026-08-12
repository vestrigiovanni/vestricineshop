'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Image from 'next/image';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import styles from './MovieShowcase.module.css';
import BookingDrawer from '../BookingDrawer/BookingDrawer';
import ProjectionSpecs from '../ProjectionSpecs';
import { useAutoScroll } from '@/context/AutoScrollContext';
import { Video, ChevronLeft, ChevronRight } from 'lucide-react';
import useSWR from 'swr';
import RatingBadge from '../RatingBadge';
import { useTrailer } from '@/context/TrailerContext';
import CustomVideoPlayer from '../CustomVideoPlayer/CustomVideoPlayer';
import LanguageBadge from '../LanguageBadge';
import MovieAwards from '../MovieAwards/MovieAwards';
import { formatShowDayLabel, formatShowTime } from '@/utils/cinemaDate';


// Nove secondi: cinque non bastavano a leggere trama e orari prima che la
// hero cambiasse film sotto gli occhi.
const AUTO_SCROLL_INTERVAL = 9000;
const fetcher = (url: string) => fetch(url).then(res => res.json());

// Defining our expected data struct
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
}

export default function MovieShowcase({ movies: initialMovies, initialAvailability }: MovieShowcaseProps) {
  const { data: availabilityData } = useSWR('/api/availability', fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
    fallbackData: initialAvailability
  });

  const [activeMovieId, setActiveMovieId] = useState<number>(initialMovies[0]?.id || 0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [checkoutSubeventId, setCheckoutSubeventId] = useState<number | null>(null);
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);
  const [isImmersiveMode, setIsImmersiveMode] = useState(false);
  // Solo mouse: su touch `pointerleave` può non arrivare mai e la rotazione
  // resterebbe bloccata per sempre.
  const [isPointerOverHero, setIsPointerOverHero] = useState(false);
  const [timerKey, setTimerKey] = useState(0);
  const [isHydrated, setIsHydrated] = useState(false);
  // Locandine già caricate: serve a spegnere lo shimmer, che altrimenti
  // continua a ridipingere ogni card per tutta la permanenza sulla pagina.
  const [loadedPosters, setLoadedPosters] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
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

  
  const { openTrailer } = useTrailer();
  const { isAutoScrollEnabled, suspendAutoScroll, holdAutoScroll, releaseAutoScroll } = useAutoScroll();

  const liveMovies: GroupedMovie[] = useMemo(() => {
    if (!availabilityData) return initialMovies;
    
    return initialMovies.map((movie: GroupedMovie) => {
      const updatedSubevents = movie.subevents.map((se: any) => {
        // Robust lookup: check number and string keys
        const liveIsSoldOut = availabilityData[se.id] === true || availabilityData[se.id.toString()] === true;
        
        return {
          ...se,
          // Use logical OR: if it was already Sold Out in initial data (from DB), keep it.
          // Otherwise, use the live data from the API.
          isSoldOut: se.isSoldOut || liveIsSoldOut
        };
      });
      
      const allSubeventsSoldOut = updatedSubevents.length > 0 && updatedSubevents.every((se: any) => se.isSoldOut === true);
      
      return {
        ...movie,
        subevents: updatedSubevents,
        isSoldOut: allSubeventsSoldOut
      };
    });
  }, [initialMovies, availabilityData]);

  const getMovieSortDate = (movie: GroupedMovie) => {
    const shows = movie.isSoldOut 
      ? movie.subevents 
      : movie.subevents.filter(se => !se.isSoldOut);
    
    if (shows.length === 0) return Infinity;
    const dates = shows.map(s => new Date(s.date).getTime());
    return Math.min(...dates);
  };


  // --- Dynamic Sorting Logic (Live) ---
  // This sort includes availability data and is used for rendering the actual list and gallery.
  const sortedMovies: GroupedMovie[] = useMemo(() => {
    // CRITICAL: During hydration, we MUST render EXACTLY what the server did.
    // The server uses the order of initialMovies.
    if (!isHydrated || !availabilityData) return initialMovies;

    return [...liveMovies].sort((a, b) => {
      if (!a.isSoldOut && b.isSoldOut) return -1;
      if (a.isSoldOut && !b.isSoldOut) return 1;
      return getMovieSortDate(a) - getMovieSortDate(b);
    });
  }, [liveMovies, availabilityData, isHydrated, initialMovies]);


  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const checkScroll = useCallback(() => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setShowLeftArrow(scrollLeft > 10);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(checkScroll, 500); // Initial check after render
    return () => clearTimeout(timer);
  }, [checkScroll, sortedMovies]);

  useEffect(() => {
    const current = scrollRef.current;
    if (!current) return;

    // `passive`: il browser non deve attendere l'handler per decidere se lo
    // scorrimento può partire.
    current.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll, { passive: true });

    return () => {
      current.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { clientWidth } = scrollRef.current;
      const scrollAmount = clientWidth * 0.8;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };


  // Filter movies that are NOT sold out for auto-scroll logic, preserving sorted order
  const availableMovies = useMemo(() => sortedMovies.filter(m => !m.isSoldOut), [sortedMovies]);

  const goToNextMovie = useCallback(() => {
    if (availableMovies.length <= 1) return;
    
    setActiveMovieId(prevId => {
      const currentIndex = availableMovies.findIndex(m => m.id === prevId);
      // If current movie is not available (e.g. user manually clicked a sold out one), 
      // or it's the last one, go to the first available movie.
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

    const interval = setInterval(() => {
      goToNextMovie();
    }, AUTO_SCROLL_INTERVAL);

    return () => clearInterval(interval);
  }, [goToNextMovie, availableMovies.length, timerKey, isAutoScrollEnabled, heroInView, isPointerOverHero]);

  // Finché una di queste condizioni è vera la hero non cambia film: c'è
  // qualcosa che l'utente sta leggendo o guardando. Al rilascio la rotazione
  // riprende da sola, senza bisogno di ricaricare la pagina.
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
    setTimerKey(prev => prev + 1); // Reset timer on manual selection
    suspendAutoScroll();
  };

  // Selezione film richiesta dallo scrollytelling (CinematicStory) in fondo alla pagina.
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
      <div className={styles.showcase} style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Nessun film attualmente in programmazione.</p>
      </div>
    );
  }

  const activeMovie = sortedMovies.find(m => m.id === activeMovieId) || sortedMovies[0];

  if (process.env.NODE_ENV !== 'production') {
    console.log("Cast per film " + activeMovie?.title, activeMovie?.cast);
  }

  const handleShowtimeClick = (subeventId: number, isSoldOut: boolean) => {
    if (isSoldOut) return;
    setCheckoutSubeventId(subeventId);
    setDrawerOpen(true);
  };

  return (
    <div ref={showcaseRef} className={styles.showcase}>
      {/* Hero Section */}
      <div
        className={styles.hero}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') setIsPointerOverHero(true); }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setIsPointerOverHero(false); }}
        onFocusCapture={suspendAutoScroll}
      >
        <div className={styles.heroBackdrop}>
          <Image 
            src={getTMDBImageUrl(activeMovie.backdrop_path, 'original') || getTMDBImageUrl(activeMovie.poster_path, 'original') || ''} 
            alt={activeMovie.title} 
            fill 
            className={isImmersiveMode ? `${styles.heroImage} ${styles.uiHidden}` : styles.heroImage}
            sizes="100vw"
            priority
            suppressHydrationWarning
          />
          <div className={isImmersiveMode ? `${styles.heroOverlayText} ${styles.uiHidden}` : styles.heroOverlayText} />
          <div className={isImmersiveMode ? `${styles.heroOverlayBottom} ${styles.uiHidden}` : styles.heroOverlayBottom} />
        </div>
        
        
        <div 
          className={isImmersiveMode ? `${styles.heroContent} ${styles.animateIn} ${styles.uiHidden}` : `${styles.heroContent} ${styles.animateIn}`} 
          key={activeMovieId}
        >
          <div className={styles.heroLayout}>
            <div className={styles.heroContentMain}>
              {activeMovie.logo_path ? (
                <div className={styles.logoContainer}>
                  <Image 
                    src={getTMDBImageUrl(activeMovie.logo_path, 'w500')!} 
                    alt={activeMovie.title} 
                    fill
                    className={styles.movieLogo}
                    sizes="(max-width: 768px) 100vw, 400px"
                    priority
                  />
                </div>
              ) : (
                <h1 className={styles.title}>{activeMovie.title}</h1>
              )}
              <div className={styles.meta}>
                <span className={styles.metaValue}>
                  {activeMovie.release_year || 'N/D'}
                </span>
                {activeMovie.runtime && activeMovie.runtime > 0 && (
                  <div className={styles.metaGroup}>
                    <span className={styles.metaSeparator}>•</span>
                    <span className={styles.metaLabel}>DURATA:</span>
                    <span className={styles.metaValue}>{activeMovie.runtime} MIN</span>
                  </div>
                )}

                {activeMovie.director && (
                  <div className={styles.directorMeta}>
                    <span className={styles.metaSeparator}>•</span>
                    <div className={styles.metaGroup}>
                      <span className={styles.metaLabel}>REGIA:</span>
                      <span className={styles.metaValue}>{activeMovie.director.toUpperCase()}</span>
                      {(activeMovie.trailerKey || (activeMovie.trailerKeys && activeMovie.trailerKeys.length > 0)) && (
                        <button 
                          className={styles.trailerBtn} 
                          onClick={() => setIsImmersiveMode(true)}
                          title="Guarda il trailer"
                        >
                          <Video size={18} color="#ffffff" strokeWidth={2.5} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Come si proietta: solo ciò che vale per *tutti* gli spettacoli
                  del film — le differenze fra una replica e l'altra si leggono
                  sul singolo orario, qui sotto. */}
              <ProjectionSpecs specs={activeMovie.specs} variant="line" />

              <div className={styles.overviewContainer}>
                <p className={isOverviewExpanded ? `${styles.overview} ${styles.expanded}` : styles.overview}>
                  {activeMovie.overview}
                </p>
                {isOverviewExpanded && activeMovie.cast && activeMovie.cast.length > 0 && (
                  <p className={styles.castList}>
                    <strong>Con:</strong> {activeMovie.cast.join(', ')}
                  </p>
                )}
                {activeMovie.overview && activeMovie.overview.length > 150 && (
                  <button 
                    className={styles.readMoreBtn}
                    onClick={() => setIsOverviewExpanded(!isOverviewExpanded)}
                    aria-label={isOverviewExpanded ? 'Mostra meno' : 'Leggi di più'}
                  >
                    <span className={styles.readMoreText}>{isOverviewExpanded ? 'Meno' : 'Più'}</span>
                    <svg 
                      className={isOverviewExpanded ? `${styles.chevron} ${styles.chevronUp}` : styles.chevron} 
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <div className={styles.awardsColumn}>
              <MovieAwards 
                awards={activeMovie.awards || []}
                vertical={true}
              />
            </div>
          </div>
          
          <div className={styles.showtimesSection}>
            <h3 className={styles.showtimesTitle}>Scegli orario e prenota</h3>
            <div className={styles.showtimesGrid}>
              {activeMovie.subevents.map((se: any) => {
                // Le etichette arrivano già scritte dal server; il calcolo qui
                // è solo una rete di sicurezza e usa lo stesso fuso di sala.
                const dayStr = se.dayLabel || formatShowDayLabel(se.date);
                const timeStr = se.timeLabel || formatShowTime(se.date);

                return (
                  <button
                    key={se.id}
                    type="button"
                    className={se.isSoldOut ? `${styles.showtimeButton} ${styles.showtimeSoldOut}` : styles.showtimeButton}
                    onClick={() => handleShowtimeClick(se.id, se.isSoldOut || false)}
                    disabled={se.isSoldOut}
                    aria-label={se.isSoldOut
                      ? `${activeMovie.title}, ${dayStr} alle ${timeStr}: posti esauriti`
                      : `Prenota ${activeMovie.title}, ${dayStr} alle ${timeStr}`}
                  >
                    <div className={styles.showtimeLabels}>
                      <RatingBadge rating={activeMovie.rating || 'T'} size="xs" />
                      <LanguageBadge 
                        language={se.language || activeMovie.versionLanguage} 
                        subtitles={se.subtitles || activeMovie.subtitles} 
                        version={se.format || activeMovie.format}
                        size="sm"
                        showLabel={false}
                      />
                      <ProjectionSpecs specs={se.specs} note={se.specsNote} size="xs" />
                    </div>

                    <span className={styles.showtimeDate}>
                      {dayStr}
                    </span>
                    <span className={styles.showtimeTime}>
                      {se.isSoldOut ? `ESAURITO` : timeStr}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <CustomVideoPlayer 
          videoId={activeMovie.trailerKey || null} 
          backdropUrl={getTMDBImageUrl(activeMovie.backdrop_path, 'original')}
          isPlaying={isImmersiveMode} 
          onClose={() => setIsImmersiveMode(false)} 
        />
      </div>

      <div className={styles.galleryList}>
        <h2 className={styles.galleryTitle}>In Programmazione</h2>
        
        <div className={styles.carouselContainer}>
          <div className={styles.galleryScroll} ref={scrollRef}>
            {sortedMovies.map((movie, index) => (
              <div
                key={movie.id}
                // Le locandine sono selezionabili: senza ruolo e senza tabIndex
                // chi naviga da tastiera non poteva cambiare film.
                role="button"
                tabIndex={0}
                aria-pressed={movie.id === activeMovie.id}
                aria-label={movie.isSoldOut ? `${movie.title} — esaurito` : movie.title}
                className={[
                  styles.cardWrapper,
                  movie.id === activeMovie.id ? styles.active : '',
                  movie.isSoldOut ? styles.soldOutCard : ''
                ].filter(Boolean).join(' ')}
                onClick={() => handleMovieSelect(movie.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleMovieSelect(movie.id);
                  }
                }}
              >
                <div className={`${styles.imageContainer} ${loadedPosters.has(movie.id) ? styles.imageLoaded : ''}`}>
                  {movie.poster_path ? (
                    <Image
                      src={getTMDBImageUrl(movie.poster_path, 'w342')!}
                      alt={movie.title}
                      fill
                      sizes="(max-width: 768px) 140px, 200px"
                      style={{ objectFit: 'cover' }}
                      className={styles.cardImage}
                      priority={index < 2}
                      onLoad={() => setLoadedPosters(prev => {
                        if (prev.has(movie.id)) return prev;
                        const next = new Set(prev);
                        next.add(movie.id);
                        return next;
                      })}
                      suppressHydrationWarning
                    />
                  ) : (
                    <div style={{ padding: '1rem', background: '#333', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                      {movie.title}
                    </div>
                  )}
                  {movie.isSoldOut && (
                    <div className={styles.soldOutBanner}>
                      <span>SOLD OUT</span>
                    </div>
                  )}

                  {movie.rating && (
                    <div className={styles.ratingBadgeOverlay}>
                      <RatingBadge rating={movie.rating} size="sm" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {showLeftArrow && (
            <button 
              className={`${styles.navButton} ${styles.navLeft}`} 
              onClick={() => scroll('left')}
              aria-label="Scorri a sinistra"
            >
              <ChevronLeft size={24} strokeWidth={1.5} />
            </button>
          )}

          {showRightArrow && (
            <button 
              className={`${styles.navButton} ${styles.navRight}`} 
              onClick={() => scroll('right')}
              aria-label="Scorri a destra"
            >
              <ChevronRight size={24} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* Booking Drawer */}
      <BookingDrawer 
        isOpen={drawerOpen} 
        onClose={() => setDrawerOpen(false)} 
        subeventId={checkoutSubeventId}
        movieTitle={activeMovie.title}
      />

    </div>
  );
}
