'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { getTMDBImageUrl } from '@/services/tmdb';
import styles from './MovieShowcase.module.css';
import BookingDrawer from '../BookingDrawer/BookingDrawer';
import { getMovieTags, TagInfo } from '@/utils/languageUtils';
import { useAutoScroll } from '@/context/AutoScrollContext';
import { Video } from 'lucide-react';
import useSWR from 'swr';

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
}

export default function MovieShowcase({ movies: initialMovies }: MovieShowcaseProps) {
  const { data: availabilityData } = useSWR('/api/availability', fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true
  });

  const liveMovies = useMemo(() => {
    if (!availabilityData) return initialMovies;
    
    return initialMovies.map(movie => {
      const updatedSubevents = movie.subevents.map(se => ({
        ...se,
        isSoldOut: availabilityData[se.id] ?? se.isSoldOut
      }));
      
      const allSubeventsSoldOut = updatedSubevents.every(se => se.isSoldOut === true);
      
      return {
        ...movie,
        subevents: updatedSubevents,
        isSoldOut: allSubeventsSoldOut
      };
    });
  }, [initialMovies, availabilityData]);

  // --- Smart Sorting Logic ---
  const sortedMovies = useMemo(() => {
    const getNextShowDate = (movie: GroupedMovie) => {
      // For available movies, we only care about the next AVAILABLE show
      // For sold out movies, we take the earliest show (even if sold out)
      const shows = movie.isSoldOut 
        ? movie.subevents 
        : movie.subevents.filter(se => !se.isSoldOut);
      
      if (shows.length === 0) return Infinity;
      
      const dates = shows.map(s => new Date(s.date).getTime());
      return Math.min(...dates);
    };

    return [...liveMovies].sort((a, b) => {
      // 1. Available Group (Group A) vs Sold Out Group (Group B)
      if (!a.isSoldOut && b.isSoldOut) return -1;
      if (a.isSoldOut && !b.isSoldOut) return 1;
      
      // 2. Chronological order within each group
      return getNextShowDate(a) - getNextShowDate(b);
    });
  }, [liveMovies]);

  const [activeMovieId, setActiveMovieId] = useState<number>(sortedMovies[0]?.id || 0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [checkoutSubeventId, setCheckoutSubeventId] = useState<number | null>(null);
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);
  const [timerKey, setTimerKey] = useState(0);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [activeTrailerKey, setActiveTrailerKey] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const { isAutoScrollEnabled, disableAutoScroll } = useAutoScroll();

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
    if (availableMovies.length <= 1 || !isAutoScrollEnabled) return;

    const interval = setInterval(() => {
      goToNextMovie();
    }, AUTO_SCROLL_INTERVAL);

    return () => clearInterval(interval);
  }, [goToNextMovie, availableMovies.length, timerKey, isAutoScrollEnabled]);

  useEffect(() => {
    if (drawerOpen || isOverviewExpanded || trailerOpen) {
      disableAutoScroll();
    }
  }, [drawerOpen, isOverviewExpanded, trailerOpen, disableAutoScroll]);

  useEffect(() => {
    setIsOverviewExpanded(false);
  }, [activeMovieId]);

  const handleMovieSelect = (movieId: number) => {
    setActiveMovieId(movieId);
    setTimerKey(prev => prev + 1); // Reset timer on manual selection
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
    <div className={styles.showcase}>
      {/* Hero Section */}
      <div className={styles.hero}>
        <div className={styles.heroBackdrop}>
          <Image 
            src={getTMDBImageUrl(activeMovie.backdrop_path, 'original') || getTMDBImageUrl(activeMovie.poster_path, 'original') || ''} 
            alt={activeMovie.title} 
            fill 
            className={styles.heroImage}
            sizes="100vw"
            priority
          />
          <div className={styles.heroOverlay} />
        </div>
        
        <div className={`${styles.heroContent} ${styles.animateIn}`} key={activeMovieId}>
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
            <span>{new Date(activeMovie.release_date).getFullYear() || 'N/D'}</span>
            {activeMovie.runtime && (
              <>
                <span>•</span>
                <span>{activeMovie.runtime} min</span>
              </>
            )}
            {activeMovie.director && (
              <>
                <span>•</span>
                <span className={isMounted ? styles.directorBlock : ''}>
                  Regia: {activeMovie.director}
                  {isMounted && activeMovie.trailerKey && (
                    <button 
                      className={styles.trailerBtn} 
                      onClick={() => {
                        setActiveTrailerKey(activeMovie.trailerKey || null);
                        setTrailerOpen(true);
                      }}
                      title="Guarda il trailer"
                    >
                      <Video size={18} />
                    </button>
                  )}
                </span>
              </>
            )}
          </div>
          
          <div className={styles.overviewContainer}>
            <p className={`${styles.overview} ${isOverviewExpanded ? styles.expanded : ''}`}>
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
                  className={`${styles.chevron} ${isOverviewExpanded ? styles.chevronUp : ''}`} 
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
                const isToday = dateObj.toDateString() === new Date().toDateString();
                const dayStr = isToday ? 'Oggi' : dateObj.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
                
                const tags = getMovieTags(se.language || '', se.subtitles || '', se.format || (activeMovie.title.toUpperCase().includes('3D') ? '3D' : ''));

                return (
                  <button 
                    key={se.id} 
                    className={`${styles.showtimeButton} ${se.isSoldOut ? styles.showtimeSoldOut : ''}`}
                    onClick={() => handleShowtimeClick(se.id, se.isSoldOut || false)}
                    disabled={se.isSoldOut}
                  >
                    <div className={styles.showtimeLabels}>
                      {tags.map((tag: TagInfo, idx: number) => (
                        <span key={idx} className={`${styles.tag} ${styles[`tag${tag.type.charAt(0).toUpperCase() + tag.type.slice(1)}` as keyof typeof styles]} ${tag.code === 'ITA' ? styles.tagIta : ''}`}>
                          {tag.code}
                        </span>
                      ))}
                    </div>
                    <span className={styles.showtimeDate}>{dayStr}</span>
                    <span className={styles.showtimeTime}>
                      {se.isSoldOut ? `ESAURITO` : dateObj.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
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
          {sortedMovies.map((movie) => (
            <div 
              key={movie.id} 
              className={`${styles.cardWrapper} ${movie.id === activeMovie.id ? styles.active : ''} ${movie.isSoldOut ? styles.soldOutCard : ''}`}
              onClick={() => handleMovieSelect(movie.id)}
            >
              <div className={styles.imageContainer}>
                {movie.poster_path ? (
                  <Image 
                    src={getTMDBImageUrl(movie.poster_path, 'w500')!} 
                    alt={movie.title}
                    fill
                    sizes="(max-width: 768px) 140px, 200px"
                    style={{ objectFit: 'cover' }}
                    className={styles.cardImage}
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

      {/* Trailer Popup */}
      {trailerOpen && activeTrailerKey && (
        <div className={styles.trailerOverlay} onClick={() => setTrailerOpen(false)}>
          <div className={styles.trailerModal} onClick={e => e.stopPropagation()}>
            <button className={styles.closeTrailer} onClick={() => setTrailerOpen(false)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
            <div className={styles.videoWrapper}>
              <iframe
                src={`https://www.youtube.com/embed/${activeTrailerKey}?autoplay=1&cc_load_policy=1&cc_lang_pref=it&hl=it&rel=0&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`}
                title="Movie Trailer"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
