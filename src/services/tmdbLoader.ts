'use client';

import type { ImageLoader } from 'next/image';

/**
 * Il caricatore di tutte le immagini del sito (next.config.ts → loaderFile).
 * Nessuna passa più dall'ottimizzazione di Vercel: il piano gratuito ha 5.000
 * "trasformazioni" al mese, e il 26 novembre 2026 erano finite. Da lì in poi
 * ogni `/_next/image` non ancora in cache rispondeva 402 e l'immagine restava nera.
 *
 * - TMDB: si sceglie la misura TMDB più piccola che basta per la larghezza
 *   chiesta dal browser, senza mai superare quella scritta nell'indirizzo (un
 *   `w500` resta al massimo `w500`; un `original` scende a `w1280` sui
 *   telefoni). Tutte queste misure valgono per locandine, fondali e loghi (provato).
 * - Le immagini caricate dal gestionale (`/api/speciale/immagine/<id>`): le
 *   riduce il sito stesso con sharp (`?w=`), e la CDN le tiene un anno.
 * - Il resto (logo, loghi dei festival, file in `public/`) va com'è: sono file
 *   già della misura giusta.
 */
const MISURE = [92, 154, 185, 300, 342, 500, 780, 1280];
const TMDB = /^https:\/\/image\.tmdb\.org\/t\/p\/([a-z0-9]+)(\/.+)$/;
const CARICATA = /^\/api\/speciale\/immagine\/[^/?]+$/;

export const tmdbLoader: ImageLoader = ({ src, width }) => {
  if (CARICATA.test(src)) return `${src}?w=${width}`;
  const m = src.match(TMDB);
  if (!m) return src;
  const [, taglia, path] = m;
  const tetto = taglia === 'original' ? Infinity : Number(taglia.slice(1)) || Infinity;
  const misura = MISURE.find(w => w >= width);
  const scelta = misura && misura <= tetto ? `w${misura}` : taglia;
  return `https://image.tmdb.org/t/p/${scelta}${path}`;
};

export default tmdbLoader;
