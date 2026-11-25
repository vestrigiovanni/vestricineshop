'use client';

import { createContext, useContext, useEffect, useRef, useState, type RefObject } from 'react';
import Image from 'next/image';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import { Posti } from './Dati';
import { quando, type Film, type Show } from './metadati';
import base from './Home.module.css';

// Le parole dei metadati stanno in `metadati.ts` (coi test); qui restano i pezzi
// che si toccano: Prenota, il logo del film, il caricamento pigro.
export type { Film, Show } from './metadati';
export { crediti, durata, giornoBreve, giornoDi, lingua, maiuscola, ora, quando, tecnica } from './metadati';

export const img = (path: string | null | undefined, size = 'w1280') => getTMDBImageUrl(path, size) || '';
/**
 * Un'immagine della proiezione speciale: un percorso TMDB ("/abc.jpg"), un file
 * del sito ("/speciali/…") o un'immagine caricata dal gestionale ("/api/…").
 */
export const immagine = (ref: string | null | undefined, size = 'w1280') =>
  ref && (ref.startsWith('/speciali/') || ref.startsWith('/api/')) ? ref : img(ref, size);

export function prefersMotion(): boolean {
  return typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Porta la pagina a un elemento, con lo scorrimento del browser. */
export function vaiA(selector: string, sopra = 64) {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - sopra, behavior: prefersMotion() ? 'smooth' : 'auto' });
}

// ─── Prenotazione ─────────────────────────────────────────────────────────

/**
 * Che cosa fa Prenota: porta il film nell'apertura, con la sua scheda intera
 * (trama, premi, giorni e orari), e da lì si apre il cassetto. Così era prima
 * del 18 ottobre, e così l'ha rivoluto Giovanni il 26.
 */
export type BookFn = (show: Show, film: Film) => void;
export const BookContext = createContext<BookFn>(() => {});
export const useBook = () => useContext(BookContext);

/**
 * Prenota: l'unica azione della pagina, con un'etichetta sola. Pieno (la
 * pillola, nel colore del film) o come link ("Prenota ›") dentro una scheda.
 */
export function Prenota({ show, film, now, variante = 'pieno', className = '' }: { show: Show; film: Film; now: Date; variante?: 'pieno' | 'link'; className?: string }) {
  const book = useBook();
  if (show.isSoldOut) return <Posti show={show} className={`${base.esaurito} ${className}`} />;
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
 * Il logo TMDB del film al posto del titolo, in una scatola di altezza fissa
 * (la decide `className`): così quando arriva niente si sposta. Se il logo è
 * quasi nero lo si accende in bianco: lo decide una misura sui pixel, fatta
 * sull'immagine servita da Next (stessa origine, quindi leggibile). Senza
 * logo, il titolo.
 */
export function FilmLogo({ film, className = '', sizes = '(max-width: 860px) 70vw, 420px', subito = false, verso = 'basso' }: { film: Film; className?: string; sizes?: string; subito?: boolean; verso?: 'basso' | 'centro' }) {
  const [acceso, setAcceso] = useState(false);
  const path = film.logo_path && film.logo_path !== 'none' ? film.logo_path : '';
  if (!path) return <span className={`${base.logoBox} ${base.logoTesto} ${className}`}>{film.title}</span>;
  return (
    <span className={`${base.logoBox} ${acceso ? base.logoAcceso : ''} ${className}`} data-verso={verso}>
      <Image
        src={img(path, 'w500')}
        alt={film.title}
        fill
        sizes={sizes}
        loading={subito ? 'eager' : 'lazy'}
        className={base.logo}
        onLoad={e => { if (isDark(e.currentTarget)) setAcceso(true); }}
      />
    </span>
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
