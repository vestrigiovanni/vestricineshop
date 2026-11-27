/**
 * Le scelte fatte sui dati di TMDB, dalla v1 (`services/tmdb.ts`,
 * `tmdb.utils.ts`, `utils/ratingUtils.ts`): quale logo, quale fondale, che
 * divieto, quali trailer prima. Funzioni pure, testate in `scelte.test.ts`;
 * le chiamate vere sono in `leggi.ts`.
 */

export interface Immagine {
  file_path: string;
  iso_639_1: string | null;
  width?: number;
  vote_average?: number;
  vote_count?: number;
}

export interface Video {
  key: string;
  name?: string;
  site?: string;
  type?: string;
  official?: boolean;
  iso_639_1?: string;
}

export interface Uscite {
  results?: { iso_3166_1: string; release_dates: { certification: string; type?: number }[] }[];
}

/** Il film come lo racconta TMDB, già scelto e ripulito. */
export interface FilmTmdb {
  tmdbId: string;
  titolo: string;
  titoloOriginale: string;
  linguaOriginale: string;
  trama: string;
  motto: string;
  locandina: string;
  fondale: string;
  logo: string;
  fondaliExtra: string[];
  generi: string[];
  voto: number | null;
  divieto: string;
  uscita: string;
  durata: number | null;
  regia: string[];
  cast: string[];
  trailer: string[];
}

/** Ci sono lettere non latine (arabo, cirillico, ideogrammi…)? */
export function nonLatino(testo: string | null | undefined): boolean {
  if (!testo) return false;
  return /[^\p{sc=Latn}\p{sc=Zyyy}\p{P}]/u.test(testo);
}

/**
 * Il logo: in italiano, poi in inglese, poi nella lingua originale. Se non c'è
 * in nessuna delle tre, niente logo e la Home scrive il titolo (regola di Gio,
 * 25/11/2026: un film francese non mostra il logo russo).
 */
export function sceltaLogo(loghi: Immagine[] = [], linguaOriginale?: string): string {
  for (const lingua of ['it', 'en', linguaOriginale]) {
    if (!lingua) continue;
    const l = loghi.find(x => x.iso_639_1 === lingua);
    if (l) return l.file_path;
  }
  return '';
}

const perVoto = (a: Immagine, b: Immagine) =>
  (b.vote_average || 0) - (a.vote_average || 0) || (b.vote_count || 0) - (a.vote_count || 0);

/**
 * Il fondale: senza scritte, almeno in Full HD, il più votato; fra quelli
 * buoni se ne prende uno fisso per film (`id % quanti`), così non cambia a
 * ogni lettura. Se non ce n'è nessuno, quello principale di TMDB.
 */
export function sceltaFondale(fondali: Immagine[] = [], principale: string | null | undefined, tmdbId: string): string {
  if (!fondali.length) return principale || '';
  const senzaLingua = fondali.filter(b => !b.iso_639_1);
  const base = senzaLingua.length ? senzaLingua : fondali;
  const hd = base.filter(b => (b.width ?? 0) >= 1920).sort(perVoto);
  const pool = hd.length ? hd : base;
  return pool[(Number(tmdbId) || 0) % pool.length]?.file_path || principale || '';
}

/** I fondali in più per la Home: niente doppioni né il principale, prima quelli senza scritte. */
export function fondaliExtra(fondali: Immagine[] = [], principale: string | null | undefined, max = 3): string[] {
  const visti = new Set<string>();
  const candidati = fondali.filter(b => {
    if (!b.file_path || b.file_path === principale || visti.has(b.file_path)) return false;
    visti.add(b.file_path);
    return true;
  });
  const senza = candidati.filter(b => !b.iso_639_1).sort(perVoto);
  const con = candidati.filter(b => b.iso_639_1).sort(perVoto);
  return [...senza, ...con].slice(0, max).map(b => b.file_path);
}

export interface FonteMotto {
  tagline?: string | null;
  original_language?: string | null;
  translations?: { translations?: { iso_639_1?: string; data?: { tagline?: string | null } }[] } | null;
}

/** Il motto: in italiano, se no nella lingua originale (se si scrive in latino), se no in inglese. */
export function sceltaMotto(d: FonteMotto | null | undefined): string {
  if (!d) return '';
  const pulito = (t?: string | null) => (t || '').trim();
  if (pulito(d.tagline)) return pulito(d.tagline);
  const tradotto = (lingua: string) =>
    (d.translations?.translations || []).map(t => (t.iso_639_1 === lingua ? pulito(t.data?.tagline) : '')).find(Boolean) || '';
  const originale = d.original_language ? tradotto(d.original_language) : '';
  if (originale && !nonLatino(originale)) return originale;
  return tradotto('en');
}

// ─── Il divieto ───────────────────────────────────────────────────────────

/** Da un codice qualsiasi ai livelli italiani: T, 6+, 10+, 14+, 18+ (`normalizeRating` della v1). */
export function normalizzaDivieto(raw: string | null | undefined): string {
  if (!raw) return 'T';
  const c = raw.toUpperCase().replace(/[\s.]/g, '').replace(/^VM/, '');
  if (['T', 'PT', 'G', 'U', '0', 'APPROVED', 'PASSED'].includes(c)) return 'T';
  if (['6', '6+', 'PG', 'TV-PG'].includes(c)) return '6+';
  if (['10', '10+', '12', '12A'].includes(c)) return '10+';
  if (['14', '14+', 'PG13', 'PG-13', 'TV-14', '15', 'R'].includes(c)) return '14+';
  if (['18', '18+', 'NC17', 'NC-17', 'TV-MA', '16', 'X'].includes(c)) return '18+';
  const n = parseInt(c.replace(/\D/g, ''), 10);
  if (Number.isFinite(n)) return n >= 18 ? '18+' : n >= 14 ? '14+' : n >= 10 ? '10+' : n >= 6 ? '6+' : 'T';
  return 'T';
}

function daEstero(paese: string, cert: string): string {
  const c = cert.toUpperCase().replace(/[\s.\-]/g, '');
  const tavole: Record<string, Record<string, string>> = {
    US: { G: 'T', PG: '6+', PG13: '14+', R: '14+', NC17: '18+', X: '18+' },
    GB: { U: 'T', PG: '6+', '12': '10+', '12A': '10+', '15': '14+', '18': '18+' },
    FR: { U: 'T', '10': '10+', '12': '10+', '16': '18+', '18': '18+' },
  };
  return tavole[paese]?.[c] ?? normalizzaDivieto(c);
}

/**
 * Il divieto in Italia, a cascata come nella v1: l'Italia (prima l'uscita in
 * sala), poi i vicini europei (AT, DE, CH, GB), poi un divieto alto in
 * qualunque paese, poi Stati Uniti, Gran Bretagna, Francia. Horror e thriller
 * senza dati non sono mai per tutti; un documentario sì, se non è vietato ai 18.
 */
export function sceltaDivieto(uscite: Uscite | undefined, generi: { id?: number; name: string }[] = []): string {
  const r = uscite?.results ?? [];
  const doc = generi.some(g => g.id === 99 || /documentar/i.test(g.name));
  const fine = (d: string) => (doc && d !== '18+' ? 'T' : d);
  const pulito = (c: string) => c.toUpperCase().replace(/[\s.\-+]/g, '');

  const it = r.find(x => x.iso_3166_1 === 'IT');
  if (it?.release_dates.length) {
    const sala = it.release_dates.find(d => d.type === 3) ?? it.release_dates[0];
    if (sala.certification?.trim()) return normalizzaDivieto(sala.certification);
  }

  for (const paese of ['AT', 'DE', 'CH', 'GB']) {
    const c = pulito(r.find(x => x.iso_3166_1 === paese)?.release_dates[0]?.certification ?? '');
    if (['12', '14', '15'].includes(c)) return fine('14+');
    if (['6', '9'].includes(c)) return fine('10+');
  }

  for (const x of r) for (const d of x.release_dates) {
    if (['18', '19', '21', 'III', 'C', 'NC17', 'X', '16', '15'].includes(pulito(d.certification))) return '18+';
  }

  for (const paese of ['US', 'GB', 'FR']) {
    const c = r.find(x => x.iso_3166_1 === paese)?.release_dates[0]?.certification;
    if (c?.trim()) return fine(daEstero(paese, c));
  }

  if (generi.some(g => /horror|thriller/i.test(g.name))) return '14+';
  return 'T';
}

// ─── I trailer ────────────────────────────────────────────────────────────

/** Lingue in caratteri non latini: lì il trailer parlato straniava, meglio quello italiano. */
const LONTANE = new Set(['ja', 'zh', 'cn', 'ko', 'ar', 'ru', 'hi', 'th', 'he', 'iw', 'fa', 'el', 'uk', 'bg', 'sr', 'mk', 'be', 'ka', 'hy', 'am', 'ti', 'bn', 'ta', 'te', 'ml', 'kn', 'pa', 'ur', 'my', 'km', 'lo', 'si', 'ne', 'mn', 'ps', 'dv', 'yi', 'bo', 'ug', 'ky', 'tg', 'kk']);

const TIPI_VIDEO = ['Trailer', 'Teaser', 'Clip', 'Featurette', 'Behind the Scenes'];

/**
 * I trailer YouTube in ordine, fino a 12 (la Home tiene gli altri di scorta se
 * YouTube rifiuta il primo). Prima i trailer, poi i teaser; poi la lingua:
 * film italiano o in lingua «lontana» → italiano, inglese, originale;
 * altrimenti → originale, inglese, italiano.
 */
export function ordineTrailer(video: Video[], linguaOriginale?: string): string[] {
  const italiano = !linguaOriginale || linguaOriginale === 'it' || LONTANE.has(linguaOriginale);
  const punti = (v: Video) => {
    let p = v.type === 'Trailer' ? 1000 : v.type === 'Teaser' ? 500 : 0;
    if (v.official) p += 50;
    const l = v.iso_639_1;
    if (italiano) p += l === 'it' ? 200 : l === 'en' ? 100 : l === linguaOriginale ? 50 : 0;
    else p += l === linguaOriginale ? 200 : l === 'en' ? 100 : l === 'it' ? 50 : 0;
    return p;
  };
  const buoni = video.filter(v => v.site === 'YouTube' && v.key && TIPI_VIDEO.includes(v.type ?? ''));
  const ordinati = buoni.map(v => ({ k: v.key, p: punti(v) })).sort((a, b) => b.p - a.p).map(x => x.k);
  return [...new Set(ordinati)].slice(0, 12);
}

// ─── Lingua e sottotitoli ─────────────────────────────────────────────────

/** Come la v1 scrive la lingua della versione (`constants/languages.ts`). */
export const LINGUE: Record<string, string> = {
  it: 'ITALIANO', en: 'INGLESE', fr: 'FRANCESE', es: 'SPAGNOLO', de: 'TEDESCO', ja: 'GIAPPONESE', ko: 'COREANO',
  zh: 'CINESE', pt: 'PORTOGHESE', ru: 'RUSSO', hi: 'INDIANO', ar: 'ARABO', tr: 'TURCO', nl: 'OLANDESE', sv: 'SVEDESE',
  no: 'NORVEGESE', da: 'DANESE', fi: 'FINLANDESE', pl: 'POLACCO', hu: 'UNGHERESE', cs: 'CECO', el: 'GRECO',
  th: 'TAILANDESE', vi: 'VIETNAMITA', id: 'INDONESIANO',
};

export const SOTTOTITOLI = ['NESSUNO', 'ITA', 'ENG', 'FRA', 'SPA', 'GER'];

export function linguaVersione(codice: string | null | undefined): string {
  if (!codice) return 'ITALIANO';
  return LINGUE[codice.toLowerCase()] ?? codice.toUpperCase();
}
