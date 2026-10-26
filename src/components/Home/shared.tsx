'use client';

import { createContext, useContext, useEffect, useRef, useState, type RefObject } from 'react';
import Image from 'next/image';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import { cinemaToday, formatShowDayLong, formatShowTime, toCinemaDayKey } from '@/utils/cinemaDate';
import { resolveFestival } from './festivals';
import { premioDi, type HomeMovie, type HomeShow } from './programma';
import base from './Home.module.css';

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

export function prefersMotion(): boolean {
  return typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Porta la pagina a un elemento, con lo scorrimento del browser. */
export function vaiA(selector: string, sopra = 64) {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - sopra, behavior: prefersMotion() ? 'smooth' : 'auto' });
}

// ─── Le parole della scheda ───────────────────────────────────────────────

export const maiuscola = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
export const ora = (s: Show) => s.timeLabel || formatShowTime(s.date);

/** "Oggi", "Domani", "Mercoledì 28 ottobre". */
export function giornoDi(date: string, now: Date): string {
  const key = toCinemaDayKey(date);
  if (key === toCinemaDayKey(now)) return 'Oggi';
  const domani = new Date(cinemaToday(now).getTime() + 24 * 3600 * 1000);
  if (key === toCinemaDayKey(domani)) return 'Domani';
  return maiuscola(formatShowDayLong(date));
}

/** "Oggi alle 16:00", "Mercoledì 28 ottobre alle 15:00". */
export const quando = (s: Show, now: Date) => `${giornoDi(s.date, now)} alle ${ora(s)}`;

export const durata = (m?: number | null) => (m ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : '');

/** Regia, anno, durata: i crediti, in quest'ordine. */
export const crediti = (f: Film) => [f.director, f.release_year, durata(f.runtime)].filter(Boolean) as string[];

/** "Francese, sottotitoli in italiano". */
export function lingua(s: Show): string {
  const l = (s.language || '').trim();
  const lingua = /^originale$/i.test(l) ? 'Versione originale' : l;
  // Nel catalogo "senza sottotitoli" si scrive anche "Nessuno".
  const sub = (s.subtitles || '').trim().replace(/^(nessun[oai]?|no|none|-)$/i, '');
  return [lingua, sub ? `sottotitoli in ${sub.toLowerCase()}` : ''].filter(Boolean).join(', ');
}

/** Come si proietta: "4K", "Dolby Atmos". */
export const tecnica = (s: Show) => (s.specs || []).map(x => x.replace('DOLBY_VISION', 'Dolby Vision').replace('ATMOS', 'Dolby Atmos'));

/** "Palma d'oro, Festival di Cannes 1994". */
export function premio(f: Film): string {
  const p = premioDi(f);
  if (!p) return '';
  return `${maiuscola(p.prize)}, ${resolveFestival(p.type).name}${p.year ? ` ${p.year}` : ''}`;
}

// ─── Prenotazione ─────────────────────────────────────────────────────────

export type BookFn = (show: Show, film: Film) => void;
export const BookContext = createContext<BookFn>(() => {});
export const useBook = () => useContext(BookContext);

/**
 * Prenota: l'unica azione della pagina, con un'etichetta sola. Pieno (la
 * pillola, nel colore del film) o come link ("Prenota ›") dentro una scheda.
 */
export function Prenota({ show, film, now, variante = 'pieno', className = '' }: { show: Show; film: Film; now: Date; variante?: 'pieno' | 'link'; className?: string }) {
  const book = useBook();
  if (show.isSoldOut) return <span className={`${base.esaurito} ${className}`}>Esaurito</span>;
  return (
    <button
      type="button"
      className={`${variante === 'pieno' ? base.prenota : base.prenotaLink} ${className}`}
      onClick={() => book(show, film)}
      aria-label={`Prenota ${film.title}, ${quando(show, now).toLowerCase()}`}
    >
      Prenota
    </button>
  );
}

// ─── Logo del film ────────────────────────────────────────────────────────

/**
 * Il logo TMDB del film al posto del titolo. Se il logo è quasi nero lo si
 * accende in bianco: lo decide una misura sui pixel, fatta sull'immagine
 * servita da Next (stessa origine, quindi leggibile). Senza logo, il titolo.
 */
export function FilmLogo({ film, className = '', sizes = '(max-width: 768px) 70vw, 420px', priority = false }: { film: Film; className?: string; sizes?: string; priority?: boolean }) {
  const [acceso, setAcceso] = useState(false);
  const path = film.logo_path && film.logo_path !== 'none' ? film.logo_path : '';
  if (!path) return <span className={`${base.logoTesto} ${className}`}>{film.title}</span>;
  return (
    <Image
      src={img(path, 'w500')}
      alt={film.title}
      width={500}
      height={200}
      sizes={sizes}
      priority={priority}
      className={`${base.logo} ${className} ${acceso ? base.logoAcceso : ''}`}
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

// ─── La scheda ────────────────────────────────────────────────────────────

/**
 * La scheda di un film: la stessa per ogni film della pagina, come le
 * etichette di una collezione. Solo dati veri, niente frasi.
 */
export function Scheda({ film, show, now, className = '', conLogo = true, prenota = 'link' }: { film: Film; show: Show; now: Date; className?: string; conLogo?: boolean; prenota?: 'pieno' | 'link' }) {
  const righe = [crediti(film).join(' · '), [lingua(show), ...tecnica(show)].filter(Boolean).join(' · '), premio(film)].filter(Boolean);
  return (
    <div className={`${base.scheda} ${className}`}>
      <p className={base.quando}>{quando(show, now)}</p>
      {conLogo ? <h3 className={base.schedaTitolo}><FilmLogo film={film} className={base.schedaLogo} sizes="240px" /></h3> : <h3 className={base.schedaNome}>{film.title}</h3>}
      {righe.map(r => <p key={r} className={base.riga}>{r}</p>)}
      <Prenota show={show} film={film} now={now} variante={prenota} />
    </div>
  );
}

// ─── Caricamento pigro ────────────────────────────────────────────────────

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

/**
 * Le immagini di un atto si chiedono solo quando l'atto è a circa uno schermo
 * e mezzo: al primo caricamento il telefono scarica l'apertura e poco altro.
 * Va dentro un contenitore posizionato (come le immagini `fill` che avvolge).
 */
export function Vicina({ children }: { children: React.ReactNode }) {
  const [ref, near] = useInView<HTMLSpanElement>('150% 0px');
  if (near) return <>{children}</>;
  return <span ref={ref} aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />;
}
