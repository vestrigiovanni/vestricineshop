import { img } from '../home/pezzi';

/**
 * Le immagini della proiezione speciale arrivano da tre posti: TMDB
 * ("/abc.jpg"), il materiale del distributore in `public/speciali`, o caricate
 * dal gestionale e servite da `/api/speciale/immagine/<id>` (che le riduce col
 * `?w=`, al posto dell'ottimizzatore di Vercel).
 */
const locale = (src: string) => src.startsWith('/speciali/') || src.startsWith('/api/') || src.startsWith('/loghi/');

export function immagine(src: string | null | undefined, tmdb = 'w1280'): string {
  if (!src) return '';
  return locale(src) ? src : img(src, tmdb);
}

/** Le misure fra cui sceglie il browser, per i fotogrammi a tutto schermo. */
export function misure(src: string | null | undefined): string | undefined {
  if (!src) return undefined;
  if (src.startsWith('/api/speciale/immagine/')) return [828, 1200, 1920].map(w => `${src}?w=${w} ${w}w`).join(', ');
  if (locale(src)) return undefined;
  return `${img(src, 'w780')} 780w, ${img(src, 'w1280')} 1280w, ${img(src, 'original')} 2560w`;
}
