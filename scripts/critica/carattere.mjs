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
  // I bastoni stretti e alti delle citazioni nei trailer americani (Anora, The Substance): aggiunti il 25/11/2026.
  'League Gothic', 'Antonio', 'Fjalla One', 'Pathway Gothic One', 'Six Caps', 'Big Shoulders Display', 'Barlow Condensed',
  'Roboto Condensed', 'Sofia Sans Extra Condensed', 'Archivo Narrow', 'Saira Extra Condensed', 'Teko', 'Alumni Sans', 'Staatliches',
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
 * Le lettere di un ritaglio, 255 dove c'è la scritta e 0 altrove. Le scritte
 * dei trailer non sono sempre bianche: quelle di Anora sono rosa sopra un
 * volto chiaro, quelle di The Substance nere su grigio chiaro. Quindi:
 * - se una parte buona del ritaglio è di un colore acceso, la scritta è quel
 *   colore (la tinta più frequente fra i pixel saturi);
 * - se no si guarda la luce; se il bordo del ritaglio (il fondo) è chiaro,
 *   la scritta è scura e si inverte.
 */
export async function inchiostroDi(input) {
  const { data: rgb, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const tinte = new Uint32Array(36);
  const hsv = new Float32Array(n * 2); // tinta, saturazione
  let saturi = 0;
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3] / 255, g = rgb[i * 3 + 1] / 255, b = rgb[i * 3 + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const s = max ? d / max : 0;
    let h = 0;
    if (d) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hsv[i * 2] = h * 60; hsv[i * 2 + 1] = s * (max > 0.35 ? 1 : 0);
    if (hsv[i * 2 + 1] > 0.55) { saturi++; tinte[Math.floor(hsv[i * 2] / 10) % 36]++; }
  }
  const data = Buffer.alloc(n);
  if (saturi > n * 0.06) {
    const tinta = tinte.indexOf(Math.max(...tinte)) * 10 + 5;
    for (let i = 0; i < n; i++) {
      const dh = Math.abs(((hsv[i * 2] - tinta + 540) % 360) - 180);
      data[i] = hsv[i * 2 + 1] > 0.4 && dh < 25 ? 255 : 0;
    }
  } else {
    const grigio = await sharp(input).greyscale().normalise().threshold(128).raw().toBuffer();
    // Il fondo è quello che tocca il bordo del ritaglio: se il bordo è chiaro, la scritta è scura.
    const W = info.width, H = info.height;
    let bordo = 0, chiari = 0;
    for (let x = 0; x < W; x++) for (const y of [0, H - 1]) { bordo++; if (grigio[y * W + x] > 127) chiari++; }
    for (let y = 0; y < H; y++) for (const x of [0, W - 1]) { bordo++; if (grigio[y * W + x] > 127) chiari++; }
    const inverti = chiari > bordo * 0.5;
    for (let i = 0; i < n; i++) data[i] = (grigio[i] > 127) !== inverti ? 255 : 0;
  }
  return { data, info: { width: info.width, height: info.height } };
}

/**
 * Una sagoma in bianco e nero, alta ALTEZZA: solo la fascia di righe più alta
 * con dell'inchiostro (i pezzi della riga sopra o sotto restano fuori),
 * rifilata ai lati. Uint8Array di 0/1 più la larghezza.
 */
async function sagoma(input) {
  const { data, info } = await inchiostroDi(input);
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
