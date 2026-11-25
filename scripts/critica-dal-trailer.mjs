#!/usr/bin/env node
/**
 * CRITICA DAL TRAILER (25 novembre 2026)
 *
 * Riempie «La critica» della proiezione speciale leggendo il trailer italiano:
 *   1. chiede a TMDB il trailer italiano del film (YouTube);
 *   2. lo scarica con yt-dlp (servono i cookie di Firefox: da un server
 *      YouTube rifiuta, per questo gira sul Mac e non su Vercel);
 *   3. ne prende quattro fotogrammi al secondo e li legge con Vision di macOS;
 *   4. per ogni citazione sceglie il fotogramma dove si legge intera e ferma
 *      (non in dissolvenza), lo rilegge a piena risoluzione e ne ricava frase,
 *      critico e testata;
 *   5. come sfondo prende la scena pulita che nel trailer viene subito prima
 *      della citazione (la frase la scrive il sito: sulla schermata col testo
 *      verrebbe scritta due volte);
 *   6. carica gli sfondi sul sito e gli manda le citazioni: la scheda le mette
 *      nella bozza come se fossero state trascinate.
 *
 * Lo fa partire il tasto «Critica dal trailer» della stanza Speciale, che apre
 * l'indirizzo vestricritica://leggi?tmdb=…&sito=… : lo riceve l'app
 * «Critica dal trailer» (scripts/critica/installa.sh) e lancia questo file.
 *
 * A mano:
 *   node scripts/critica-dal-trailer.mjs 1401459            → manda a vestricinema.com
 *   node scripts/critica-dal-trailer.mjs 1401459 --prova    → niente invio: scrive in tmp/critica-<id>/
 *   --video <chiave YouTube>  un trailer diverso da quello di TMDB
 *   --sito <origine>          es. http://localhost:3000
 *
 * VARIABILI (.env.local): TMDB_API_KEY, CATALOG_SYNC_SECRET (lo stesso del sito).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { citazioneDi, gruppi, piuVotato, chiave } from './critica/leggi.mjs';
import { carattereSimile, fileCarattere } from './critica/carattere.mjs';

const run = promisify(execFile);
const QUI = path.dirname(fileURLToPath(import.meta.url));
const RADICE = path.resolve(QUI, '..');
const FPS = 4;
/** Siti a cui si può mandare il segreto: l'indirizzo vestricritica:// lo può aprire qualunque pagina. */
const SITI = /^(https:\/\/(www\.)?vestricinema\.com|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;

// ── Configurazione ───────────────────────────────────────────────────────────

function caricaEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const riga of fs.readFileSync(file, 'utf-8').split('\n')) {
    const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
caricaEnv(path.join(RADICE, '.env.local'));
caricaEnv(path.join(RADICE, '.env'));
// L'app parte con un PATH minimo: yt-dlp, ffmpeg e deno stanno in Homebrew.
process.env.PATH = `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? '/usr/bin:/bin'}`;

function argomenti(argv) {
  const a = { tmdbId: 0, prova: false, video: '', sito: 'https://vestricinema.com' };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--prova') a.prova = true;
    else if (x === '--video') a.video = argv[++i] ?? '';
    else if (x === '--sito') a.sito = argv[++i] ?? '';
    else if (x === '--url') {
      // vestricritica://leggi?tmdb=1401459&sito=https%3A%2F%2Fvestricinema.com
      const u = new URL(argv[++i] ?? '');
      a.tmdbId = Number(u.searchParams.get('tmdb'));
      if (u.searchParams.get('sito')) a.sito = u.searchParams.get('sito');
    } else if (/^\d+$/.test(x)) a.tmdbId = Number(x);
  }
  a.sito = a.sito.replace(/\/+$/, '');
  if (!Number.isInteger(a.tmdbId) || a.tmdbId <= 0) throw new Error('Manca il numero TMDB del film.');
  if (!a.prova && !SITI.test(a.sito)) throw new Error(`Sito non ammesso: ${a.sito}`);
  return a;
}

const avvisa = (testo) => {
  try { execFileSync('osascript', ['-e', `display notification ${JSON.stringify(testo)} with title "Critica dal trailer"`]); } catch { /* niente notifiche: pazienza */ }
};

// ── Il sito ──────────────────────────────────────────────────────────────────

function segreto() {
  const s = process.env.CATALOG_SYNC_SECRET;
  if (!s) throw new Error('Manca CATALOG_SYNC_SECRET in .env.local.');
  return s;
}

async function stato(a, dati) {
  if (a.prova) { console.log(`[${dati.stato}] ${dati.messaggio ?? ''}`); return; }
  const r = await fetch(`${a.sito}/api/speciale/critica`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${segreto()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tmdbId: a.tmdbId, ...dati }),
  });
  if (!r.ok) throw new Error(`Il sito non accetta lo stato (${r.status}).`);
}

/** Carica un'immagine come la carica la scheda: torna `/api/speciale/immagine/<id>`. */
async function carica(a, file, nome) {
  const img = sharp(file).resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true });
  const { data, info } = await img.toBuffer({ resolveWithObject: true });
  if (a.prova) {
    const dove = path.join(RADICE, 'tmp', `critica-${a.tmdbId}`, nome);
    fs.writeFileSync(dove, data);
    return dove;
  }
  const fd = new FormData();
  fd.append('file', new Blob([data], { type: 'image/jpeg' }), nome);
  fd.append('w', String(info.width));
  fd.append('h', String(info.height));
  const r = await fetch(`${a.sito}/api/speciale/immagine`, { method: 'POST', headers: { Authorization: `Bearer ${segreto()}` }, body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Caricamento non riuscito (${r.status}).`);
  return j.src;
}

/** Carica il file del carattere (woff2) dove stanno le immagini della proiezione speciale. */
async function caricaCarattere(a, file, nome) {
  const data = fs.readFileSync(file);
  if (a.prova) {
    const dove = path.join(RADICE, 'tmp', `critica-${a.tmdbId}`, nome);
    fs.writeFileSync(dove, data);
    return dove;
  }
  const fd = new FormData();
  fd.append('file', new Blob([data], { type: 'font/woff2' }), nome);
  fd.append('w', '1');
  fd.append('h', '1');
  const r = await fetch(`${a.sito}/api/speciale/immagine`, { method: 'POST', headers: { Authorization: `Bearer ${segreto()}` }, body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Caricamento del carattere non riuscito (${r.status}).`);
  return j.src;
}

// ── TMDB e YouTube ───────────────────────────────────────────────────────────

/** Il trailer italiano su TMDB: prima i «Trailer», poi gli ufficiali, poi il più recente. */
async function trailerItaliano(tmdbId) {
  const k = process.env.TMDB_API_KEY;
  if (!k) throw new Error('Manca TMDB_API_KEY in .env.local.');
  const r = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/videos?api_key=${k}&language=it-IT&include_video_language=it`);
  if (!r.ok) throw new Error(`TMDB non risponde (${r.status}).`);
  const v = ((await r.json()).results ?? []).filter(x => x.site === 'YouTube' && x.iso_639_1 === 'it');
  const peso = x => (x.type === 'Trailer' ? 0 : x.type === 'Teaser' ? 1 : 2);
  v.sort((a, b) => peso(a) - peso(b) || Number(b.official) - Number(a.official) || String(b.published_at).localeCompare(String(a.published_at)));
  if (!v.length) throw new Error('Su TMDB non c’è un trailer italiano di questo film.');
  return { key: v[0].key, nome: v[0].name };
}

async function scarica(key, dir) {
  const out = path.join(dir, 'trailer.%(ext)s');
  try {
    await run('yt-dlp', ['--cookies-from-browser', 'firefox', '--no-playlist', '-f', 'bv*[height<=1080]/b[height<=1080]/bv*/b', '-o', out, `https://www.youtube.com/watch?v=${key}`], { maxBuffer: 1 << 26 });
  } catch (e) {
    const msg = String(e.stderr || e.message).split('\n').filter(l => /ERROR/.test(l)).pop() || 'yt-dlp non ce l’ha fatta';
    throw new Error(`Non riesco a scaricare il trailer: ${msg.replace(/^ERROR:\s*/, '')}. Se YouTube è cambiato: brew upgrade yt-dlp.`);
  }
  const f = fs.readdirSync(dir).find(n => n.startsWith('trailer.'));
  if (!f) throw new Error('yt-dlp non ha lasciato il file del trailer.');
  return path.join(dir, f);
}

// ── Fotogrammi e lettura ─────────────────────────────────────────────────────

/** Il lettore Vision, compilato la prima volta (e quando cambia il sorgente). */
async function lettore() {
  const src = path.join(QUI, 'critica', 'ocr.swift');
  const bin = path.join(QUI, 'critica', '.ocr');
  if (!fs.existsSync(bin) || fs.statSync(bin).mtimeMs < fs.statSync(src).mtimeMs) await run('swiftc', ['-O', src, '-o', bin]);
  return bin;
}

async function leggi(bin, files) {
  const righe = [];
  for (let i = 0; i < files.length; i += 120) {
    const { stdout } = await run(bin, files.slice(i, i + 120), { maxBuffer: 1 << 28 });
    righe.push(...stdout.trim().split('\n').filter(Boolean).map(l => JSON.parse(l)));
  }
  return righe;
}

/** Le bande nere fisse, se il trailer le ha: si tolgono dagli sfondi. */
async function bande(video) {
  try {
    const { stderr } = await run('ffmpeg', ['-i', video, '-vf', 'fps=1,cropdetect=24:2:0', '-f', 'null', '-'], { maxBuffer: 1 << 26 });
    return piuVotato([...stderr.matchAll(/crop=(\d+:\d+:\d+:\d+)/g)].map(m => m[1])) || null;
  } catch { return null; }
}

async function fotogramma(video, i, crop, file) {
  const t = ((i - 1) / FPS).toFixed(3);
  await run('ffmpeg', ['-v', 'error', '-y', '-ss', t, '-i', video, '-frames:v', '1', ...(crop ? ['-vf', `crop=${crop}`] : []), '-q:v', '2', file]);
  return file;
}

/** Quanto si vede il testo: il contrasto dentro il riquadro della frase. In dissolvenza è più basso. */
async function nitidezzaTesto(file, box) {
  const m = await sharp(file).metadata();
  const left = Math.max(0, Math.floor(box.x * m.width)), top = Math.max(0, Math.floor(box.y * m.height));
  const width = Math.max(1, Math.min(m.width - left, Math.ceil(box.w * m.width))), height = Math.max(1, Math.min(m.height - top, Math.ceil(box.h * m.height)));
  const s = await sharp(file).extract({ left, top, width, height }).greyscale().stats();
  return s.channels[0].stdev;
}

/** Una scena vera, non lo sfondo di una schermata né una dissolvenza: contrasto, luce e dettaglio. */
async function scena(file) {
  const s = await sharp(file).greyscale().stats();
  const c = s.channels[0];
  if (c.stdev < 35 || c.mean < 25 || s.sharpness < 0.8) return 0;
  return s.sharpness * Math.min(1, c.stdev / 60);
}

// ── Il lavoro ────────────────────────────────────────────────────────────────

async function principale() {
  const a = argomenti(process.argv.slice(2));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `critica-${a.tmdbId}-`));
  if (a.prova) fs.mkdirSync(path.join(RADICE, 'tmp', `critica-${a.tmdbId}`), { recursive: true });
  try {
    await stato(a, { stato: 'lavoro', messaggio: 'Cerco il trailer italiano su TMDB…' });
    const tr = a.video ? { key: a.video, nome: a.video } : await trailerItaliano(a.tmdbId);
    avvisa(`Scarico «${tr.nome}»`);
    await stato(a, { stato: 'lavoro', messaggio: `Scarico «${tr.nome}»…`, trailer: tr.key });
    const video = await scarica(tr.key, dir);

    await stato(a, { stato: 'lavoro', messaggio: 'Leggo i fotogrammi…', trailer: tr.key });
    const cartella = path.join(dir, 'f');
    fs.mkdirSync(cartella);
    await run('ffmpeg', ['-v', 'error', '-i', video, '-vf', `fps=${FPS},scale=960:-2`, '-q:v', '3', path.join(cartella, '%05d.jpg')]);
    const files = fs.readdirSync(cartella).filter(n => n.endsWith('.jpg')).sort().map(n => path.join(cartella, n));
    const bin = await lettore();
    const letti = (await leggi(bin, files)).map(j => ({ i: Number(path.basename(j.f, '.jpg')), righe: j.r, f: j.f }));
    const perIndice = new Map(letti.map(x => [x.i, x]));
    const gg = gruppi(letti);
    if (!gg.length) throw new Error('Nel trailer non ho trovato citazioni della critica.');

    const crop = await bande(video);
    // Attorno a ogni schermata c'è la dissolvenza: per un secondo la frase si
    // vede ancora in trasparenza, anche quando l'OCR non la legge più.
    const MARGINE = FPS;
    const occupati = new Set(gg.flatMap(g => Array.from({ length: g.ultimo - g.primo + 1 + 2 * MARGINE }, (_, k) => g.primo - MARGINE + k)));
    const usati = [];
    const citazioni = [];
    /** Le righe delle frasi lette a piena risoluzione: servono a trovare il carattere. */
    const righeLette = [];
    for (const [n, g] of gg.entries()) {
      await stato(a, { stato: 'lavoro', messaggio: `Citazione ${n + 1} di ${gg.length}…`, trailer: tr.key });
      // La frase più letta nel gruppo, e fra i fotogrammi che la mostrano quello dove il testo è più pieno.
      const testo = piuVotato(g.interi.map(x => x.testo));
      const buoni = g.interi.filter(x => x.testo === testo);
      let scelto = buoni[Math.floor(buoni.length / 2)], meglio = -1;
      for (const x of buoni) {
        const v = await nitidezzaTesto(perIndice.get(x.i).f, x.box);
        if (v > meglio) { meglio = v; scelto = x; }
      }
      // Riletto a piena risoluzione: i loghi delle testate si leggono meglio.
      const grande = await fotogramma(video, scelto.i, crop, path.join(dir, `cit-${n}.jpg`));
      const [rilettura] = await leggi(bin, [grande]);
      const piena = citazioneDi(rilettura.r);
      if (piena) {
        const foto = path.join(dir, `riga-${n}.jpg`);
        fs.copyFileSync(grande, foto);
        // Le righe di almeno cinque lettere: le parole corte dicono poco sul disegno.
        for (const r of piena.righe) if (chiave(r.t).length >= 5) righeLette.push({ foto, box: r.box, testo: r.t });
      }
      const voti = g.interi.map(x => x.fonte);
      const conPiena = piena && chiave(piena.testo) === chiave(testo);
      const fonte = piuVotato(conPiena && piena.fonte ? [piena.fonte, piena.fonte, ...voti] : voti);
      const critico = piuVotato(conPiena && piena.critico ? [piena.critico, ...g.interi.map(x => x.critico)] : g.interi.map(x => x.critico));
      const frase = conPiena ? piena.testo : testo;

      // Lo sfondo: la scena pulita prima della citazione (fino a 5 secondi), se no quella dopo.
      const vicini = [];
      for (let k = 1; k <= 5 * FPS; k++) vicini.push(g.primo - k);
      for (let k = 1; k <= 5 * FPS; k++) vicini.push(g.ultimo + k);
      let sfondo = null, punti = 0;
      for (const i of vicini) {
        const f = perIndice.get(i);
        if (!f || occupati.has(i) || usati.some(u => Math.abs(u - i) < 8)) continue;
        if (citazioneDi(f.righe)) continue;
        // Una scritta nella scena (un cartello) va bene, ma pesa meno di una scena pulita.
        const p = (await scena(f.f)) * (f.righe.length ? 0.5 : 1) * (i < g.primo ? 1.2 : 1);
        if (p > punti) { punti = p; sfondo = i; }
      }
      let fondale = '';
      if (sfondo != null) {
        usati.push(sfondo);
        const f = await fotogramma(video, sfondo, crop, path.join(dir, `sfondo-${n}.jpg`));
        fondale = await carica(a, f, `critica-${a.tmdbId}-${n + 1}.jpg`);
      }
      if (a.prova) await carica(a, grande, `schermata-${n + 1}.jpg`);
      citazioni.push({ testo: frase, fonte, critico, fondale });
      console.log(`${n + 1}. “${frase}” — ${critico ? `${critico}, ` : ''}${fonte || '(testata non letta)'}  [${((scelto.i - 1) / FPS).toFixed(1)} s, sfondo ${sfondo != null ? `${((sfondo - 1) / FPS).toFixed(1)} s` : 'nessuno'}]`);
    }

    // Il carattere: le righe più lunghe, al massimo otto, contro i candidati di Google Fonts.
    let carattere = null;
    if (righeLette.length) {
      await stato(a, { stato: 'lavoro', messaggio: 'Cerco il carattere più simile a quello del trailer…', trailer: tr.key });
      const prove = path.join(dir, 'prove');
      fs.mkdirSync(prove);
      const scelte = righeLette.sort((x, y) => y.testo.length - x.testo.length).slice(0, 8);
      const [primo] = await carattereSimile(scelte, prove);
      const woff2 = primo && await fileCarattere(primo.famiglia, primo.peso, 'woff2');
      if (woff2) {
        const src = await caricaCarattere(a, woff2, `${primo.famiglia.replace(/\s+/g, '-')}-${primo.peso}.woff2`);
        carattere = { famiglia: primo.famiglia, peso: primo.peso, src };
        console.log(`Carattere: ${primo.famiglia} ${primo.peso} (somiglianza ${primo.punti.toFixed(2)})`);
      }
    }

    await stato(a, { stato: 'fatto', messaggio: `${citazioni.length} citazioni dal trailer${carattere ? `, carattere ${carattere.famiglia}` : ''}.`, trailer: tr.key, citazioni, ...(carattere ? { carattere } : {}) });
    if (a.prova) fs.writeFileSync(path.join(RADICE, 'tmp', `critica-${a.tmdbId}`, 'citazioni.json'), JSON.stringify({ citazioni, carattere }, null, 2));
    avvisa(`${citazioni.length} citazioni pronte nella scheda.`);
  } catch (e) {
    const messaggio = e instanceof Error ? e.message : String(e);
    console.error(messaggio);
    avvisa(messaggio);
    await stato(a, { stato: 'errore', messaggio }).catch(() => {});
    process.exitCode = 1;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

principale();
