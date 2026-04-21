'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getDisplayData, DisplayMovieData } from '@/actions/displayActions';
import styles from './DisplayEsterno.module.css';
import { getTMDBImageUrl } from '@/services/tmdb';
import { Maximize, Minimize } from 'lucide-react';
import { toZonedTime } from 'date-fns-tz';

const TIMEZONE = 'Europe/Rome';

export default function DisplayEsterno() {
  const [movies, setMovies] = useState<DisplayMovieData[]>([]);
  const [now, setNow] = useState<Date | null>(null);
  const [preroll, setPreroll] = useState(600); // Default 10 minutes in seconds
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [isSwapped, setIsSwapped] = useState(false);
  const [selectedMovieId, setSelectedMovieId] = useState<number | null>(null);
  const [showSelector, setShowSelector] = useState(false);
  const [isSideBoxVisible, setIsSideBoxVisible] = useState(true);
  const [showPrerollModal, setShowPrerollModal] = useState(false);
  const [prerollMins, setPrerollMins] = useState('0');
  const [prerollSecs, setPrerollSecs] = useState('0');
  const [loading, setLoading] = useState(true);

  // 1. Fetch data periodically
  const fetchData = useCallback(async () => {
    const data = await getDisplayData();
    setMovies(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchData();
    setNow(new Date());

    // Get preroll from URL params
    const params = new URLSearchParams(window.location.search);
    const prerollParam = params.get('preroll');
    if (prerollParam) {
      setPreroll(parseInt(prerollParam));
    }

    // Interval for polling Pretix API (every 30s)
    const pollInterval = setInterval(fetchData, 30000);
    
    // Interval for the internal clock (every 1s)
    const clockInterval = setInterval(() => setNow(new Date()), 1000);

    return () => {
      clearInterval(pollInterval);
      clearInterval(clockInterval);
    };
  }, [fetchData]);

  // 2. Fullscreen Management
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'f') {
        toggleFullscreen();
      }
      if (e.key === 'Escape') {
        if (showSelector) setShowSelector(false);
        else if (isSwapped) setIsSwapped(false);
        else if (selectedMovieId) setSelectedMovieId(null);
      }
      if (e.key.toLowerCase() === 's') {
        setShowSelector(prev => !prev);
      }
      if (e.key.toLowerCase() === 'q') {
        setIsSideBoxVisible(prev => !prev);
      }
      if (e.key.toLowerCase() === 'p') {
        setShowPrerollModal(prev => !prev);
        setPrerollMins(Math.floor(preroll / 60).toString());
        setPrerollSecs((preroll % 60).toString());
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isSwapped, showSelector, selectedMovieId, isSideBoxVisible, showPrerollModal, preroll]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  const handleSwap = () => {
    setTransitioning(true);
    setTimeout(() => {
      setIsSwapped(!isSwapped);
      setTransitioning(false);
    }, 400); 
  };

  // 3. Logic to determine current, next, and following movie
  const { currentMovie, nextMovie, nextNextMovie } = useMemo(() => {
    if (!now) return { currentMovie: null, nextMovie: null, nextNextMovie: null };
    const currentTime = now.getTime();
    
    // An event is "current" if it's currently playing OR in preroll phase
    const current = movies.find(m => {
      const itNow = toZonedTime(now, TIMEZONE);
      const itStart = toZonedTime(new Date(m.date_from), TIMEZONE);
      const itEnd = toZonedTime(new Date(m.date_to), TIMEZONE);
      
      const currentTime = itNow.getTime();
      const startWithPreroll = itStart.getTime() - (preroll * 1000);
      const end = itEnd.getTime();
      return currentTime >= startWithPreroll && currentTime < end;
    });

    const currentIdx = current ? movies.indexOf(current) : -1;
    
    // If we have a current movie, next is the one directly after it
    // If not, next is the first one in the future, and nextNext is the one after that
    const futureMovies = movies.filter((m, idx) => {
       if (current) return idx > currentIdx;
       const itNow = toZonedTime(now, TIMEZONE);
       const itStart = toZonedTime(new Date(m.date_from), TIMEZONE);
       return itStart.getTime() > itNow.getTime();
    });

    return { 
      currentMovie: current, 
      nextMovie: futureMovies[0] || null,
      nextNextMovie: futureMovies[1] || null
    };
  }, [movies, now, preroll]);

  // 4. Timer Logic
  const selectedMovie = useMemo(() => {
    if (!selectedMovieId) return null;
    return movies.find(m => m.id === selectedMovieId) || null;
  }, [selectedMovieId, movies]);

  const getTimerData = () => {
    if (!now) return { label: 'Inizializzazione...', value: '--:--', type: 'idle' };
    // Determine the hero movie for the timer
    const heroMovie = selectedMovie || (isSwapped ? nextMovie : (currentMovie || nextMovie));
    if (!heroMovie) return { label: 'In attesa di proiezioni', value: '--:--', type: 'idle' };

    const itNow = toZonedTime(now, TIMEZONE);
    const itStart = toZonedTime(new Date(heroMovie.date_from), TIMEZONE);
    const itEnd = toZonedTime(new Date(heroMovie.date_to), TIMEZONE);

    const currentTime = itNow.getTime();
    const startTime = itStart.getTime();
    const endTime = itEnd.getTime();
    const prerollStartsAt = startTime - (preroll * 1000);

    const formatDuration = (ms: number) => {
      const totalMinutes = Math.ceil(ms / 60000);
      const hours = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      
      const hLabel = hours === 1 ? 'ora' : 'ore';
      const mLabel = mins === 1 ? 'minuto' : 'minuti';

      if (hours > 0) {
        if (mins === 0) return `${hours} ${hLabel}`;
        return `${hours} ${hLabel} e ${mins} ${mLabel}`;
      }
      return `${mins} ${mLabel}`;
    };
    const formatSeconds = (ms: number) => {
      const s = Math.floor((ms % 60000) / 1000);
      return s.toString();
    };

    const diffToStart = startTime - currentTime;

    // SCENARIO 1: Movie has not started yet
    if (currentTime < startTime) {
      // PREROLL PERIOD: IL FILM INIZIERÀ A BREVE
      if (currentTime >= prerollStartsAt) {
        // Last 60s of preroll (before movie starts): BUONA VISIONE
        const diffToMovieStart = startTime - currentTime;
        if (diffToMovieStart <= 60000) {
          return { label: '', value: 'BUONA VISIONE', type: 'preroll-active', progress: 0 };
        }
        
        return { 
          label: '', 
          value: 'IL FILM INIZIERÀ A BREVE', 
          type: 'preroll-active', 
          progress: 0 
        };
      }
      
      // FINAL COUNTDOWN: 1 minute before advertising phase
      const diffToPreroll = prerollStartsAt - currentTime;
      if (diffToPreroll > 0 && diffToPreroll <= 60000) {
        return { 
          label: 'INIZIO FRA', 
          value: formatSeconds(diffToPreroll), 
          type: 'final-countdown', 
          progress: 0 
        };
      }

      // BEFORE PREROLL: Countdown targeting the START OF PREROLL
      return { 
        label: 'Inizio tra', 
        value: formatDuration(diffToPreroll), 
        type: 'preroll-countdown', 
        progress: 0 
      };
    } 
    
    // SCENARIO 2: Movie is Playing
    const diffToEnd = Math.max(0, endTime - currentTime);
    const totalDuration = endTime - startTime;
    const elapsed = currentTime - startTime;
    const progress = Math.min(100, (elapsed / totalDuration) * 100);

    return { 
      label: 'Fine tra', 
      value: formatDuration(diffToEnd), 
      type: 'playing', 
      progress 
    };
  };

  const timer = getTimerData();

  const lastMovieId = React.useRef<number | null>(null);

  // 5. Auto-reset focus back to current movie when it starts or finishes
  useEffect(() => {
    const currentId = currentMovie?.id || null;
    if (currentId !== lastMovieId.current) {
       // Only auto-reset if the FOCUSED movie was the one that just started
       if (selectedMovieId === currentId) {
         setSelectedMovieId(null);
       }
       lastMovieId.current = currentId;
    }
  }, [currentMovie, selectedMovieId]);

  // Determine what to show in the main area and the side box
  const mainStageMovie = selectedMovie || (isSwapped && nextMovie ? nextMovie : (currentMovie || nextMovie));
  const sideBoxMovie = selectedMovie 
    ? (currentMovie?.id === selectedMovieId ? nextMovie : currentMovie)
    : (isSwapped ? currentMovie : (currentMovie ? nextMovie : nextNextMovie));

  if (loading) {
    return (
      <div className={styles.container}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-zinc-700 border-t-zinc-100 rounded-full animate-spin"></div>
          <p className="text-zinc-500 font-medium tracking-widest uppercase text-sm">Caricamento Display...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${(showSelector || showPrerollModal) ? styles.showCursor : ''}`}>
      <button onClick={toggleFullscreen} className={styles.fullscreenBtn} title="Premi 'F' per lo schermo intero">
        {isFullscreen ? <Minimize color="white" /> : <Maximize color="white" />}
      </button>

      {/* BACKGROUND LAYER */}
      <div className={styles.background}>
        {mainStageMovie?.backdropPath && (
          <img 
            key={mainStageMovie.id}
            src={getTMDBImageUrl(mainStageMovie.backdropPath, 'original')!} 
            alt="Backdrop" 
            className={`${styles.backdropImage} ${transitioning ? styles.fadeOut : styles.fadeIn}`}
          />
        )}
      </div>

      {/* MAIN CONTENT */}
      {mainStageMovie && timer.type !== 'final-countdown' ? (
        <div className={`${styles.content} ${transitioning ? styles.fadeOut : styles.fadeIn}`}>
          <div className={styles.posterWrapper}>
            <img 
              src={getTMDBImageUrl(mainStageMovie.posterPath, 'w500')} 
              alt={mainStageMovie.title} 
              className={styles.poster}
            />
          </div>

          <div className={styles.titleWrapper}>
            {mainStageMovie.logoPath ? (
              <img 
                src={getTMDBImageUrl(mainStageMovie.logoPath, 'w500')!} 
                alt={mainStageMovie.title} 
                className={styles.logo}
              />
            ) : (
              <h1 className={styles.movieTitle}>{mainStageMovie.title}</h1>
            )}
            
            <div className={styles.movieDetails}>
              <span className={styles.director}>Regia di {mainStageMovie.director}</span>
              <span className={styles.cast}>{mainStageMovie.cast}</span>
              {mainStageMovie.roomName && (
                <span className={styles.roomName}>{mainStageMovie.roomName}</span>
              )}
            </div>
          </div>
        </div>
      ) : timer.type !== 'final-countdown' && (
        <div className={styles.content}>
           <h1 className={styles.movieTitle}>VESTRI CINEMA</h1>
           <p className="text-zinc-400 tracking-[0.5em] uppercase mt-4">Prossimamente in sala</p>
        </div>
      )}

      {/* STATUS BAR */}
      <div className={`${styles.statusBar} ${timer.type === 'final-countdown' ? styles.statusBarFull : ''}`}>
        <div className={styles.countdownWrapper}>
          {timer.label && <span className={styles.countdownLabel}>{timer.label}</span>}
          <h2 className={`
            ${styles.countdownTime} 
            ${timer.type === 'preroll-active' ? styles.prerollFlash : ''}
            ${timer.type === 'final-countdown' ? styles.finalTime : ''}
          `}>
            {timer.value}
          </h2>
        </div>

        {timer.type === 'playing' && (
           <div className={styles.progressContainer}>
             <div className={styles.progressBar} style={{ width: `${timer.progress}%` }}></div>
           </div>
        )}
      </div>

      {/* NEXT MOVIE BOX / SWAP BOX */}
      {isSideBoxVisible && sideBoxMovie && timer.type !== 'final-countdown' && (
        <div 
          className={`${styles.nextMovieBox} ${isSwapped || selectedMovieId ? styles.swappedBox : ''}`}
          onClick={handleSwap}
          onDoubleClick={() => setShowSelector(true)}
          title="Click per Scambio | Doppia Click per Selettore"
        >
          <img 
            src={getTMDBImageUrl(sideBoxMovie.posterPath, 'w185')} 
            alt={sideBoxMovie.title} 
            className={styles.nextPoster}
          />
          <div className={styles.nextInfo}>
            <span className={styles.nextLabel}>
              {(() => {
                const isActuallyCurrent = sideBoxMovie && currentMovie && sideBoxMovie.id === currentMovie.id;
                if (isActuallyCurrent) return 'Proiezione in Corso';
                return currentMovie ? 'Prossimo Spettacolo' : 'A seguire';
              })()}
            </span>
            <h3 className={styles.nextTitle}>{sideBoxMovie.title}</h3>
            <span className={styles.nextCountdown}>
              {isSwapped ? (() => {
                if (!now) return '-- min';
                const itNow = toZonedTime(now, TIMEZONE);
                const itEnd = toZonedTime(new Date(sideBoxMovie.date_to), TIMEZONE);
                const diff = Math.max(0, itEnd.getTime() - itNow.getTime());
                const mins = Math.floor(diff / 60000);
                return `Fine tra: ${mins} min`;
              })() : (
                toZonedTime(new Date(sideBoxMovie.date_from), TIMEZONE).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
              )}
            </span>
          </div>
          
          {isSwapped && (
            <div className={styles.swapIndicator}>
               <Minimize size={16} />
               <span>RESET</span>
            </div>
          )}
        </div>
      )}

      {/* MANUAL MOVIE SELECTOR OVERLAY */}
      {showSelector && (
        <div className={styles.selectorOverlay}>
          <h2 className={styles.selectorTitle}>Seleziona Spettacolo</h2>
          
          <div className={styles.selectorList}>
            {movies.map(movie => (
              <button 
                key={movie.id} 
                className={`${styles.selectorItem} ${selectedMovieId === movie.id ? styles.selectorItemActive : ''}`}
                onClick={() => {
                  setSelectedMovieId(movie.id);
                  setShowSelector(false);
                  setIsSwapped(false); // Clear swap if we manually select
                }}
              >
                <img src={getTMDBImageUrl(movie.posterPath, 'w185')} alt="" className={styles.selectorItemPoster} />
                <div className={styles.selectorItemInfo}>
                  <span className={styles.selectorItemTime}>
                    {toZonedTime(new Date(movie.date_from), TIMEZONE).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <h3 className={styles.selectorItemTitle}>{movie.title}</h3>
                </div>
              </button>
            ))}
          </div>

          <button 
            className={styles.autoButton}
            onClick={() => {
              setSelectedMovieId(null);
              setShowSelector(false);
            }}
          >
            Torna in Automatico
          </button>
        </div>
      )}
      {/* PREROLL ADJUSTMENT MODAL */}
      {showPrerollModal && (
        <div className={styles.prerollModal}>
          <h3>Regola Fase Advertising</h3>
          
          <div className={styles.prerollQuickAdjust}>
            <button className={styles.adjustBtn} onClick={() => setPrerollMins((prev) => (Math.max(0, parseInt(prev) - 1)).toString())}>-1 min</button>
            <button className={styles.adjustBtn} onClick={() => setPrerollMins((prev) => (parseInt(prev) + 1).toString())}>+1 min</button>
            <button className={styles.adjustBtn} onClick={() => setPrerollSecs((prev) => (Math.max(0, parseInt(prev) - 10)).toString())}>-10 sec</button>
            <button className={styles.adjustBtn} onClick={() => setPrerollSecs((prev) => (parseInt(prev) + 10).toString())}>+10 sec</button>
          </div>

          <div className={styles.prerollInputGroup}>
            <div className={styles.inputFieldWrapper}>
              <span className={styles.inputLabel}>Minuti</span>
              <input 
                type="number"
                value={prerollMins}
                onChange={(e) => setPrerollMins(e.target.value)}
                className={styles.prerollInput}
                autoFocus
              />
            </div>
            <span className={styles.inputDivider}>:</span>
            <div className={styles.inputFieldWrapper}>
              <span className={styles.inputLabel}>Secondi</span>
              <input 
                type="number"
                value={prerollSecs}
                onChange={(e) => setPrerollSecs(e.target.value)}
                className={styles.prerollInput}
              />
            </div>
          </div>

          <div className={styles.prerollModalActions}>
            <div className={styles.prerollMainActions}>
              <button 
                className={`${styles.prerollButton} ${styles.confirmBtn}`}
                onClick={() => {
                  const m = parseInt(prerollMins) || 0;
                  const s = parseInt(prerollSecs) || 0;
                  setPreroll(m * 60 + s);
                  setShowPrerollModal(false);
                }}
              >
                Conferma
              </button>
              <button 
                className={`${styles.prerollButton} ${styles.cancelBtn}`}
                onClick={() => setShowPrerollModal(false)}
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
