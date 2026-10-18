'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type DependencyList, type RefObject } from 'react';
import Image from 'next/image';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import { formatShowDayLabel, formatShowDayLong, formatShowTime } from '@/utils/cinemaDate';
import type { HomeMovie, HomeShow } from './regia';
import base from './Home.module.css';

if (typeof window !== 'undefined') gsap.registerPlugin(ScrollTrigger);
export { gsap, ScrollTrigger };

/** Un film della home: quello che arriva dalla pagina, con i campi che la home legge. */
export interface Film extends HomeMovie {
  director?: string;
  runtime?: number | null;
  release_year?: string;
  cast?: string[];
  isSoldOut?: boolean;
  subevents: Show[];
}
export interface Show extends HomeShow {
  dayLabel?: string;
  timeLabel?: string;
}

export const img = (path: string | null | undefined, size = 'w1280') => getTMDBImageUrl(path, size) || '';

// ─── Movimento ────────────────────────────────────────────────────────────

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function prefersMotion(): boolean {
  return typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Le animazioni di un pezzo: girano dentro un `gsap.context` legato al suo
 * contenitore e si smontano da sole. Con "riduci movimento" non partono e il
 * pezzo resta com'è, completo e fermo.
 */
export function useRegia(scope: RefObject<HTMLElement | null>, setup: (phone: boolean) => void | (() => void), deps: DependencyList = []) {
  useIsoLayoutEffect(() => {
    if (!scope.current || !prefersMotion()) return;
    let cleanup: void | (() => void);
    const ctx = gsap.context(() => { cleanup = setup(window.innerWidth < 768); }, scope);
    return () => { if (typeof cleanup === 'function') cleanup(); ctx.revert(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// ─── Prenotazione ─────────────────────────────────────────────────────────

export type BookFn = (show: Show, film: Film) => void;
export const BookContext = createContext<BookFn>(() => {});
export const useBook = () => useContext(BookContext);

export function PrenotaButton({ show, film, label, className = '' }: { show: Show; film: Film; label?: string; className?: string }) {
  const book = useBook();
  if (show.isSoldOut) return <button className={`${base.prenota} ${className}`} disabled>Esaurito</button>;
  return (
    <button className={`${base.prenota} ${className}`} onClick={() => book(show, film)} aria-label={`Prenota ${film.title} alle ${formatShowTime(show.date)}`}>
      {label ?? 'Prenota'}
    </button>
  );
}

// ─── Testi ────────────────────────────────────────────────────────────────

export const dayLong = (date: string) => formatShowDayLong(date);
export const dayLabel = (date: string, now: Date) => formatShowDayLabel(date, now);
export const time = (date: string) => formatShowTime(date);
export const runtime = (m?: number | null) => (m ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}′` : '');
export const specs = (s: Show) => (s.specs || []).map(x => x.replace('DOLBY_VISION', 'Dolby Vision').replace('ATMOS', 'Atmos'));
export const lingua = (s: Show) => [s.language, s.subtitles ? `sott. ${s.subtitles.toLowerCase().slice(0, 3)}` : ''].filter(Boolean).join(' · ');
export const sala = (s: Show) => (s.roomName ? `Sala ${s.roomName}` : '');
export const dataLine = (f: Film, s: Show) => [f.director, f.release_year, runtime(f.runtime), lingua(s), ...specs(s)].filter(Boolean);

// ─── Logo del film ────────────────────────────────────────────────────────

/**
 * Il logo TMDB del film al posto del titolo. Se il logo è quasi nero lo si
 * accende in bianco: lo decide una misura sui pixel, fatta sull'immagine
 * servita da Next (stessa origine, quindi leggibile). Senza logo, il titolo
 * in Libre Caslon.
 */
export function FilmLogo({ film, className = '', sizes = '(max-width: 768px) 70vw, 420px', priority = false }: { film: Film; className?: string; sizes?: string; priority?: boolean }) {
  const [acceso, setAcceso] = useState(false);
  const path = film.logo_path && film.logo_path !== 'none' ? film.logo_path : '';
  if (!path) return <span className={`${base.titoli} ${className}`} data-logo-testo>{film.title}</span>;
  return (
    <Image
      src={img(path, 'w500')}
      alt={film.title}
      width={500}
      height={200}
      sizes={sizes}
      priority={priority}
      className={`${className} ${acceso ? base.logoAcceso : ''}`}
      style={{ width: 'auto', height: 'auto' }}
      onLoad={e => { if (isDark(e.currentTarget)) setAcceso(true); }}
    />
  );
}

function isDark(el: HTMLImageElement): boolean {
  try {
    const w = 64, h = Math.max(8, Math.round((64 * el.naturalHeight) / el.naturalWidth));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); if (!x) return false;
    x.drawImage(el, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; }
    return n > 0 && sum / n < 70;
  } catch { return false; }
}

// ─── Coda di un pezzo: logo, quando, Prenota ──────────────────────────────

export function Coda({ film, show, className = '' }: { film: Film; show: Show; className?: string }) {
  return (
    <div className={className} data-coda>
      <FilmLogo film={film} className={base.codaLogo} />
      <div className={base.codaRiga}>
        <span className={base.dati}>{[dayLong(show.date), time(show.date), sala(show)].filter(Boolean).join(' · ')}</span>
        <PrenotaButton show={show} film={film} />
      </div>
    </div>
  );
}

/** Il primo spettacolo ancora prenotabile di un film (o il primo, se sono tutti esauriti). */
export function nextShow(f: Film, now: Date): Show {
  const future = f.subevents.filter(s => new Date(s.date) >= now);
  return future.find(s => !s.isSoldOut) || future[0] || f.subevents[0];
}

/** Osserva quando un elemento entra in vista (una volta sola). */
export function useInView<T extends HTMLElement>(margin = '200px'): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [margin, seen]);
  return [ref, seen];
}
