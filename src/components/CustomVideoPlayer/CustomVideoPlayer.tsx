import React, { useEffect, useRef, useState } from 'react';
import styles from './CustomVideoPlayer.module.css';
import { X } from 'lucide-react';

interface CustomVideoPlayerProps {
  videoId: string | null;
  videoIds?: string[];
  backdropUrl?: string;
  isPlaying: boolean;
  onClose: () => void;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export default function CustomVideoPlayer({ videoId, videoIds = [], backdropUrl, isPlaying, onClose }: CustomVideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerWrapperRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  const [mounted, setMounted] = useState(false);
  const [showCurtain, setShowCurtain] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [allVideosFailed, setAllVideosFailed] = useState(false);
  const [apiReady, setApiReady] = useState(false);

  const videoPlaylist = React.useMemo(() => {
    // Priorità assoluta al videoId (override manuale)
    const list = [];
    if (videoId) list.push(videoId);
    if (videoIds.length > 0) list.push(...videoIds);
    
    // Rimuovi duplicati mantenendo l'ordine (l'override sarà sempre primo)
    const uniqueList = Array.from(new Set(list));
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Trailer System] Playlist prioritizzata (${uniqueList.length} video):`, uniqueList);
    }
    return uniqueList;
  }, [videoId, videoIds]);

  useEffect(() => {
    setMounted(true);
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube-nocookie.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      window.onYouTubeIframeAPIReady = () => setApiReady(true);
    } else if (window.YT && window.YT.Player) {
      setApiReady(true);
    }
  }, []);

  useEffect(() => {
    if (!isPlaying || !mounted || !apiReady || videoPlaylist.length === 0 || allVideosFailed) return;

    const currentId = videoPlaylist[currentVideoIndex];
    if (!currentId) return;

    setShowCurtain(true);

    const initPlayer = () => {
      if (!playerWrapperRef.current) return;

      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch (e) { }
        playerRef.current = null;
      }

      playerWrapperRef.current.innerHTML = '';
      const anchor = document.createElement('div');
      playerWrapperRef.current.appendChild(anchor);

      playerRef.current = new window.YT.Player(anchor, {
        videoId: currentId,
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          enablejsapi: 1,
          playsinline: 1,
          loop: 1,
          playlist: currentId
        },
        host: 'https://www.youtube-nocookie.com',
        events: {
          onReady: (event: any) => {
            event.target.playVideo();
            setTimeout(() => {
              event.target.unMute();
              event.target.setVolume(80);
              setShowCurtain(false);
            }, 1800);
          },
          onStateChange: (event: any) => {
            if (event.data === 0) {
              event.target.playVideo();
            }
          },
          onError: (event: any) => {
            if (process.env.NODE_ENV !== 'production') {
              console.warn(`[Trailer Fallback] Fallimento su ID ${currentId} (Errore: ${event.data})`);
            }
            handleVideoError();
          }
        }
      });
    };

    const timer = setTimeout(initPlayer, 400);
    return () => {
      clearTimeout(timer);
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch (e) { }
        playerRef.current = null;
      }
    };
  }, [isPlaying, mounted, apiReady, currentVideoIndex, allVideosFailed, videoPlaylist]);

  const handleVideoError = () => {
    if (currentVideoIndex < videoPlaylist.length - 1) {
      setCurrentVideoIndex(prev => prev + 1);
    } else {
      if (process.env.NODE_ENV !== 'production') {
        console.info(`[Cinema Mode] Trailers non disponibili per questo titolo. Attivazione Backdrop Cinematografico.`);
      }
      setAllVideosFailed(true);
      setShowCurtain(false);
    }
  };

  useEffect(() => {
    if (!isPlaying || !mounted) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'f') {
        if (!document.fullscreenElement) {
          containerRef.current?.requestFullscreen().catch(() => { });
        } else {
          document.exitFullscreen();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, mounted]);

  useEffect(() => {
    if (!isPlaying || !mounted) return;
    let timeoutId: NodeJS.Timeout;
    const resetTimer = () => {
      setShowControls(true);
      clearTimeout(timeoutId);
      // Sempre attivo l'auto-hide dopo 2 secondi di inattività mouse
      timeoutId = setTimeout(() => setShowControls(false), 2000);
    };
    window.addEventListener('mousemove', resetTimer);
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) setShowControls(true);
    });
    // Inizializza il timer all'avvio
    resetTimer();
    return () => {
      window.removeEventListener('mousemove', resetTimer);
      clearTimeout(timeoutId);
    };
  }, [isPlaying, mounted]);

  const handleClose = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
    setCurrentVideoIndex(0);
    setAllVideosFailed(false);
    onClose();
  };

  if (videoPlaylist.length === 0 && !allVideosFailed) return null;
  if (!mounted) return <div className={`${styles.playerContainer} ${styles.hidden}`} />;

  return (
    <div
      ref={containerRef}
      className={`${styles.playerContainer} ${isPlaying ? styles.visible : styles.hidden} ${!showControls ? styles.hideCursor : ''}`}
    >
      <div className={styles.videoWrapper}>
        {allVideosFailed && backdropUrl && (
          <div
            className={styles.kenBurnsBackdrop}
            style={{ backgroundImage: `url(${backdropUrl})` }}
          />
        )}

        {!allVideosFailed && (
          <>
            <div ref={playerWrapperRef} className={styles.iframeWrapper} />
            <div className={styles.mouseShield} />
            <div className={`${styles.curtain} ${showCurtain ? styles.curtainVisible : styles.curtainHidden}`} />
          </>
        )}
      </div>

      {isPlaying && (
        <div className={`${styles.controlsContainer} ${showControls ? styles.controlsVisible : styles.controlsHidden}`}>
          <button
            onClick={handleClose}
            className={styles.closeButton}
            aria-label="Esci dal Trailer"
          >
            <X size={24} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  );
}
