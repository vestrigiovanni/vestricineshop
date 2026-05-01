'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import styles from './MovieShowcase.module.css';
import BookingDrawer from '../BookingDrawer/BookingDrawer';
import { getMovieTags, TagInfo } from '@/utils/languageUtils';
import { useAutoScroll } from '@/context/AutoScrollContext';
import { Video } from 'lucide-react';
import useSWR from 'swr';
import RatingBadge from '../RatingBadge';
import { useTrailer } from '@/context/TrailerContext';
import CustomVideoPlayer from '../CustomVideoPlayer/CustomVideoPlayer';
import LanguageBadge from '../LanguageBadge';


const AUTO_SCROLL_INTERVAL = 5000;
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
  director?: string;
  runtime?: number;
  isSoldOut?: boolean;
  cast?: string[];
  trailerKey?: string | null;
  trailerKeys?: string[];
  rating?: string;
  versionLanguage?: string;
  subtitles?: string;
  subevents: {
    id: number;
    date: string;
    isSoldOut?: boolean;
    language?: string;
    subtitles?: string;
    format?: string;
  }[];
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
  const [timerKey, setTimerKey] = useState(0);
  const [isMounted, setIsMounted] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  
  const { openTrailer } = useTrailer();
  const { isAutoScrollEnabled, disableAutoScroll } = useAutoScroll();

  const liveMovies = useMemo(() => {
    if (!availabilityData) return initialMovies;
    
    return initialMovies.map(movie => {
      const updatedSubevents = movie.subevents.map(se => {
        // Robust lookup: check number and string keys
        const liveIsSoldOut = availabilityData[se.id] === true || availabilityData[se.id.toString()] === true;
        
        return {
          ...se,
          // Use logical OR: if it was already Sold Out in initial data (from DB), keep it.
          // Otherwise, use the live data from the API.
          isSoldOut: se.isSoldOut || liveIsSoldOut
        };
      });
      
      const allSubeventsSoldOut = updatedSubevents.length > 0 && updatedSubevents.every(se => se.isSoldOut === true);
      
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
  const sortedMovies = useMemo(() => {
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
    setIsMounted(true);
    setIsHydrated(true);
  }, []);


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
    if (availableMovies.length <= 1 || !isAutoScrollEnabled || isImmersiveMode) return;

    const interval = setInterval(() => {
      goToNextMovie();
    }, AUTO_SCROLL_INTERVAL);

    return () => clearInterval(interval);
  }, [goToNextMovie, availableMovies.length, timerKey, isAutoScrollEnabled]);

  useEffect(() => {
    if (drawerOpen || isOverviewExpanded) {
      disableAutoScroll();
    }
  }, [drawerOpen, isOverviewExpanded, disableAutoScroll]);

  useEffect(() => {
    setIsOverviewExpanded(false);
    setIsImmersiveMode(false);
  }, [activeMovieId]);

  const handleMovieSelect = (movieId: number) => {
    setActiveMovieId(movieId);
    setTimerKey(prev => prev + 1); // Reset timer on manual selection
    disableAutoScroll();
  };

  if (liveMovies.length === 0) {
    return (
      <div className={styles.showcase} style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Nessun film attualmente in programmazione.</p>
      </div>
    );
  }

  const activeMovie = sortedMovies.find(m => m.id === activeMovieId) || sortedMovies[0];

  console.log("Cast per film " + activeMovie?.title, activeMovie?.cast);

  const handleShowtimeClick = (subeventId: number, isSoldOut: boolean) => {
    if (isSoldOut) return;
    setCheckoutSubeventId(subeventId);
    setDrawerOpen(true);
  };

  return (
    <div className={styles.showcase} onClick={disableAutoScroll}>
      {/* Hero Section */}
      <div className={styles.hero}>
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
          <CustomVideoPlayer 
            videoId={activeMovie.trailerKey || null} 
            videoIds={activeMovie.trailerKeys || []}
            backdropUrl={getTMDBImageUrl(activeMovie.backdrop_path, 'original')}
            isPlaying={isImmersiveMode} 
            onClose={() => setIsImmersiveMode(false)} 
          />
          <div className={isImmersiveMode ? `${styles.heroOverlayText} ${styles.uiHidden}` : styles.heroOverlayText} />
          <div className={styles.heroOverlayBottom} />
        </div>
        
        <div 
          className={isImmersiveMode ? `${styles.heroContent} ${styles.animateIn} ${styles.uiHidden}` : `${styles.heroContent} ${styles.animateIn}`} 
          key={activeMovieId}
        >
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
            <span className={styles.metaValue} suppressHydrationWarning>
              {isMounted ? (activeMovie.release_date ? (activeMovie.release_date.includes('-') ? activeMovie.release_date.split('-')[0] : new Date(activeMovie.release_date).getFullYear()) : 'N/D') : ''}
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
                  {isMounted && activeMovie.trailerKey && (
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
          
          <div className={styles.showtimesSection}>
            <h3 className={styles.showtimesTitle}>Scegli orario e prenota</h3>
            <div className={styles.showtimesGrid}>
              {activeMovie.subevents.map((se) => {
                const dateObj = new Date(se.date);
                const isToday = isMounted && dateObj.toDateString() === new Date().toDateString();
                const dayStr = isToday ? 'Oggi' : (isMounted ? dateObj.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
                
                const tags = getMovieTags(se.language || '', se.subtitles || '', se.format || (activeMovie.title.toUpperCase().includes('3D') ? '3D' : ''));

                return (
                  <button 
                    key={se.id} 
                    className={se.isSoldOut ? `${styles.showtimeButton} ${styles.showtimeSoldOut}` : styles.showtimeButton}
                    onClick={() => handleShowtimeClick(se.id, se.isSoldOut || false)}
                    disabled={se.isSoldOut}
                  >
                    <div className={styles.showtimeLabels}>
                      <RatingBadge rating={activeMovie.rating || 'T'} size="xs" />
                      <LanguageBadge 
                        language={activeMovie.versionLanguage} 
                        subtitles={activeMovie.subtitles} 
                        size="sm" 
                        showLabel={false}
                      />
                    </div>

                    <span className={styles.showtimeDate}>
                      {isMounted ? dayStr : dateObj.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                    <span className={styles.showtimeTime}>
                      {se.isSoldOut ? `ESAURITO` : (isMounted ? dateObj.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Gallery Section */}
      <div className={styles.galleryList}>
        <h2 className={styles.galleryTitle}>In Programmazione</h2>
        <div className={styles.galleryScroll}>
          {sortedMovies.map((movie, index) => (
            <div 
              key={movie.id} 
              className={[
                styles.cardWrapper, 
                movie.id === activeMovie.id ? styles.active : '', 
                movie.isSoldOut ? styles.soldOutCard : ''
              ].filter(Boolean).join(' ')}
              onClick={() => handleMovieSelect(movie.id)}
            >
              <div className={styles.imageContainer}>
                {movie.poster_path ? (
                  <Image 
                    src={getTMDBImageUrl(movie.poster_path, 'w342')!} 
                    alt={movie.title}
                    fill
                    sizes="(max-width: 768px) 140px, 200px"
                    style={{ objectFit: 'cover' }}
                    className={styles.cardImage}
                    priority={isHydrated && index < 2}
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

                {/* LanguageBadge removed from poster as requested */}


                {movie.rating && (
                  <div className={styles.ratingBadgeOverlay}>
                    <RatingBadge rating={movie.rating} size="sm" />
                  </div>
                )}
              </div>
            </div>
          ))}
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
