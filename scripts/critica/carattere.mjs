/**
 * Trova, fra i caratteri di Google Fonts, quello più simile al carattere delle
 * citazioni nel trailer (25 novembre 2026). Si prende una riga della frase dal
 * fotogramma a piena risoluzione, si riscrive la stessa riga con ogni
 * carattere in ogni peso, e si confrontano le due sagome: proporzioni e pixel.
 *
 * I caratteri si scaricano una volta in ~/Library/Caches/vestri-critica/caratteri
 * (TTF per disegnarli qui con ImageMagick, woff2 per il sito).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';

const run = promisify(execFile);
const CACHE = path.join(os.homedir(), 'Library', 'Caches', 'vestri-critica', 'caratteri');

/** I candidati: i caratteri che i trailer imitano più spesso, a bastoni e con grazie. */
export const FAMIGLIE = [
  'Inter', 'Roboto', 'Arimo', 'Archivo', 'Work Sans', 'DM Sans', 'Manrope', 'Libre Franklin', 'Montserrat', 'Poppins',
  'Jost', 'Josefin Sans', 'Raleway', 'Lato', 'Open Sans', 'Barlow', 'IBM Plex Sans', 'Figtree', 'Hanken Grotesk', 'Outfit',
  'Oswald', 'Bebas Neue', 'Anton', 'Playfair Display', 'Libre Caslon Text', 'EB Garamond', 'Cormorant Garamond',
  'Bodoni Moda', 'Libre Baskerville', 'Lora', 'Crimson Pro', 'Newsreader', 'DM Serif Display', 'Spectral', 'Cinzel',
];
const PESI = [300, 400, 500, 600, 700];
const ALTEZZA = 64;

const UA_TTF = 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.30 (KHTML, like Gecko)';
const UA_WOFF2 = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const nomeFile = (famiglia, peso, est) => path.join(CACHE, `${famiglia.replace(/\s+/g, '-')}-${peso}.${est}`);

/** Scarica il file del carattere (ttf o woff2), se Google ce l'ha in quel peso. */
export async function fileCarattere(famiglia, peso, est = 'ttf') {
  const f = nomeFile(famiglia, peso, est);
  if (fs.existsSync(f)) return fs.statSync(f).size ? f : null;
  fs.mkdirSync(CACHE, { recursive: true });
  const css = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(famiglia)}:wght@${peso}&display=swap`, {
    headers: { 'User-Agent': est === 'ttf' ? UA_TTF : UA_WOFF2 },
  });
  if (!css.ok) { fs.writeFileSync(f, ''); return null; } // quel peso non c'è: lo si ricorda
  // Per il woff2 Google divide in sottoinsiemi: serve quello latino (l'ultimo blocco).
  const urls = [...(await css.text()).matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
  const url = urls[urls.length - 1];
  if (!url) { fs.writeFileSync(f, ''); return null; }
  const r = await fetch(url);
  if (!r.ok) return null;
  fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  return f;
}

/**
 * Una sagoma in bianco e nero, alta ALTEZZA: solo la fascia di righe più alta
 * con dell'inchiostro (i pezzi della riga sopra o sotto restano fuori),
 * rifilata ai lati. Uint8Array di 0/1 più la larghezza.
 */
async function sagoma(input) {
  const { data, info } = await sharp(input).greyscale().normalise().threshold(128).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const inchiostro = y => { let n = 0; for (let x = 0; x < W; x++) if (data[y * W + x] > 127) n++; return n; };
  const righe = Array.from({ length: H }, (_, y) => inchiostro(y) > W * 0.004);
  // La fascia più alta di righe con inchiostro; buchi di una o due righe non la spezzano.
  let meglio = [0, H - 1], ora = null, vuote = 0;
  for (let y = 0; y < H; y++) {
    if (righe[y]) { if (!ora) ora = [y, y]; ora[1] = y; vuote = 0; }
    else if (ora && ++vuote > 2) { if (ora[1] - ora[0] > meglio[1] - meglio[0] || meglio[0] === 0 && meglio[1] === H - 1) meglio = ora; ora = null; }
  }
  if (ora && (ora[1] - ora[0] > meglio[1] - meglio[0] || meglio[0] === 0 && meglio[1] === H - 1)) meglio = ora;
  const [y0, y1] = meglio;
  let x0 = W, x1 = -1;
  for (let y = y0; y <= y1; y++) for (let x = 0; x < W; x++) if (data[y * W + x] > 127) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
  if (x1 < x0) { x0 = 0; x1 = W - 1; }
  const out = await sharp(data, { raw: { width: W, height: H, channels: 1 } })
    .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
    .resize({ height: ALTEZZA }).raw().toBuffer({ resolveWithObject: true });
  return { px: Uint8Array.from(out.data, v => (v > 127 ? 1 : 0)), w: out.info.width };
}

/** Sfoca appena la sagoma: un pixel di scarto nella posizione non deve pesare come una lettera diversa. */
async function morbida(px, w, larghezza) {
  return sharp(Buffer.from(px.map(v => v * 255)), { raw: { width: w, height: ALTEZZA, channels: 1 } })
    .resize({ width: larghezza, height: ALTEZZA, fit: 'fill' }).blur(1.6).raw().toBuffer();
}

/** Somiglianza fra due sagome: correlazione delle forme, meno la differenza di proporzioni. */
async function confronta(a, b) {
  const x = await morbida(a.px, a.w, a.w), y = await morbida(b.px, b.w, a.w);
  let mx = 0, my = 0;
  for (let i = 0; i < x.length; i++) { mx += x[i]; my += y[i]; }
  mx /= x.length; my /= y.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  const r = sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
  return r - 2 * Math.abs(Math.log(b.w / a.w));
}

async function ritaglio(foto, box) {
  const m = await sharp(foto).metadata();
  // Solo la riga: col margine in alto e in basso si prenderebbe un pezzo della riga vicina.
  const pad = box.h * 0.06;
  const left = Math.max(0, Math.floor((box.x - box.h * 0.3) * m.width)), top = Math.max(0, Math.floor((box.y - pad) * m.height));
  const width = Math.min(m.width - left, Math.ceil((box.w + box.h * 0.6) * m.width)), height = Math.min(m.height - top, Math.ceil((box.h + 2 * pad) * m.height));
  return sharp(foto).extract({ left, top, width, height }).png().toBuffer();
}

/**
 * Il carattere più somigliante alle righe delle citazioni.
 * `righe`: [{ foto, box (0–1), testo }], una o più righe lette dai fotogrammi.
 * Restituisce i candidati in ordine, il primo è il più simile.
 */
export async function carattereSimile(righe, cartella) {
  const vere = [];
  for (const r of righe) {
    // Le virgolette come nel trailer: l'OCR le legge dritte.
    const testo = r.testo.replace(/^\s*["“«]/, '“').replace(/["”»]\s*$/, '”').replace(/'/g, '’');
    vere.push({ testo, sagoma: await sagoma(await ritaglio(r.foto, r.box)) });
  }
  const prove = [];
  for (const famiglia of FAMIGLIE) {
    for (const peso of PESI) {
      const ttf = await fileCarattere(famiglia, peso).catch(() => null);
      if (!ttf) continue;
      let punti = 0, ok = true;
      for (const [i, v] of vere.entries()) {
        const png = path.join(cartella, `prova-${i}-${famiglia.replace(/\s+/g, '-')}-${peso}.png`);
        try {
          await run('magick', ['-background', 'black', '-fill', 'white', '-font', ttf, '-pointsize', '160', `label:${v.testo}`, png]);
          punti += await confronta(v.sagoma, await sagoma(png));
        } catch { ok = false; break; } // un carattere senza qualche lettera: si salta
      }
      if (ok) prove.push({ famiglia, peso, punti: punti / vere.length });
    }
  }
  prove.sort((a, b) => b.punti - a.punti);
  return prove;
}
