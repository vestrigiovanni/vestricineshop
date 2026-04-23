'use client';

import { useTrailer } from '@/context/TrailerContext';
import styles from './VideoPlayerModal.module.css';
import { useEffect, useState } from 'react';

export default function VideoPlayerModal() {
  const { isOpen, videoId, closeTrailer } = useTrailer();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  if (!isOpen && !videoId) return null;

  return (
    <div 
      className={`${styles.overlay} ${isOpen ? styles.active : ''}`} 
      onClick={closeTrailer}
    >
      <div 
        className={styles.modal} 
        onClick={e => e.stopPropagation()}
      >
        <button className={styles.closeBtn} onClick={closeTrailer} aria-label="Close trailer">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
        <div className={styles.videoWrapper}>
          {videoId && (
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&origin=${window.location.origin}`}
              title="Movie Trailer"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          )}
        </div>
      </div>
    </div>
  );
}
