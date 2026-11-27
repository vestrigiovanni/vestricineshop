import {
  fondaliExtra, nonLatino, ordineTrailer, sceltaDivieto, sceltaFondale, sceltaLogo, sceltaMotto,
  type FilmTmdb, type Immagine, type Uscite, type Video,
} from './scelte';

/**
 * Le chiamate a TMDB. Solo dal server: la chiave (`TMDB_API_KEY`) non va mai
 * nel browser (nella v1 era scritta nel codice e finiva nel biglietto).
 * Le risposte restano in cache un'ora; `fresco` le rilegge da capo.
 */
const BASE = 'https://api.themoviedb.org/3';

async function chiedi<T>(percorso: string, parametri: Record<string, string> = {}, fresco = false): Promise<T | null> {
  const chiave = process.env.TMDB_API_KEY;
  if (!chiave) throw new Error('Manca TMDB_API_KEY fra le variabili del sito.');
  const url = new URL(BASE + percorso);
  url.searchParams.set('api_key', chiave);
  for (const [k, v] of Object.entries(parametri)) url.searchParams.set(k, v);
  const res = await fetch(url, fresco ? { cache: 'no-store' } : { next: { revalidate: 3600 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TMDB ha risposto ${res.status}`);
  return (await res.json()) as T;
}

interface Persona { name: string; job?: string }
interface Genere { id: number; name: string }

interface Dettagli {
  id: number;
  title?: string;
  original_title?: string;
  original_language?: string;
  overview?: string;
  tagline?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  runtime?: number | null;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  genres?: Genere[];
  credits?: { cast?: Persona[]; crew?: Persona[] };
  images?: { logos?: Immagine[]; backdrops?: Immagine[]; posters?: Immagine[] };
  release_dates?: Uscite;
  translations?: { translations?: { iso_639_1?: string; data?: { tagline?: string | null; title?: string; overview?: string } }[] };
}

/** I dati di base di un film, quelli che servono al catalogo. */
export interface Base {
  tmdbId: string;
  titolo: string;
  titoloOriginale: string | null;
  linguaOriginale: string | null;
  trama: string | null;
  locandina: string | null;
  fondale: string | null;
  uscita: string;
  anno: number | null;
  durata: number | null;
  generi: string[];
  regia: string[];
  voto: number | null;
  voti: number | null;
  popolarita: number | null;
}

const annoDi = (data?: string) => {
  const a = parseInt((data || '').slice(0, 4), 10);
  return Number.isFinite(a) ? a : null;
};

function base(d: Dettagli): Base {
  return {
    tmdbId: String(d.id),
    titolo: d.title || d.original_title || `TMDB ${d.id}`,
    titoloOriginale: d.original_title || null,
    linguaOriginale: d.original_language || null,
    trama: d.overview || null,
    locandina: d.poster_path || null,
    fondale: d.backdrop_path || null,
    uscita: d.release_date || '',
    anno: annoDi(d.release_date),
    durata: d.runtime || null,
    generi: (d.genres ?? []).map(g => g.name).filter(Boolean),
    regia: (d.credits?.crew ?? []).filter(p => p.job === 'Director').map(p => p.name),
    voto: typeof d.vote_average === 'number' ? d.vote_average : null,
    voti: typeof d.vote_count === 'number' ? d.vote_count : null,
    popolarita: typeof d.popularity === 'number' ? d.popularity : null,
  };
}

/** Titolo, anno, regia, generi: una chiamata sola. `null` se TMDB non conosce l'id. */
export async function dettagli(tmdbId: string, fresco = false): Promise<Base | null> {
  if (!/^\d+$/.test(tmdbId)) return null;
  const d = await chiedi<Dettagli>(`/movie/${tmdbId}`, { language: 'it-IT', append_to_response: 'credits' }, fresco);
  return d ? base(d) : null;
}

/**
 * Il film completo, come lo vuole la scheda: titolo e trama in italiano (se
 * mancano o non sono in caratteri latini, in inglese), logo, fondale, divieto,
 * trailer in ordine, regia e i primi cinque del cast.
 */
export async function filmTmdb(tmdbId: string, fresco = false): Promise<FilmTmdb | null> {
  if (!/^\d+$/.test(tmdbId)) return null;
  const d = await chiedi<Dettagli>(`/movie/${tmdbId}`, {
    language: 'it-IT',
    append_to_response: 'credits,images,release_dates,translations',
    include_image_language: 'it,en,null',
  }, fresco);
  if (!d) return null;
  const orig = d.original_language || '';

  const serveInglese = nonLatino(d.title) || !d.overview?.trim();
  const serveLoghi = !(d.images?.logos ?? []).some(l => l.iso_639_1 === 'it' || l.iso_639_1 === 'en');
  const lingueVideo = ['it-IT', 'en-US', ...(orig && orig !== 'it' && orig !== 'en' ? [orig] : [])];

  const [en, tuttiLoghi, ...video] = await Promise.all([
    serveInglese ? chiedi<Dettagli>(`/movie/${tmdbId}`, { language: 'en-US' }, fresco).catch(() => null) : null,
    serveLoghi ? chiedi<{ logos?: Immagine[] }>(`/movie/${tmdbId}/images`, {}, fresco).catch(() => null) : null,
    ...lingueVideo.map(l => chiedi<{ results?: Video[] }>(`/movie/${tmdbId}/videos`, { language: l }, fresco).catch(() => null)),
  ]);

  const titolo = nonLatino(d.title) && en?.title && !nonLatino(en.title) ? en.title : d.title || d.original_title || '';
  const fondale = sceltaFondale(d.images?.backdrops, d.backdrop_path, tmdbId);
  const b = base(d);

  return {
    tmdbId,
    titolo,
    titoloOriginale: d.original_title || '',
    linguaOriginale: orig,
    trama: d.overview?.trim() || en?.overview?.trim() || '',
    motto: sceltaMotto(d) || en?.tagline?.trim() || '',
    locandina: d.poster_path || '',
    fondale,
    logo: sceltaLogo([...(d.images?.logos ?? []), ...(tuttiLoghi?.logos ?? [])], orig),
    fondaliExtra: fondaliExtra(d.images?.backdrops, fondale),
    generi: b.generi,
    voto: b.voto || null,
    divieto: sceltaDivieto(d.release_dates, d.genres),
    uscita: b.uscita,
    durata: b.durata,
    regia: b.regia,
    cast: (d.credits?.cast ?? []).slice(0, 5).map(p => p.name),
    trailer: ordineTrailer(video.flatMap(v => v?.results ?? []), orig),
  };
}

export interface Trovato {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
}

/**
 * Cerca per titolo (in italiano). Se si scrive un numero è anche un id: si
 * cercano tutte e due le cose, perché «1917» e «2046» sono anche titoli.
 */
export async function cercaTmdb(testo: string): Promise<Trovato[]> {
  const q = testo.trim();
  if (!q) return [];
  const [perId, perTitolo] = await Promise.all([
    /^\d+$/.test(q) ? dettagli(q).catch(() => null) : null,
    chiedi<{ results?: Trovato[] }>('/search/movie', { query: q, language: 'it-IT', include_adult: 'false' }),
  ]);
  const titoli = (perTitolo?.results ?? []).filter(t => String(t.id) !== q);
  const id = perId ? [{ id: Number(perId.tmdbId), title: perId.titolo, release_date: perId.uscita, poster_path: perId.locandina }] : [];
  return [...titoli.slice(0, 1), ...id, ...titoli.slice(1)].slice(0, 20);
}

/** I candidati per abbinare un titolo del catalogo, con la regia di ciascuno. */
export async function candidati(titolo: string, anno: number | null) {
  const trovati = (await chiedi<{ results?: Trovato[] }>('/search/movie', { query: titolo, language: 'it-IT', include_adult: 'false' }))?.results ?? [];
  const vicini = trovati.filter(c => anno == null || Math.abs((annoDi(c.release_date) ?? 0) - anno) <= 1);
  const scelti = (vicini.length ? vicini : trovati).slice(0, 4);
  return Promise.all(scelti.map(async c => ({ trovato: c, base: await dettagli(String(c.id)).catch(() => null) })));
}

export interface Media {
  locandine: Immagine[];
  fondali: Immagine[];
  loghi: Immagine[];
  video: { it: Video[]; en: Video[] };
}

/** Tutte le immagini e i trailer di un film, per sceglierli a mano. */
export async function mediaTmdb(tmdbId: string): Promise<Media> {
  const [imm, it, en] = await Promise.all([
    chiedi<{ posters?: Immagine[]; backdrops?: Immagine[]; logos?: Immagine[] }>(`/movie/${tmdbId}/images`),
    chiedi<{ results?: Video[] }>(`/movie/${tmdbId}/videos`, { language: 'it-IT' }),
    chiedi<{ results?: Video[] }>(`/movie/${tmdbId}/videos`, { language: 'en-US' }),
  ]);
  const yt = (v: Video[] = []) => v.filter(x => x.site === 'YouTube' && x.key);
  return {
    locandine: imm?.posters ?? [],
    fondali: imm?.backdrops ?? [],
    loghi: imm?.logos ?? [],
    video: { it: yt(it?.results), en: yt(en?.results) },
  };
}

// ─── Le risposte di TMDB così come sono ───────────────────────────────────
// Per `/api/planning/tmdb`: l'app iOS legge i campi di TMDB, come nella v1.

/** I risultati della ricerca, senza i titoli in caratteri non latini. */
export async function cercaGrezza(testo: string): Promise<Record<string, unknown>[]> {
  const d = await chiedi<{ results?: Record<string, unknown>[] }>('/search/movie', { query: testo, language: 'it-IT', page: '1' });
  return (d?.results ?? []).filter(r => !nonLatino(typeof r.title === 'string' ? r.title : ''));
}

/** I dettagli di un film con i crediti, come li dà TMDB. */
export function dettagliGrezzi(tmdbId: string): Promise<Record<string, unknown> | null> {
  if (!/^\d+$/.test(tmdbId)) return Promise.resolve(null);
  return chiedi<Record<string, unknown>>(`/movie/${tmdbId}`, { language: 'it-IT', append_to_response: 'credits,images,release_dates', include_image_language: 'it,en,null' });
}
