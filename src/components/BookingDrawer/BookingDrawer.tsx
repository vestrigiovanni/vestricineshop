'use client';

import { useEffect, useRef } from 'react';
import styles from './BookingDrawer.module.css';
import BookingFlow from '../BookingFlow';

interface BookingDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  subeventId: number | null;
  movieTitle?: string;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

export default function BookingDrawer({ isOpen, onClose, subeventId, movieTitle }: BookingDrawerProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const scrollLock = useRef(0);

  // Blocco dello scroll di fondo. Su iOS il solo `overflow: hidden` sul body
  // non basta — la pagina continua a scorrere dietro al pannello — quindi il
  // body va fissato e la posizione ripristinata alla chiusura.
  useEffect(() => {
    if (!isOpen) return;

    const { body } = document;
    scrollLock.current = window.scrollY;

    const previous = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    body.style.position = 'fixed';
    body.style.top = `-${scrollLock.current}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';

    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      window.scrollTo(0, scrollLock.current);
    };
  }, [isOpen]);

  // Esc per chiudere e focus trattenuto nel pannello: prima si usciva solo
  // cliccando lo sfondo, e col Tab si finiva a navigare la pagina sottostante
  // mentre il drawer copriva tutto lo schermo.
  useEffect(() => {
    if (!isOpen) return;

    lastFocused.current = document.activeElement as HTMLElement | null;

    // Il contenuto monta insieme al drawer: aspettiamo il frame successivo.
    const raf = requestAnimationFrame(() => {
      const panel = contentRef.current;
      if (!panel) return;
      const target = panel.querySelector<HTMLElement>(FOCUSABLE) || panel;
      target.focus({ preventScroll: true });
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key !== 'Tab') return;

      const panel = contentRef.current;
      if (!panel) return;

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => el.offsetParent !== null);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', handleKeyDown);
      // Alla chiusura il focus torna da dove era partito.
      lastFocused.current?.focus?.({ preventScroll: true });
    };
  }, [isOpen, onClose]);

  return (
    <>
      {/* Background Overlay with Blur */}
      <div
        className={`${styles.drawerOverlay} ${isOpen ? styles.open : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Centered Modal Container */}
      <div
        className={`${styles.drawerContainer} ${isOpen ? styles.open : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={movieTitle ? `Prenotazione — ${movieTitle}` : 'Prenotazione'}
        aria-hidden={!isOpen}
      >
        <div className={styles.drawerContent} ref={contentRef} tabIndex={-1}>
          {/* Render context-aware booking flow */}
          {isOpen && (
            <BookingFlow
              subeventId={subeventId || undefined}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </>
  );
}
