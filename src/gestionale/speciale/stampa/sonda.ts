import { cartellaDrive, idCartellaDrive, idFileDrive, risolvi, type Trovata, type Voce } from './distributori';
import { eImmagine, laLocandina, leFoto, type File } from './scegli';

/**
 * «Chi ha le foto?» (25 novembre 2026, chiesto da Giovanni): prima di
 * scegliere la prossima proiezione speciale, sapere quali film in programma
 * hanno il materiale davvero scaricabile. Qui si guarda la pagina del film
 * presso il distributore senza scaricare niente di grosso: le cartelle Drive
 * si elencano, delle immagini e degli zip si leggono solo le intestazioni
 * (il primo pezzo, poi si chiude). «Riempi dal distributore» farà il resto.
 */

export interface Sondato {
  /** Le foto di scena che si vedono una per una (immagini sciolte o in una cartella Drive). */
  foto: number;
  /** Gli zip di foto che rispondono, con la loro misura in MB se il sito la dice. */
  zip: { etichetta: string; mb?: number }[];
  locandina: boolean;
  banner: boolean;
  /** Una cartella Dropbox: si apre, ma si scarica a mano. */
  dropbox?: string;
  /** I link che non hanno risposto o portano a una pagina invece che a un file. */
  rotti: string[];
}

export type Verdetto = 'pronto' | 'a-mano' | 'niente';

/** Pronto: foto sciolte che rispondono, o uno zip di foto. A mano: c'è qualcosa (Dropbox, solo locandina), ma va preso dal browser. */
export function verdetto(s: Sondato): Verdetto {
  if (s.foto || s.zip.length) return 'pronto';
  if (s.foto || s.dropbox || s.locandina || s.banner) return 'a-mano';
  return 'niente';
}

/** In due parole, per l'elenco: «24 foto · zip delle foto (180 MB) · locandina · banner». */
export function riassunto(s: Sondato): string {
  const parti: string[] = [];
  if (s.foto) parti.push(`${s.foto} foto`);
  for (const z of s.zip) parti.push(`zip «${z.etichetta}»${z.mb ? ` (${z.mb} MB)` : ''}`);
  if (s.locandina) parti.push('locandina');
  if (s.banner) parti.push('banner');
  if (s.dropbox) parti.push('cartella Dropbox');
  return parti.join(' · ') || 'nessun file utile';
}

/** Cosa prenderà «Riempi dal distributore»: «foto e locandina», «foto, locandina e banner». */
export function cosaPrende(s: Sondato): string {
  const c = ['foto', ...(s.locandina ? ['locandina'] : []), ...(s.banner ? ['banner'] : [])];
  return c.length > 1 ? `${c.slice(0, -1).join(', ')} e ${c[c.length - 1]}` : c[0];
}

const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' };
const SERVE = /banner|poster|locandina|foto|photo|still|immagini|materiali|press|stampa|web|area|street|cover/i;
const MAI = /trailer|teaser|dcp|clip|\bspot\b|video|scheda|pressbook|caption|h264|\bmp4\b|\bmov\b/i;
const FILE_IMG = /\.(jpe?g|png|webp)(\?|$)/i;
const BANNER = /banner|cover|header/i;

/** Le intestazioni di un file, senza scaricarlo: risponde? è un file e non una pagina? quanto pesa? */
async function intestazioni(url: string): Promise<{ ok: boolean; nome: string; tipo: string; mb?: number }> {
  const id = idFileDrive(url);
  const dove = id ? `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t` : url;
  try {
    const r = await fetch(dove, { headers: { ...UA, Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(15000), cache: 'no-store' });
    r.body?.cancel().catch(() => {});
    const tipo = r.headers.get('content-type') || '';
    const cd = r.headers.get('content-disposition') || '';
    let nome = decodeURIComponent(new URL(r.url || dove).pathname.split('/').pop() || '');
    try { nome = decodeURIComponent(cd.match(/filename\*=UTF-8''([^;]+)/i)?.[1] ?? cd.match(/filename="?([^";]+)"?/i)?.[1] ?? nome); } catch { /* resta quello dell'indirizzo */ }
    // Con Range il totale sta in Content-Range («bytes 0-1023/183000000»).
    const totale = Number(r.headers.get('content-range')?.split('/')[1] || r.headers.get('content-length') || 0);
    return { ok: r.ok && !tipo.startsWith('text/html'), nome, tipo, mb: totale > 2048 ? Math.round(totale / 1e6) : undefined };
  } catch {
    return { ok: false, nome: '', tipo: '' };
  }
}

/** Il materiale della pagina trovata, guardato senza scaricarlo. */
export async function sonda(t: Trovata): Promise<Sondato> {
  const voci: Voce[] = t.voci.filter(v => !MAI.test(v.etichetta) && (SERVE.test(v.etichetta) || FILE_IMG.test(v.url))).slice(0, 60);
  const files: File[] = [];
  const zip: Sondato['zip'] = [];
  const rotti: string[] = [];
  let dropbox: string | undefined;
  let immaginiProvate = 0;

  await Promise.all(voci.map(async v => {
    try {
      const url = await risolvi(v.url);
      const cartella = idCartellaDrive(url);
      if (cartella) {
        for (const f of await cartellaDrive(cartella)) files.push({ percorso: `${v.etichetta}/${f.percorso}` });
        return;
      }
      if (/dropbox\.com\/(scl\/fo|sh)\//.test(url)) { dropbox = url; return; }
      if (FILE_IMG.test(new URL(url).pathname)) {
        const nome = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
        // Delle immagini sciolte se ne provano poche: se rispondono le prime, il sito è a posto.
        if (immaginiProvate++ < 3 && !(await intestazioni(url)).ok) { rotti.push(v.etichetta || nome); return; }
        files.push({ percorso: `${v.etichetta}/${nome}` });
        return;
      }
      const h = await intestazioni(url);
      if (!h.ok) { rotti.push(v.etichetta || url); return; }
      if (/zip/i.test(h.tipo) || /\.zip$/i.test(h.nome)) {
        const chi = `${v.etichetta} ${h.nome}`;
        if (BANNER.test(chi)) files.push({ percorso: `${v.etichetta}/banner` });
        else zip.push({ etichetta: v.etichetta || h.nome, mb: h.mb });
      } else if (/^image\//.test(h.tipo) || eImmagine(h.nome)) {
        files.push({ percorso: `${v.etichetta}/${h.nome}` });
      }
    } catch {
      rotti.push(v.etichetta || v.url);
    }
  }));

  const locandina = laLocandina(files);
  const foto = leFoto(files.filter(f => f !== locandina), 999).filter(f => !BANNER.test(f.percorso));
  return {
    foto: foto.length,
    zip: zip.filter(z => !/poster|locandina/i.test(z.etichetta)),
    locandina: !!locandina || zip.some(z => /poster|locandina/i.test(z.etichetta)),
    banner: files.some(f => BANNER.test(f.percorso)),
    dropbox,
    rotti,
  };
}
