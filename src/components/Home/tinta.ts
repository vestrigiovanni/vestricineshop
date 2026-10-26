/**
 * La luce del film: dal fondale di un film, il colore della stanza.
 *
 * È la firma della home (vedi docs/scrollcraft/builds/vestri-sala/BRIEF.md):
 * la pagina è una sala buia e la colora il film che hai davanti. Qui c'è
 * solo la matematica, senza DOM: dai pixel di una miniatura del fondale si
 * ricava una tinta (tono e saturazione, in OKLCH), e dalla tinta i cinque
 * colori che la pagina usa. Un film in bianco e nero dà una tinta senza
 * saturazione, e la stanza resta in bianco e nero.
 */

export interface Tinta {
  /** Tono, in gradi. */
  h: number;
  /** Saturazione OKLCH: 0 è grigio, sopra 0.15 è un colore pieno. */
  c: number;
}

/** I colori della stanza, già in esadecimale (servono anche a `theme-color`). */
export interface Stanza {
  /** Il fondo della pagina: quasi nero, appena tinto. */
  fondo: string;
  /** La luce d'ambiente. */
  bagliore: string;
  /** Il tasto Prenota e i link. */
  accento: string;
  /** Il testo sopra l'accento. */
  accentoInk: string;
  /** Il testo secondario, tinto e mai grigio piatto. */
  inchiostroTenue: string;
}

/** La stanza a luci spente, prima che arrivi un film. */
export const NEUTRA: Tinta = { h: 0, c: 0 };

// ─── Colore ───────────────────────────────────────────────────────────────

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** sRGB (0–255) → OKLab. */
export function oklab(r: number, g: number, b: number): [number, number, number] {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLCH → sRGB lineare, senza tagliare: fuori gamma i valori escono da 0–1. */
function oklchToLinear(L: number, C: number, h: number): [number, number, number] {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = ([r, g, b]: [number, number, number]) => [r, g, b].every(v => v >= -1e-4 && v <= 1 + 1e-4);

/**
 * OKLCH → "#rrggbb". Se il colore non sta nello schermo si toglie
 * saturazione (mai luminosità), così il tono resta quello del film.
 */
export function oklchHex(L: number, C: number, h: number): string {
  let c = C;
  let rgb = oklchToLinear(L, c, h);
  if (!inGamut(rgb)) {
    let lo = 0, hi = C;
    for (let i = 0; i < 18; i++) {
      c = (lo + hi) / 2;
      if (inGamut(oklchToLinear(L, c, h))) lo = c; else hi = c;
    }
    c = lo;
    rgb = oklchToLinear(L, c, h);
  }
  return '#' + rgb.map(v => Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, v))))) * 255).toString(16).padStart(2, '0')).join('');
}

// ─── Dalla miniatura alla tinta ───────────────────────────────────────────

const BINS = 24;

/**
 * La tinta dominante di un'immagine, dai suoi pixel RGBA (come li dà
 * `getImageData`). Conta i pixel colorati e di media luminosità: le ombre e i
 * bianchi bruciati non dicono di che colore è un film. Il tono vincente è
 * quello con più colore addosso, insieme ai due vicini.
 */
export function tintaDa(rgba: ArrayLike<number>): Tinta {
  const peso = new Float64Array(BINS), cos = new Float64Array(BINS), sin = new Float64Array(BINS), croma = new Float64Array(BINS);
  let pixel = 0, cromaTot = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const [L, a, b] = oklab(rgba[i], rgba[i + 1], rgba[i + 2]);
    if (L < 0.15 || L > 0.97) continue;
    const C = Math.hypot(a, b);
    pixel++;
    cromaTot += C;
    const w = C * Math.max(0, 1 - Math.abs(L - 0.62) * 1.2);
    if (w <= 0) continue;
    const h = (Math.atan2(b, a) * 180) / Math.PI;
    const k = Math.floor(((h + 360) % 360) / (360 / BINS)) % BINS;
    peso[k] += w;
    cos[k] += w * Math.cos((h * Math.PI) / 180);
    sin[k] += w * Math.sin((h * Math.PI) / 180);
    croma[k] += w * C;
  }
  // Pochi pixel utili o quasi niente colore: il film è in bianco e nero (o quasi).
  if (pixel < 8 || cromaTot / pixel < 0.022) return NEUTRA;

  let migliore = 0, punteggio = -1;
  for (let k = 0; k < BINS; k++) {
    const p = peso[k] + 0.5 * (peso[(k + 1) % BINS] + peso[(k + BINS - 1) % BINS]);
    if (p > punteggio) { punteggio = p; migliore = k; }
  }
  let W = 0, X = 0, Y = 0, CC = 0;
  for (const k of [migliore - 1, migliore, migliore + 1].map(x => (x + BINS) % BINS)) {
    W += peso[k]; X += cos[k]; Y += sin[k]; CC += croma[k];
  }
  if (W <= 0) return NEUTRA;
  const h = ((Math.atan2(Y, X) * 180) / Math.PI + 360) % 360;
  return { h: Math.round(h * 10) / 10, c: Math.round((CC / W) * 1000) / 1000 };
}

// ─── Dalla tinta alla stanza ──────────────────────────────────────────────

/**
 * I colori della stanza. Le luminosità sono fisse (il contrasto non cambia da
 * un film all'altro: il Prenota resta sempre leggibile), cambiano tono e
 * saturazione. La saturazione è tenuta bassa sul fondo e sul testo, piena
 * solo nella luce d'ambiente.
 */
export function stanzaDa({ h, c }: Tinta): Stanza {
  return {
    fondo: oklchHex(0.165, Math.min(c * 0.28, 0.03), h),
    bagliore: oklchHex(0.56, Math.min(c * 1.05, 0.16), h),
    accento: oklchHex(0.89, Math.min(c * 0.5, 0.085), h),
    accentoInk: oklchHex(0.2, Math.min(c * 0.2, 0.03), h),
    inchiostroTenue: oklchHex(0.77, Math.min(c * 0.16, 0.022), h),
  };
}
