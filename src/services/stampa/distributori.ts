import { unzipSync } from 'fflate';
import { laPagina, slug, type Chi } from './scegli';
import { retePersa, rispostaSito, Spiegato } from '../esito';

/**
 * Dove i distributori italiani mettono il materiale stampa, e come leggerlo
 * (provati il 25 novembre 2026). Ognuno fa a modo suo:
 *
 * - I Wonder: sitemap dei "projects"; nella pagina i link bit.ly a file Drive
 *   singoli, con l'etichetta ("Poster web", "Banner Web", "Foto"); banner e foto sono zip;
 * - Lucky Red: sitemap dei "movie"; nella pagina le foto in alta e la locandina;
 * - BIM: sitemap; nella pagina una cartella Drive con sottocartelle (POSTER, BANNER, FOTO);
 * - Notorious: sitemap dei "movie"; foto e locandina nella vista "area stampa";
 * - Teodora: niente elenco; la pagina /film/<titolo> ha l'"Area stampa" su Dropbox,
 *   che non si scarica a pezzi: si dà il link.
 *
 * Medusa e i grandi studi chiedono il login: non ci sono.
 */

export interface Voce {
  etichetta: string;
  url: string;
}

export interface Trovata {
  distributore: string;
  pagina: string;
  voci: Voce[];
}

interface Distributore {
  nome: string;
  host: RegExp;
  /** Le pagine film con il loro slug. Vuoto se il distributore non ha un elenco. */
  indice: () => Promise<{ slug: string; url: string }[]>;
  /** Senza elenco: prova a indovinare la pagina dal titolo. */
  indovina?: (chi: Chi) => Promise<string | null>;
  leggi: (pagina: string) => Promise<Voce[]>;
}

const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' };

/** Una pagina come testo. Ogni intoppo diventa uno Spiegato («bimfilm.com non ha risposto in 20 secondi»). */
export async function testo(url: string, ms = 20000): Promise<string> {
  const host = new URL(url).host;
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms), cache: 'no-store' });
    if (!r.ok) throw rispostaSito(host, r.status);
    return await r.text();
  } catch (err) {
    throw retePersa(host, err, Math.round(ms / 1000));
  }
}

/** Un indirizzo incollato a mano, controllato. */
function indirizzo(u: string): URL {
  try {
    return new URL(u);
  } catch {
    throw new Spiegato(`«${u}» non è un indirizzo: copialo intero dalla barra del browser.`);
  }
}

const ENTITA: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', times: '×' };
export function decodifica(t: string): string {
  return t
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITA[n.toLowerCase()] ?? m);
}

/** I link di una pagina, con il testo che li accompagna (senza tag). */
export function link(html: string, base: string): Voce[] {
  const out: Voce[] = [];
  for (const m of html.matchAll(/<a\b[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: string;
    try { url = new URL(decodifica(m[1]), base).toString(); } catch { continue; }
    const etichetta = decodifica(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    out.push({ etichetta, url });
  }
  return out;
}

/** Le immagini mostrate in una pagina (`src`, `data-src`, `srcset` no: basta l'originale). */
export function immagini(html: string, base: string): Voce[] {
  const out: Voce[] = [];
  for (const m of html.matchAll(/<img\b[^>]*?\s(?:data-src|src)=["']([^"']+)["']/gi)) {
    try { out.push({ etichetta: '', url: new URL(decodifica(m[1]), base).toString() }); } catch { /* indirizzo rotto */ }
  }
  return out;
}

function locDellaSitemap(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => decodifica(m[1]));
}

/** Lo slug dell'ultima parte dell'indirizzo: /projects/titolo-di-regista/ → titolo-di-regista. */
function slugDi(url: string, parte: RegExp): { slug: string; url: string } | null {
  const m = new URL(url).pathname.match(parte);
  return m ? { slug: m[1], url } : null;
}

const nomeFile = (u: string) => decodeURIComponent(new URL(u).pathname.split('/').pop() || '');
const FILE_IMMAGINE = /\.(jpe?g|png|webp)$/i;
/** Le immagini caricate in WordPress: senza il "-1024x683" delle miniature c'è l'originale. */
const originaleWp = (u: string) => u.replace(/-\d{2,4}x\d{2,4}(?=\.(jpe?g|png|webp)$)/i, '');
/** Una locandina dal nome: poster, locandina, o i formati da affissione (35x50, 70x100…). */
const nomeDaLocandina = (n: string) => /poster|locandina|street|affiche|1sht|one.?sheet|(^|[^0-9])(33x70|35x50|50x70|70x100|100x140|140x200)/i.test(n);

/** Le immagini sciolte di una pagina WordPress, messe sotto "Locandina/" o "Foto/". */
function immaginiWp(voci: Voce[], tieni: (u: string) => boolean): Voce[] {
  const viste = new Set<string>();
  const out: Voce[] = [];
  for (const v of voci) {
    if (!FILE_IMMAGINE.test(new URL(v.url).pathname) || !tieni(v.url)) continue;
    const url = originaleWp(v.url);
    if (viste.has(url)) continue;
    viste.add(url);
    out.push({ etichetta: `${nomeDaLocandina(nomeFile(url)) ? 'Locandina' : 'Foto'}`, url });
  }
  return out;
}

const DRIVE_O_ALTRO = /bit\.ly|drive\.google|docs\.google\.com\/(file|uc)|dropbox\.com|we\.tl|wetransfer/i;

export const DISTRIBUTORI: Distributore[] = [
  {
    nome: 'I Wonder Pictures',
    host: /iwonderpictures\.(com|it)/,
    indice: async () =>
      locDellaSitemap(await testo('https://iwonderpictures.com/projects-sitemap.xml'))
        .map(u => slugDi(u, /\/projects\/([^/]+)/)).filter((x): x is { slug: string; url: string } => !!x),
    leggi: async pagina => link(await testo(pagina), pagina).filter(v => DRIVE_O_ALTRO.test(v.url) && !/forms\//.test(v.url)),
  },
  {
    nome: 'Lucky Red',
    host: /luckyred\.it/,
    indice: async () =>
      locDellaSitemap(await testo('https://www.luckyred.it/wp-sitemap-posts-movie-1.xml'))
        .map(u => slugDi(u, /\/movie\/([^/]+)/)).filter((x): x is { slug: string; url: string } => !!x),
    leggi: async pagina => {
      const voci = link(await testo(pagina), pagina);
      const altro = voci.filter(v => DRIVE_O_ALTRO.test(v.url) || /createzip|\.pdf$/i.test(v.url))
        .map(v => ({ ...v, etichetta: v.etichetta || (/createzip/.test(v.url) ? 'Tutte le foto (zip)' : nomeFile(v.url)) }));
      return [...immaginiWp(voci, u => /luckyred\.it\/(press|wp-content\/uploads)|foto\.luckyred\.it/.test(u)), ...altro];
    },
  },
  {
    nome: 'BIM',
    host: /bimfilm\.com/,
    indice: async () =>
      locDellaSitemap(await testo('https://bimfilm.com/sitemap_index.xml'))
        .map(u => slugDi(u, /\/film\/([^/]+)/)).filter((x): x is { slug: string; url: string } => !!x),
    leggi: async pagina =>
      link(await testo(pagina), pagina).filter(v => DRIVE_O_ALTRO.test(v.url))
        .map(v => ({ ...v, etichetta: v.etichetta || 'Materiali' })),
  },
  {
    nome: 'Notorious Pictures',
    host: /notoriouspictures\.it/,
    indice: async () =>
      locDellaSitemap(await testo('https://notoriouspictures.it/movie-sitemap.xml'))
        .map(u => slugDi(u, /\/movie\/([^/]+)/)).filter((x): x is { slug: string; url: string } => !!x),
    leggi: async pagina => {
      const area = `${pagina.replace(/\?.*$/, '').replace(/\/?$/, '/')}?areastampa=true&callback=areastampa`;
      const html = await testo(area);
      const voci = link(html, area);
      return [
        ...immaginiWp([...voci, ...immagini(html, area)], u => /notoriouspictures\.it\/wp-content\/uploads\/.+\.jpe?g$/i.test(u) && !/logo|icon|placeholder/i.test(u)),
        ...voci.filter(v => DRIVE_O_ALTRO.test(v.url) || /\.pdf$/i.test(v.url)),
      ];
    },
  },
  {
    nome: 'Teodora Film',
    host: /teodorafilm\.com/,
    indice: async () => [],
    indovina: async chi => {
      for (const t of chi.titoli) {
        const u = `https://teodorafilm.com/film/${slug(t)}`;
        const html = await testo(u).catch(() => '');
        if (/dropbox\.com\/scl/.test(html)) return u;
      }
      return null;
    },
    leggi: async pagina =>
      link(await testo(pagina), pagina).filter(v => DRIVE_O_ALTRO.test(v.url))
        .map(v => ({ ...v, etichetta: v.etichetta || 'Area stampa' })),
  },
];

// Gli elenchi cambiano poco: un'ora di memoria evita di rileggerli a ogni clic.
const memoria = new Map<string, { quando: number; pagine: { slug: string; url: string }[] }>();
async function indiceDi(d: Distributore) {
  const m = memoria.get(d.nome);
  if (m && Date.now() - m.quando < 3600_000) return m.pagine;
  const pagine = await d.indice();
  memoria.set(d.nome, { quando: Date.now(), pagine });
  return pagine;
}

/**
 * La pagina del film presso il suo distributore. Con `pagina` (incollata a
 * mano) si salta la ricerca: basta che il sito sia uno di quelli conosciuti.
 * In `muti` finiscono i distributori che non hanno risposto durante la
 * ricerca: se il film non si trova, può essere colpa loro.
 */
export async function trovaPagina(chi: Chi, pagina?: string, muti: string[] = []): Promise<Trovata | null> {
  if (pagina) {
    const host = indirizzo(pagina).host;
    const d = DISTRIBUTORI.find(x => x.host.test(host));
    if (!d) throw new Spiegato(`Non so ancora leggere ${host}. Conosco: ${DISTRIBUTORI.map(x => x.nome).join(', ')}. Per gli altri trascina le immagini a mano.`);
    return { distributore: d.nome, pagina, voci: await leggiDa(d, pagina) };
  }
  const trovate = await Promise.all(DISTRIBUTORI.map(async d => {
    try {
      if (d.indovina) {
        const u = await d.indovina(chi);
        return u ? { d, url: u, forza: 2 } : null;
      }
      const p = laPagina(await indiceDi(d), chi);
      return p ? { d, url: p.url, forza: 3 } : null;
    } catch (err) {
      console.error(`[stampa] ${d.nome} non risponde:`, err);
      muti.push(d.nome);
      return null;
    }
  }));
  const prima = trovate.filter((x): x is NonNullable<typeof x> => !!x)[0];
  if (!prima) return null;
  return { distributore: prima.d.nome, pagina: prima.url, voci: await leggiDa(prima.d, prima.url) };
}

/** La pagina del film, con l'errore che dice dove si è inceppato. */
async function leggiDa(d: Distributore, pagina: string): Promise<Voce[]> {
  try {
    return await d.leggi(pagina);
  } catch (err) {
    console.error(`[stampa] ${d.nome}, ${pagina}:`, err);
    const perche = err instanceof Spiegato ? err.message : 'la pagina non si legge';
    throw new Spiegato(`Il film è su ${d.nome} (${pagina}), ma ${perche.charAt(0).toLowerCase()}${perche.slice(1)}`);
  }
}

// ─── Scaricare: bit.ly, Drive (file e cartelle), zip ─────────────────────

/** Dove porta un bit.ly (senza scaricare la destinazione). */
export async function risolvi(url: string): Promise<string> {
  let u = url;
  for (let i = 0; i < 4 && /(^|\.)bit\.ly$|(^|\.)tinyurl\.com$/.test(new URL(u).host); i++) {
    const host = new URL(u).host;
    const r = await fetch(u, { method: 'HEAD', redirect: 'manual', headers: UA, signal: AbortSignal.timeout(10000) })
      .catch(err => { throw retePersa(host, err, 10); });
    const dove = r.headers.get('location');
    if (!dove) break;
    u = new URL(dove, u).toString();
  }
  return u;
}

export const idFileDrive = (u: string) => u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([\w-]{20,})/)?.[1]
  ?? u.match(/drive\.usercontent\.google\.com\/download\?(?:[^#]*&)?id=([\w-]{20,})/)?.[1] ?? null;
export const idCartellaDrive = (u: string) => u.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([\w-]{20,})/)?.[1] ?? null;

export interface Scaricato {
  nome: string;
  tipo: string;
  dati: Uint8Array;
}

/** Oltre questo non si scarica: sono video o DCP, non immagini. */
const TETTO = 120 * 1024 * 1024;

export async function scarica(url: string): Promise<Scaricato> {
  const id = idFileDrive(url);
  const dove = id ? `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t` : url;
  const host = new URL(dove).host;
  try {
    const r = await fetch(dove, { headers: UA, signal: AbortSignal.timeout(90000), cache: 'no-store' });
    if (!r.ok) throw new Spiegato(`download non riuscito (${host} risponde ${r.status})`);
    const lungo = Number(r.headers.get('content-length') || 0);
    if (lungo > TETTO) throw new Spiegato(`troppo grande (${Math.round(lungo / 1e6)} MB)`);
    const tipo = r.headers.get('content-type') || '';
    if (tipo.startsWith('text/html')) {
      throw new Spiegato(id
        ? 'Drive dà una pagina invece del file: non è condiviso con «chiunque abbia il link», o è troppo grande per l’anteprima. Aprilo e scaricalo a mano.'
        : 'il link porta a una pagina, non a un file (forse serve il login)');
    }
    const cd = r.headers.get('content-disposition') || '';
    let nome = nomeFile(r.url || dove);
    try { nome = decodeURIComponent(cd.match(/filename\*=UTF-8''([^;]+)/i)?.[1] ?? cd.match(/filename="?([^";]+)"?/i)?.[1] ?? nome); } catch { /* nome strano: resta quello dell'indirizzo */ }
    return { nome, tipo, dati: new Uint8Array(await r.arrayBuffer()) };
  } catch (err) {
    throw retePersa(host, err, 90);
  }
}

export const eZip = (s: Scaricato) => /zip/i.test(s.tipo) || /\.zip$/i.test(s.nome) || (s.dati[0] === 0x50 && s.dati[1] === 0x4b);

/** I file di uno zip, senza le cartelle e la spazzatura del Mac. */
export function apriZip(dati: Uint8Array): { nome: string; dati: Uint8Array }[] {
  const tutto = unzipSync(dati, { filter: f => !/(^|\/)(__MACOSX|\.DS_Store)/.test(f.name) && !f.name.endsWith('/') && /\.(jpe?g|png|webp)$/i.test(f.name) });
  return Object.entries(tutto).map(([nome, d]) => ({ nome, dati: d }));
}

/** Una cartella Drive condivisa, giù fino a `fondo` livelli (salta trailer, video e DCP). */
export async function cartellaDrive(id: string, fondo = 3, via = ''): Promise<{ percorso: string; url: string }[]> {
  const html = await testo(`https://drive.google.com/embeddedfolderview?id=${id}`);
  const out: { percorso: string; url: string }[] = [];
  for (const m of html.matchAll(/<div class="flip-entry" id="entry-([\w-]+)"[\s\S]*?<a href="([^"]+)"[\s\S]*?<div class="flip-entry-title">([^<]*)<\/div>/g)) {
    const [, eid, href, titolo] = m;
    const nome = decodifica(titolo).trim();
    const percorso = via ? `${via}/${nome}` : nome;
    if (/\/folders\//.test(href)) {
      if (fondo > 0 && !/trailer|video|dcp|teaser|clip|spot/i.test(nome)) out.push(...(await cartellaDrive(eid, fondo - 1, percorso)));
    } else {
      out.push({ percorso, url: `https://drive.google.com/file/d/${eid}/view` });
    }
    if (out.length > 300) break;
  }
  return out;
}
