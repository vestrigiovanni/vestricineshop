'use client';

import React, { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { X } from 'lucide-react';
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

  useEffect(() => {
    setMounted(true);
    if (window.YT && window.YT.Player) {
      setApiReady(true);
    }
  }, []);

  const handleScriptLoad = () => {
    if (window.YT) {
      window.onYouTubeIframeAPIReady = () => setApiReady(true);
      if (window.YT.Player) setApiReady(true);
    }
  };

  useEffect(() => {
    if (!isPlaying) {
      setVideoReady(false);
      return;
    }

    if (!mounted || !apiReady || !videoId) return;

    // Safety reveal after 5 seconds if YouTube API fails to report PLAYING state
    const safetyTimer = setTimeout(() => {
      setVideoReady(true);
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
          origin: typeof window !== 'undefined' ? window.location.origin : ''
        },
        host: 'https://www.youtube-nocookie.com',
        events: {
          onReady: (event: any) => {
            if (event.target && typeof event.target.playVideo === 'function') {
              event.target.playVideo();
              // Delay per l'audio per evitare blocchi dell'autoplay dai browser
              setTimeout(() => {
                if (event.target && typeof event.target.unMute === 'function') {
                  event.target.unMute();
                  event.target.setVolume(80);
                }
              }, 1000);
            }
          },
          onStateChange: (event: any) => {
            // When the video actually starts playing, we reveal it
            // 1 is the numeric value for window.YT.PlayerState.PLAYING
            if (event.data === 1) {
              // Give it a tiny bit of buffer to ensure the first frames are rendered
              setTimeout(() => setVideoReady(true), 300);
            }
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
      <Script 
        src="https://www.youtube.com/iframe_api"
        strategy="afterInteractive"
        onLoad={handleScriptLoad}
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
      </div>

      <div className={`${styles.controlsContainer} ${showControls ? styles.controlsVisible : styles.controlsHidden}`}>
        <button
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
