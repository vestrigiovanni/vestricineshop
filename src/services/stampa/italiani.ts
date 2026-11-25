/**
 * I distributori italiani (25 novembre 2026, chiesto da Giovanni): nella
 * stanza "Speciale" la casa da mettere accanto a Vestri Cinema è il
 * distributore italiano, cioè chi ha il materiale da chiedere o scaricare,
 * non le case di produzione di TMDB. Qui nome, sito, logo (l'id della casa su
 * TMDB, il logo si legge da lì) e com'è l'area stampa. Parte pura: niente rete.
 *
 * Siti provati il 25/11/2026. `area`:
 * - 'automatica': «Riempi dal distributore» scarica da solo (src/services/stampa/distributori.ts);
 * - 'pagina': il film ha una pagina pubblica, ma il materiale va scaricato a mano o chiesto;
 * - 'login': area stampa con account (giornalisti o esercenti): va chiesto l'accesso.
 */

export type Area = 'automatica' | 'pagina' | 'login';

export interface DistributoreItaliano {
  nome: string;
  /** Come lo scrivono MyMovies, TMDB e i distributori stessi. */
  riconosci: RegExp;
  sito?: string;
  /** L'id della casa su TMDB, per il logo (vuoto se TMDB non ha il logo). */
  tmdb?: number;
  area: Area;
}

export const ITALIANI: DistributoreItaliano[] = [
  { nome: 'I Wonder Pictures', riconosci: /\bi\s*wonder\b/i, sito: 'https://iwonderpictures.com', tmdb: 47815, area: 'automatica' },
  { nome: 'Lucky Red', riconosci: /\blucky\s*red\b/i, sito: 'https://www.luckyred.it', tmdb: 779, area: 'automatica' },
  { nome: 'BIM', riconosci: /\bbim\b/i, sito: 'https://bimfilm.com', tmdb: 225, area: 'automatica' },
  { nome: 'Notorious Pictures', riconosci: /\bnotorious\b/i, sito: 'https://notoriouspictures.it', tmdb: 10529, area: 'automatica' },
  { nome: 'Teodora Film', riconosci: /\bteodora\b/i, sito: 'https://teodorafilm.com', area: 'automatica' },
  { nome: 'Fandango', riconosci: /\bfandango\b/i, sito: 'https://www.fandango.it', tmdb: 2441, area: 'pagina' },
  { nome: 'MUBI', riconosci: /\bmubi\b/i, sito: 'https://mubi.com/it', tmdb: 204957, area: 'pagina' },
  { nome: 'Movies Inspired', riconosci: /\bmovies\s*inspired\b/i, sito: 'https://www.moviesinspired.com', area: 'pagina' },
  { nome: 'Wanted Cinema', riconosci: /\bwanted\b/i, sito: 'https://www.wantedcinema.eu', area: 'pagina' },
  { nome: 'Plaion Pictures', riconosci: /\bplaion\b/i, sito: 'https://plaionpictures.com', tmdb: 195247, area: 'pagina' },
  { nome: 'Cineteca di Bologna', riconosci: /\bcineteca\s+di\s+bologna\b/i, sito: 'https://cinetecadibologna.it', area: 'pagina' },
  { nome: 'Europictures', riconosci: /\beuropictures\b/i, sito: 'https://www.europictures.it', area: 'automatica' },
  { nome: 'Nexo Studios', riconosci: /\bnexo\b/i, sito: 'https://www.nexostudios.it', tmdb: 41020, area: 'pagina' },
  { nome: 'Universal Pictures', riconosci: /\buniversal\b|\buip\b/i, sito: 'https://www.universalpictures.it', tmdb: 33, area: 'login' },
  { nome: 'Warner Bros.', riconosci: /\bwarner\b/i, sito: 'https://www.warnerbros.it', tmdb: 17, area: 'login' },
  { nome: 'Walt Disney', riconosci: /\bdisney\b/i, sito: 'https://www.disney.it', tmdb: 2, area: 'login' },
  { nome: 'Sony Pictures', riconosci: /\bsony\b/i, sito: 'https://www.sonypictures.it', tmdb: 34, area: 'login' },
  { nome: 'Paramount', riconosci: /\bparamount\b/i, tmdb: 4, area: 'login' },
  { nome: 'Eagle Pictures', riconosci: /\beagle\b/i, sito: 'https://www.eaglepictures.com', area: 'login' },
  { nome: '01 Distribution', riconosci: /\b01\s*distribution\b/i, sito: 'https://www.01distribution.it', area: 'login' },
  { nome: 'Vision Distribution', riconosci: /\bvision\s+distribution\b/i, sito: 'https://www.visiondistribution.it', tmdb: 115535, area: 'login' },
  { nome: 'Medusa Film', riconosci: /\bmedusa\b/i, sito: 'https://www.medusa.it', tmdb: 6246, area: 'login' },
];

/** Il distributore italiano dal nome com'è scritto altrove («Bim Distribuzione», «Warner Bros Italia»). */
export function distributoreItaliano(nome: string | null | undefined): DistributoreItaliano | null {
  const n = (nome ?? '').trim();
  if (!n) return null;
  return ITALIANI.find(d => d.riconosci.test(n)) ?? null;
}

/** Cosa dire a Giovanni sull'area stampa di un distributore. */
export function notaArea(area: Area | undefined): string {
  if (area === 'automatica') return 'Area stampa pubblica: «Riempi dal distributore» prende banner, locandina e foto.';
  if (area === 'pagina') return 'Il materiale non si scarica da solo: guarda la pagina del film o scrivi all’ufficio stampa.';
  if (area === 'login') return 'Area stampa con login (giornalisti o esercenti): va chiesto l’accesso.';
  return 'Distributore che non conosco ancora: cerca la pagina del film sul suo sito.';
}

/** Dove MyMovies scrive il distributore: «Distribuito da <a …>Nome</a>». */
export function distribuitoDa(html: string): string | null {
  const m = html.match(/distribuito da\s*<a[^>]*>\s*([^<]+?)\s*<\/a>/i);
  return m ? m[1].replace(/&amp;/g, '&').trim() : null;
}
