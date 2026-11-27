/**
 * Le misure giuste per ogni posto della proiezione speciale (26 novembre
 * 2026, chieste da Giovanni): accanto a ogni zona della stanza "Speciale" il
 * formato consigliato, e un giudizio sull'immagine caricata (basta per uno
 * schermo grande Retina o si vedrà sgranata?). Parte pura, si prova coi test.
 *
 * Come il sito usa le immagini (src/components/Home/Intermezzi.tsx, Speciale.tsx):
 * - i banner sono mostrati INTERI, a tutta larghezza, con le loro proporzioni:
 *   conta la larghezza, la forma è libera (ma un banner alto ruba lo schermo);
 * - il fotogramma d'apertura e quelli delle citazioni vanno a tutto schermo,
 *   ritagliati al centro: 16:9 è il formato degli schermi;
 * - la locandina e le foto stanno in una griglia, a metà o un terzo di schermo.
 */

export type Posto = 'bannerOrizzontale' | 'bannerVerticale' | 'locandina' | 'foto' | 'fondale' | 'logo';

export interface Rapporto {
  nome: string;
  /** Larghezza / altezza; 0 = libero. */
  r: number;
}

export interface Formato {
  /** Le misure ideali, in pixel. */
  w: number;
  h: number;
  /** Sotto questa larghezza (il lato che conta) sul sito si vede sgranata. */
  minimo: number;
  /** Quale lato conta per il minimo: la larghezza, o il lato lungo (le foto possono essere verticali). */
  lato: 'larghezza' | 'lungo';
  /** Le proporzioni da proporre nel ritaglio, la consigliata per prima. */
  rapporti: Rapporto[];
  nota: string;
}

const LIBERO: Rapporto = { nome: 'Libero', r: 0 };

export const FORMATI: Record<Posto, Formato> = {
  bannerOrizzontale: {
    w: 3840, h: 1600, minimo: 2560, lato: 'larghezza',
    rapporti: [{ nome: '12:5', r: 12 / 5 }, { nome: '2:1', r: 2 }, { nome: '3:1', r: 3 }, { nome: '16:9', r: 16 / 9 }, LIBERO],
    nota: 'Il sito lo mostra intero, a tutta larghezza: la forma è libera, meglio larga (fra 2:1 e 3:1).',
  },
  bannerVerticale: {
    w: 1440, h: 1800, minimo: 1080, lato: 'larghezza',
    rapporti: [{ nome: '4:5', r: 4 / 5 }, { nome: '9:16', r: 9 / 16 }, { nome: '1:1', r: 1 }, LIBERO],
    nota: 'Sul telefono, intero e a tutta larghezza: 4:5 sta in uno schermo, 9:16 lo riempie.',
  },
  locandina: {
    w: 2000, h: 2857, minimo: 1200, lato: 'larghezza',
    rapporti: [{ nome: '70×100', r: 0.7 }, { nome: '2:3', r: 2 / 3 }, LIBERO],
    nota: 'La locandina intera, verticale (70×100).',
  },
  foto: {
    w: 2400, h: 1600, minimo: 1600, lato: 'lungo',
    rapporti: [{ nome: '3:2', r: 3 / 2 }, { nome: '16:9', r: 16 / 9 }, { nome: '4:5', r: 4 / 5 }, LIBERO],
    nota: 'Foto di scena: in griglia, a un terzo dello schermo.',
  },
  fondale: {
    w: 3840, h: 2160, minimo: 2560, lato: 'larghezza',
    rapporti: [{ nome: '16:9', r: 16 / 9 }, { nome: '21:9', r: 21 / 9 }, LIBERO],
    nota: 'A tutto schermo, ritagliato al centro: 16:9 come gli schermi.',
  },
  logo: {
    w: 1200, h: 480, minimo: 600, lato: 'larghezza',
    rapporti: [LIBERO, { nome: '5:2', r: 5 / 2 }],
    nota: 'PNG col fondo trasparente.',
  },
};

/** «3840 × 1600 px» */
export const misure = (w: number, h: number) => `${Math.round(w)} × ${Math.round(h)} px`;

/** Il consiglio da scrivere accanto alla zona. */
export function consiglio(f: Formato): string {
  return `Ideale ${misure(f.w, f.h)}, almeno ${f.minimo} px di ${f.lato === 'larghezza' ? 'larghezza' : 'lato lungo'}.`;
}

export interface Giudizio {
  ok: boolean;
  testo: string;
}

/** L'immagine di queste misure basta per quel posto? */
export function giudizio(w: number, h: number, f: Formato): Giudizio {
  if (!(w > 0 && h > 0)) return { ok: true, testo: '' };
  const conta = f.lato === 'larghezza' ? w : Math.max(w, h);
  if (conta < f.minimo) {
    return { ok: false, testo: `${misure(w, h)}: bassa per questo posto (servono almeno ${f.minimo} px), sul sito si vedrà sgranata.` };
  }
  return { ok: true, testo: `${misure(w, h)}: va bene.` };
}

/**
 * Il riquadro di ritaglio più grande con le proporzioni `r` (0 = tutta
 * l'immagine), centrato, in frazioni dell'immagine (0–1).
 */
export function riquadroIniziale(w: number, h: number, r: number): { x: number; y: number; w: number; h: number } {
  if (!r || !(w > 0 && h > 0)) return { x: 0, y: 0, w: 1, h: 1 };
  const ora = w / h;
  if (ora > r) {
    const fw = r / ora;
    return { x: (1 - fw) / 2, y: 0, w: fw, h: 1 };
  }
  const fh = ora / r;
  return { x: 0, y: (1 - fh) / 2, w: 1, h: fh };
}

/**
 * Il riquadro dopo aver tirato l'angolo in basso a destra fino a (px, py),
 * in frazioni dell'immagine: con proporzioni fisse (`r` sull'immagine di
 * `w`×`h`) l'altezza segue la larghezza; mai fuori dall'immagine, mai più
 * piccolo di un ventesimo.
 */
export function tira(
  box: { x: number; y: number; w: number; h: number }, px: number, py: number, w: number, h: number, r: number,
): { x: number; y: number; w: number; h: number } {
  const min = 0.05;
  let nw = Math.min(Math.max(px - box.x, min), 1 - box.x);
  let nh = Math.min(Math.max(py - box.y, min), 1 - box.y);
  if (r) {
    // In frazioni: altezza = larghezza × (w/h) / r.
    const k = w / h / r;
    nh = nw * k;
    if (box.y + nh > 1) { nh = 1 - box.y; nw = nh / k; }
    if (box.x + nw > 1) { nw = 1 - box.x; nh = nw * k; }
  }
  return { x: box.x, y: box.y, w: nw, h: nh };
}

/** Il riquadro spostato di (dx, dy), senza uscire dall'immagine. */
export function sposta(box: { x: number; y: number; w: number; h: number }, dx: number, dy: number) {
  return {
    ...box,
    x: Math.min(Math.max(box.x + dx, 0), 1 - box.w),
    y: Math.min(Math.max(box.y + dy, 0), 1 - box.h),
  };
}
