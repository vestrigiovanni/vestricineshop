'use client';

import { useEffect } from 'react';
import { luceDa, NEUTRA, tintaDa, type Luce as Colori, type Tinta } from './tinta';
import { img } from './pezzi';

/**
 * La luce del film, la firma della Home: la pagina è una sala buia e la colora
 * il film che hai davanti.
 *
 * 1. Si misura il colore di ogni film sui pixel di una miniatura del fondale
 *    (TMDB dà il permesso CORS a tutti) e lo si scrive su ogni elemento con
 *    `data-film`: Prenota, le cifre e i link di quel film prendono il suo colore.
 * 2. Quando ci si ferma con un `data-luce` a metà schermo, tutta la pagina
 *    prende la luce di quel film: fondo, accento e luce d'ambiente.
 *    `data-luce="buio"` spegne le luci (prima del trailer), `"tutti"` le
 *    accende tutte insieme (in fondo).
 * La stanza cambia quando ci si ferma, non mentre si scorre: nella v1 ogni
 * cambio a metà scorrimento costava un fotogramma lungo su Firefox.
 *
 * Accende anche i loghi quasi neri, che sul fondo scuro sparirebbero.
 */

const FERMO = 140;
const BUIO = '#070708';

function misura(el: HTMLImageElement): Tinta {
  try {
    const w = 48, h = Math.max(8, Math.round((48 * el.naturalHeight) / el.naturalWidth));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    if (!x) return NEUTRA;
    x.drawImage(el, 0, 0, w, h);
    return tintaDa(x.getImageData(0, 0, w, h).data);
  } catch { return NEUTRA; }
}

function scuro(el: HTMLImageElement): boolean {
  try {
    const w = 64, h = Math.max(8, Math.round((64 * el.naturalHeight) / el.naturalWidth));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    if (!x) return false;
    x.drawImage(el, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    let somma = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { somma += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; }
    return n > 0 && somma / n < 70;
  } catch { return false; }
}

const VARIABILI = ['--f-accento', '--f-ink', '--f-bagliore'] as const;
const scrivi = (el: HTMLElement, l: Colori) => {
  el.style.setProperty('--f-accento', l.accento);
  el.style.setProperty('--f-ink', l.accentoInk);
  el.style.setProperty('--f-bagliore', l.bagliore);
};

export default function Luce({ films }: { films: { id: number; fondale: string }[] }) {
  useEffect(() => {
    const html = document.documentElement;
    const luci = new Map<number, Colori | null>();
    let scena: string | null = null;
    let vivo = true;

    const accendi = () => {
      const l = scena && /^\d+$/.test(scena) ? luci.get(Number(scena)) ?? null : null;
      html.dataset.scena = scena === 'buio' || scena === 'tutti' ? scena : l ? 'film' : '';
      if (l) {
        html.style.setProperty('--luce', l.accento);
        html.style.setProperty('--luce-ink', l.accentoInk);
        html.style.setProperty('--luce-fondo', l.fondo);
        html.style.setProperty('--luce-bagliore', l.bagliore);
      } else {
        for (const v of ['--luce', '--luce-ink', '--luce-fondo', '--luce-bagliore']) html.style.removeProperty(v);
        if (scena === 'buio') html.style.setProperty('--luce-fondo', BUIO);
      }
      let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
      meta.content = getComputedStyle(html).getPropertyValue('--luce-fondo').trim() || '#0f0b09';
    };

    // 1. Il colore di ogni film.
    for (const f of films) {
      if (!f.fondale) continue;
      const im = new window.Image();
      im.crossOrigin = 'anonymous';
      im.decoding = 'async';
      im.onload = () => {
        if (!vivo) return;
        const l = luceDa(misura(im));
        luci.set(f.id, l);
        if (l) document.querySelectorAll<HTMLElement>(`[data-film="${f.id}"]`).forEach(el => scrivi(el, l));
        if (scena === String(f.id)) accendi();
      };
      im.src = img(f.fondale, 'w92');
    }

    // I loghi quasi neri si accendono in bianco.
    const loghi = (radice: ParentNode) => radice.querySelectorAll<HTMLImageElement>('img[data-logo]').forEach(el => {
      const prova = () => { if (scuro(el)) el.dataset.acceso = ''; };
      if (el.complete && el.naturalWidth) prova(); else el.addEventListener('load', prova, { once: true });
    });
    loghi(document);

    // 2. Quale film è a metà schermo, quando ci si ferma.
    const sulla = new Set<HTMLElement>();
    let timer = 0;
    const leggi = () => {
      timer = 0;
      // In ordine di pagina vince l'ultimo: un film dentro un atto batte l'atto.
      let trovata: string | null = null;
      document.querySelectorAll<HTMLElement>('[data-luce]').forEach(n => { if (sulla.has(n)) trovata = n.dataset.luce ?? null; });
      if (trovata === null || trovata === scena) return;
      scena = trovata;
      accendi();
    };
    const chiedi = () => { clearTimeout(timer); timer = window.setTimeout(leggi, FERMO); };
    const io = new IntersectionObserver(voci => {
      for (const v of voci) v.isIntersecting ? sulla.add(v.target as HTMLElement) : sulla.delete(v.target as HTMLElement);
      chiedi();
    }, { rootMargin: '-49.5% 0px -49.5% 0px' });
    document.querySelectorAll<HTMLElement>('[data-luce]').forEach(n => io.observe(n));
    addEventListener('scroll', chiedi, { passive: true });

    return () => {
      vivo = false;
      io.disconnect();
      removeEventListener('scroll', chiedi);
      clearTimeout(timer);
      delete html.dataset.scena;
      for (const v of ['--luce', '--luce-ink', '--luce-fondo', '--luce-bagliore']) html.style.removeProperty(v);
      document.querySelectorAll<HTMLElement>('[data-film]').forEach(el => VARIABILI.forEach(v => el.style.removeProperty(v)));
    };
  }, [films]);

  // La luce d'ambiente: dietro tutta la pagina, del colore della scena.
  return <div className="ambiente" aria-hidden />;
}
