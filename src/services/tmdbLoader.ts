import type { ImageLoader } from 'next/image';

/**
 * Le immagini di TMDB non passano dall'ottimizzazione di Vercel: TMDB le
 * ridimensiona già da sé, su una CDN con un anno di cache. Ogni immagine che
 * passava da `/_next/image` era una "trasformazione" a pagamento, e il piano
 * gratuito (5.000 al mese) è finito il 26 novembre 2026.
 *
 * Qui si sceglie la misura TMDB più piccola che basta per la larghezza chiesta
 * dal browser, senza mai superare quella scritta nell'indirizzo (un `w500` resta
 * al massimo `w500`; un `original` può scendere a `w1280` sui telefoni).
 * Tutte queste misure valgono per locandine, fondali e loghi (provato).
 *
 * Le altre immagini (i file del sito, quelle caricate dal gestionale) restano
 * all'ottimizzazione di Next, come prima.
 */
const MISURE = [92, 154, 185, 300, 342, 500, 780, 1280];
const TMDB = /^https:\/\/image\.tmdb\.org\/t\/p\/([a-z0-9]+)(\/.+)$/;

export const tmdbLoader: ImageLoader = ({ src, width, quality }) => {
  const m = src.match(TMDB);
  if (!m) return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality ?? 75}`;
  const [, taglia, path] = m;
  const tetto = taglia === 'original' ? Infinity : Number(taglia.slice(1)) || Infinity;
  const misura = MISURE.find(w => w >= width);
  const scelta = misura && misura <= tetto ? `w${misura}` : taglia;
  return `https://image.tmdb.org/t/p/${scelta}${path}`;
};
