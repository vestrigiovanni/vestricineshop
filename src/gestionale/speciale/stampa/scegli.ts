/**
 * Il materiale stampa dei distributori, parte pura (25 novembre 2026, chiesta
 * da Giovanni per riempire da sola la stanza "Speciale"): riconoscere la pagina
 * di un film fra quelle di un distributore, e scegliere fra i file trovati il
 * banner orizzontale, quello verticale, la locandina e le foto di scena.
 *
 * Niente rete qui: la usa `distributori.ts`, questo si prova coi test.
 */

/** Minuscolo, senza accenti, parole separate da un trattino: come gli slug di WordPress. */
export function slug(t: string | null | undefined): string {
  return (t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Il cognome di un regista, per riconoscerlo dentro uno slug. */
export function cognome(nome: string): string {
  const parti = slug(nome).split('-').filter(Boolean);
  return parti[parti.length - 1] ?? '';
}

export interface Chi {
  /** Titolo italiano, originale, alternativi: tutti quelli che TMDB conosce. */
  titoli: string[];
  regia: string[];
}

/**
 * Quanto lo slug di una pagina somiglia al film. 0 = non è lui.
 *
 * - 3: lo slug è il titolo, oppure inizia col titolo e contiene il cognome del regista;
 * - 2: inizia col titolo seguito da "-di-" (I Wonder scrive "titolo-di-regista");
 * - 1: inizia col titolo seguito da altro, solo per titoli di almeno due parole.
 *
 * Il titolo lungo vince sul corto: «it» non deve agganciare «it-ends».
 */
export function punteggio(pagina: string, chi: Chi): number {
  const s = slug(pagina);
  if (!s) return 0;
  const cognomi = chi.regia.map(cognome).filter(c => c.length > 2);
  const conRegista = cognomi.some(c => s.split('-').includes(c));
  let meglio = 0;
  for (const t of chi.titoli.map(slug).filter(Boolean)) {
    let p = 0;
    if (s === t) p = 3;
    else if (s.startsWith(`${t}-`)) {
      const resto = s.slice(t.length + 1);
      if (conRegista) p = 3;
      else if (resto.startsWith('di-')) p = 2;
      else if (t.includes('-') && !/^\d/.test(resto)) p = 1;
    }
    meglio = Math.max(meglio, p);
  }
  return meglio;
}

/** La pagina più somigliante fra tante, o null se nessuna lo è abbastanza (o due pari). */
export function laPagina<T extends { slug: string }>(pagine: T[], chi: Chi): T | null {
  let migliore: T | null = null, top = 0, pari = false;
  for (const p of pagine) {
    const v = punteggio(p.slug, chi);
    if (v > top) { migliore = p; top = v; pari = false; }
    else if (v === top && v > 0 && migliore?.slug !== p.slug) pari = true;
  }
  return top > 0 && !pari ? migliore : null;
}

// ─── La scelta fra i file ───────────────────────────────────────────────

export interface File {
  /** Il percorso com'è scritto: etichetta del link, cartelle, nome nello zip. */
  percorso: string;
  /** Le misure, se si conoscono (dal nome o dall'immagine). */
  w?: number;
  h?: number;
}

/** Le misure scritte nel nome, tipo `IWP_YCSE_1920x1080.jpg` o `poster_70x100`. */
export function misureDalNome(nome: string): { w: number; h: number } | null {
  const m = nome.match(/(?:^|[^0-9])(\d{3,4})\s*[x×X]\s*(\d{3,4})(?![0-9])/);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}

export const eImmagine = (p: string) => /\.(jpe?g|png|webp)$/i.test(p);
/** Drive mostra a volte il nome senza estensione: si scopre scaricando. */
const senzaEstensione = (p: string) => !/\.[a-z0-9]{2,4}$/i.test(p.split('/').pop() ?? p);

const BANNER = /banner|fbcover|cover|header|leaderboard|skin/i;
const LOCANDINA = /poster|locandina|affiche|one.?sheet|1sht|key.?art/i;
const FOTO = /foto|photo|still|scena|scene|immagini|gallery/i;
/** Formati di locandina che non sono la locandina "web" verticale. */
const NON_WEB = /quad|ig_|instagram|feed|social|story|stories|esec|stampa|print|banner|teaser/i;
const ALTRO = /logo|credit|caption|pressbook|scheda|dcp|font|\.pdf$/i;

const rapporto = (f: File) => (f.w && f.h ? f.w / f.h : null);

/**
 * I banner: l'orizzontale più largo fra quelli 16:9 circa (da 1,55 a 2,1), il
 * verticale più alto fra quelli 9:16 circa (da 0,45 a 0,65). I banner sottili
 * da sito (728×90, 960×100) non servono: sul sito le date ci devono stare sopra.
 */
export function iBanner<T extends File>(files: T[]): { orizzontale?: T; verticale?: T } {
  const banner = files.filter(f => BANNER.test(f.percorso) && !ALTRO.test(f.percorso) && f.w && f.h);
  const largo = (a: T, b: T) => (b.w! * b.h!) - (a.w! * a.h!);
  const orizzontale = banner.filter(f => { const r = rapporto(f)!; return r >= 1.55 && r <= 2.1 && f.w! >= 1000; }).sort(largo)[0];
  const verticale = banner.filter(f => { const r = rapporto(f)!; return r >= 0.45 && r <= 0.65 && f.h! >= 1000; }).sort(largo)[0];
  return { orizzontale, verticale };
}

/**
 * La locandina: un'immagine verticale col nome da locandina. Prima quella
 * "web" (I Wonder: «Poster web»), poi una qualunque che non sia quad, social o
 * da stampa. Senza misure si accetta lo stesso: chi scarica controlla dopo.
 */
export function laLocandina<T extends File>(files: T[]): T | undefined {
  const cand = files
    .filter(f => LOCANDINA.test(f.percorso) && (eImmagine(f.percorso) || senzaEstensione(f.percorso)) && !ALTRO.test(f.percorso))
    .filter(f => { const r = rapporto(f); return r == null || r < 0.95; });
  const web = cand.filter(f => /web/i.test(f.percorso) && !NON_WEB.test(f.percorso.replace(/web/ig, '')));
  return web[0] ?? cand.find(f => !NON_WEB.test(f.percorso)) ?? cand[0];
}

/**
 * Le foto di scena: le immagini sotto "foto" (cartella, zip o etichetta), o
 * quelle senza nome da banner o locandina. Al massimo `quante`.
 */
export function leFoto<T extends File>(files: T[], quante = 12): T[] {
  const imm = files.filter(f => eImmagine(f.percorso) || senzaEstensione(f.percorso));
  const libere = imm.filter(f => !BANNER.test(f.percorso) && !LOCANDINA.test(f.percorso) && !ALTRO.test(f.percorso));
  const sottoFoto = libere.filter(f => FOTO.test(f.percorso));
  return (sottoFoto.length ? sottoFoto : libere).slice(0, quante);
}

/** Il trailer verticale (9:16) fra i link: solo l'indirizzo, il video va ridotto a mano. */
export function trailerVerticale<T extends { etichetta: string; url: string }>(voci: T[]): T | undefined {
  return voci.find(v => /trailer|teaser/i.test(v.etichetta) && /vertical|9\s*:\s*16|916/i.test(`${v.etichetta} ${v.url}`) && !/dcp/i.test(v.etichetta));
}
