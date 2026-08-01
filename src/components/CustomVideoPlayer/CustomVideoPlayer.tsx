'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { Play, Volume2, VolumeX, X } from 'lucide-react';
import styles from './CustomVideoPlayer.module.css';

interface CustomVideoPlayerProps {
  videoId: string | null;
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

export default function CustomVideoPlayer({ videoId, backdropUrl, isPlaying, onClose }: CustomVideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerWrapperRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  const [mounted, setMounted] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  // Safari blocca l'audio senza un gesto dell'utente: partiamo muti e lo
  // diciamo con un pulsante, invece di forzare e farci fermare il video.
  const [isMuted, setIsMuted] = useState(true);
  // L'autoplay è stato rifiutato del tutto: serve un tocco per partire.
  const [needsUserPlay, setNeedsUserPlay] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Attesa dell'API YouTube.
  //
  // Affidarsi al solo `onYouTubeIframeAPIReady` era una corsa persa quando lo
  // script era già nella cache del browser: l'API chiamava la callback prima
  // che React la registrasse, `apiReady` restava false e il trailer non
  // partiva mai. Il controllo periodico non dipende da chi arriva primo.
  useEffect(() => {
    if (!mounted || apiReady) return;

    if (window.YT?.Player) {
      setApiReady(true);
      return;
    }

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      setApiReady(true);
    };

    const poll = setInterval(() => {
      if (window.YT?.Player) {
        setApiReady(true);
        clearInterval(poll);
      }
    }, 120);
    const giveUp = setTimeout(() => clearInterval(poll), 20000);

    return () => {
      clearInterval(poll);
      clearTimeout(giveUp);
    };
  }, [mounted, apiReady]);

  /**
   * Prova a togliere il muto e verifica l'esito: se il browser reagisce
   * fermando il video (Safari, e Chrome quando il sito non ha "engagement"),
   * si torna muti e si riparte, lasciando l'audio a un gesto dell'utente.
   */
  const tryUnmute = useCallback(() => {
    const player = playerRef.current;
    if (!player || typeof player.unMute !== 'function') return;

    try {
      player.unMute();
      player.setVolume(80);
    } catch {
      return;
    }

    setTimeout(() => {
      const p = playerRef.current;
      if (!p) return;
      const stillPlaying = p.getPlayerState?.() === 1;
      const actuallyUnmuted = p.isMuted?.() === false;

      if (stillPlaying && actuallyUnmuted) {
        setIsMuted(false);
      } else {
        try {
          p.mute();
          p.playVideo();
        } catch { }
        setIsMuted(true);
      }
    }, 500);
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      setVideoReady(false);
      setNeedsUserPlay(false);
      setIsMuted(true);
      return;
    }

    if (!mounted || !apiReady || !videoId) return;

    // Se dopo 5 secondi il player non ha mai raggiunto lo stato PLAYING vuol
    // dire che il browser ha rifiutato l'autoplay: scopriamo comunque lo
    // schermo e offriamo il tocco per far partire il trailer, invece di
    // lasciare un rettangolo nero.
    const safetyTimer = setTimeout(() => {
      setVideoReady(true);
      const state = playerRef.current?.getPlayerState?.();
      if (state !== 1) setNeedsUserPlay(true);
    }, 5000);

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
        videoId: videoId,
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
          playlist: videoId,
          origin: typeof window !== 'undefined' ? window.location.origin : ''
        },
        host: 'https://www.youtube-nocookie.com',
        events: {
          onReady: (event: any) => {
            if (event.target && typeof event.target.playVideo === 'function') {
              event.target.playVideo();
              // L'audio si tenta, ma con rete di sicurezza: su Safari
              // togliere il muto senza un gesto dell'utente fa mettere in
              // pausa il video, ed è così che il trailer restava nero su Mac.
              setTimeout(() => tryUnmute(), 1000);
            }
          },
          onStateChange: (event: any) => {
            // 1: PLAYING, 0: ENDED
            if (event.data === 1) {
              setNeedsUserPlay(false);
              setTimeout(() => setVideoReady(true), 300);
            } else if (event.data === 0) {
              // Forziamo il loop se il parametro loop non bastasse
              event.target.playVideo();
            }
          },
          onError: () => {
            // Video non incorporabile o non disponibile: meglio mostrare il
            // fondale del film che un riquadro nero.
            setVideoReady(true);
            setNeedsUserPlay(true);
          }
        }
      });
    };

    initPlayer();
    
    return () => {
      clearTimeout(safetyTimer);
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch (e) { }
        playerRef.current = null;
      }
    };
  }, [isPlaying, mounted, apiReady, videoId]);

  useEffect(() => {
    if (!isPlaying || !mounted) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
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
      timeoutId = setTimeout(() => setShowControls(false), 2000);
    };
    window.addEventListener('mousemove', resetTimer);
    return () => {
      window.removeEventListener('mousemove', resetTimer);
      clearTimeout(timeoutId);
    };
  }, [isPlaying, mounted]);

  const toggleSound = () => {
    const player = playerRef.current;
    if (!player) return;
    try {
      if (isMuted) {
        player.unMute();
        player.setVolume(80);
        setIsMuted(false);
      } else {
        player.mute();
        setIsMuted(true);
      }
    } catch { }
  };

  const handleManualPlay = () => {
    const player = playerRef.current;
    if (!player) return;
    try {
      player.playVideo();
      player.unMute();
      player.setVolume(80);
      setIsMuted(false);
      setNeedsUserPlay(false);
    } catch { }
  };

  const handleClose = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
    onClose();
  };

  if (!mounted) return null;

  return (
    <div
      ref={containerRef}
      className={`${styles.playerContainer} ${isPlaying ? styles.visible : styles.hidden} ${!showControls ? styles.hideCursor : ''}`}
    >
      {/* La disponibilità dell'API la rileva l'effetto qui sopra, che regge
          anche il caso dello script già in cache. */}
      <Script
        src="https://www.youtube.com/iframe_api"
        strategy="afterInteractive"
      />
      <div className={styles.videoWrapper}>
        <div 
          className={`${styles.blackVeil} ${videoReady ? styles.veilHidden : ''}`} 
        />
        <div 
          ref={playerWrapperRef} 
          className={styles.iframeWrapper} 
        />
        <div className={styles.mouseShield} />

        {/* L'autoplay è stato rifiutato: un tocco fa partire il trailer. */}
        {needsUserPlay && videoReady && (
          <button
            type="button"
            onClick={handleManualPlay}
            className={styles.playFallback}
            aria-label="Riproduci il trailer"
          >
            <Play size={30} strokeWidth={1.5} />
            <span>Riproduci trailer</span>
          </button>
        )}
      </div>

      <div className={`${styles.controlsContainer} ${showControls ? styles.controlsVisible : styles.controlsHidden}`}>
        <button
          type="button"
          onClick={toggleSound}
          className={styles.soundButton}
          aria-label={isMuted ? 'Attiva l’audio' : 'Disattiva l’audio'}
        >
          {isMuted ? <VolumeX size={22} strokeWidth={1.5} /> : <Volume2 size={22} strokeWidth={1.5} />}
        </button>

        <button
          type="button"
          onClick={handleClose}
          className={styles.closeButton}
          aria-label="Esci dal Trailer"
        >
          <X size={24} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
