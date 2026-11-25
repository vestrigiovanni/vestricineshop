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
import { accenta, citazioneDi, conAccento, gruppi, piuVotato, chiave, sporgenza, uniche } from './critica/leggi.mjs';
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

/**
 * I trailer italiani su TMDB, i migliori per primi (al massimo tre): i
 * trailer prima dei teaser, e fra questi i più recenti, perché quelli
 * dell'uscita o della riuscita in sala («Dal 20 febbraio», «Candidato agli
 * Oscar») portano le citazioni della critica; il primo trailer spesso no.
 */
async function trailerItaliani(tmdbId) {
  const k = process.env.TMDB_API_KEY;
  if (!k) throw new Error('Manca TMDB_API_KEY in .env.local.');
  const r = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/videos?api_key=${k}&language=it-IT&include_video_language=it`);
  if (!r.ok) throw new Error(`TMDB non risponde (${r.status}).`);
  const v = ((await r.json()).results ?? []).filter(x => x.site === 'YouTube' && x.iso_639_1 === 'it' && /Trailer|Teaser/.test(x.type));
  const peso = x => (x.type === 'Trailer' ? 0 : 1);
  v.sort((a, b) => peso(a) - peso(b) || String(b.published_at).localeCompare(String(a.published_at)));
  if (!v.length) throw new Error('Su TMDB non c’è un trailer italiano di questo film.');
  return [...new Map(v.map(x => [x.key, { key: x.key, nome: x.name }])).values()].slice(0, 3);
}

/** I titoli del film (per scartare il cartello col titolo) e le sue foto ufficiali senza scritte, le più grandi prima. */
async function datiFilm(tmdbId) {
  const k = process.env.TMDB_API_KEY;
  const r = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${k}&language=it-IT&append_to_response=images&include_image_language=null`).catch(() => null);
  const j = r?.ok ? await r.json() : {};
  const foto = (j.images?.backdrops ?? [])
    .filter(b => b.iso_639_1 == null && b.width >= 1920)
    .sort((x, y) => y.width - x.width || y.vote_average - x.vote_average)
    .map(b => b.file_path);
  return { titoli: [j.title, j.original_title].filter(Boolean), foto };
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

/**
 * Quanto è nitido un fotogramma: il 99° percentile del laplaciano a 1280 px,
 * cioè quanto sono netti i punti più a fuoco. Misurato il 25/11/2026: le scene
 * mosse o sfocate che Giovanni ha scartato stanno sotto 25 (17 e 22), quelle
 * buone sopra 33.
 */
const NITIDO = 30;
async function nitidezza(file) {
  const { data } = await sharp(file).resize({ width: 1280 }).greyscale()
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 })
    .raw().toBuffer({ resolveWithObject: true });
  const conta = new Uint32Array(129);
  for (const v of data) conta[Math.min(128, Math.abs(v - 128))]++;
  let sopra = 0;
  for (let k = 128; k >= 0; k--) { sopra += conta[k]; if (sopra >= data.length * 0.01) return k; }
  return 0;
}

/**
 * Le È che Vision legge come E: per ogni E isolata della frase (dal lettore,
 * col riquadro) si misura, colonna per colonna, dove comincia la lettera; un
 * rialzo stretto sulla cima piatta è l'accento. Torna i sì/no in ordine di lettura.
 */
async function accentiDi(file, righe) {
  const ee = righe.flatMap(r => r.e ?? []);
  if (!ee.length) return [];
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const px = (x, y) => data[y * W + x];
  return ee.map(e => {
    // Dal bordo alto della riga (sotto quella di prima) fino a metà lettera.
    const y0 = Math.max(0, Math.floor(e.y * H)), y1 = Math.min(H, Math.round((e.y + 0.5 * e.h) * H));
    // Il fondo si prende fra le lettere (prima della E, e fra la E e la parola dopo).
    const fuori = [[e.x - 0.5 * e.w, e.x], [e.x + e.w, Math.max(e.x + e.w + 0.01, e.vx)]]
      .map(([xa, xb]) => [Math.max(0, Math.floor(xa * W)), Math.min(W, Math.ceil(xb * W))])
      .filter(([x0, x1]) => x1 > x0);
    const conta = new Uint32Array(256);
    for (const [x0, x1] of fuori) for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x++) conta[px(x, y)]++;
    const fondo = conta.indexOf(Math.max(...conta));
    const cime = [];
    for (let x = Math.max(0, Math.floor((e.x + 0.05 * e.w) * W)); x < Math.min(W, Math.ceil((e.x + 0.95 * e.w) * W)); x++) {
      let c = -1;
      for (let y = y0; y < y1; y++) if (Math.abs(px(x, y) - fondo) > 70) { c = y; break; }
      cime.push(c);
    }
    return conAccento(sporgenza(cime), e.h * H);
  });
}

/** Le citazioni di un trailer, con lo sfondo nitido preso dal trailer quando c'è. */
async function leggiTrailer(a, tr, dir, bin) {
  await stato(a, { stato: 'lavoro', messaggio: `Scarico «${tr.nome}»…`, trailer: tr.key });
  const qui = fs.mkdtempSync(path.join(dir, 't-'));
  const video = await scarica(tr.key, qui);

  await stato(a, { stato: 'lavoro', messaggio: `Leggo i fotogrammi di «${tr.nome}»…`, trailer: tr.key });
  const cartella = path.join(qui, 'f');
  fs.mkdirSync(cartella);
  await run('ffmpeg', ['-v', 'error', '-i', video, '-vf', `fps=${FPS},scale=960:-2`, '-q:v', '3', path.join(cartella, '%05d.jpg')]);
  const files = fs.readdirSync(cartella).filter(n => n.endsWith('.jpg')).sort().map(n => path.join(cartella, n));
  const letti = (await leggi(bin, files)).map(j => ({ i: Number(path.basename(j.f, '.jpg')), righe: j.r, f: j.f }));
  const perIndice = new Map(letti.map(x => [x.i, x]));
  const gg = gruppi(letti);
  if (!gg.length) return { citazioni: [], righeLette: [] };

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
    // La frase più letta nel gruppo, e fra i fotogrammi che la mostrano quello dove il testo è più pieno.
    const testo = piuVotato(g.interi.map(x => x.testo));
    // I fotogrammi dove il testo è più pieno (non in dissolvenza), i cinque migliori.
    const misurati = [];
    for (const x of g.interi) misurati.push({ x, v: await nitidezzaTesto(perIndice.get(x.i).f, x.box) });
    misurati.sort((p, q) => q.v - p.v);
    const migliori = misurati.slice(0, 5).map(m => m.x);
    // Riletti a piena risoluzione: i loghi delle testate e le lettere sopra una scena
    // («SELVAGGIA» in rosa su un volto) si leggono meglio. Su un fotogramma solo Vision
    // può perdere un pezzo: vince la frase letta più volte, a parità la più lunga.
    const grandi = [];
    for (const [k, x] of migliori.entries()) grandi.push(await fotogramma(video, x.i, crop, path.join(qui, `cit-${n}-${k}.jpg`)));
    const riletture = (await leggi(bin, grandi)).map((r, k) => ({ c: citazioneDi(r.r), file: grandi[k], x: migliori[k] })).filter(r => r.c);
    const voto = new Map();
    for (const r of riletture) voto.set(chiave(r.c.testo), (voto.get(chiave(r.c.testo)) ?? 0) + 1);
    riletture.sort((p, q) => (voto.get(chiave(q.c.testo)) - voto.get(chiave(p.c.testo))) || (q.c.testo.length - p.c.testo.length));
    const vinta = riletture[0];
    const piena = vinta?.c ?? null;
    const scelto = vinta?.x ?? migliori[0];
    const grande = vinta?.file ?? grandi[0];
    if (piena) {
      const foto = path.join(qui, `riga-${n}.jpg`);
      fs.copyFileSync(grande, foto);
      // Le righe di almeno cinque lettere: le parole corte dicono poco sul disegno.
      for (const r of piena.righe) if (chiave(r.t).length >= 5) righeLette.push({ foto, box: r.box, testo: r.t });
    }
    const voti = g.interi.map(x => x.fonte);
    // La rilettura a piena risoluzione vince sulla lettura piccola quando è la stessa frase,
    // o quando è più lunga e comincia allo stesso modo (la piccola ne aveva perso un pezzo).
    const kp = piena ? chiave(piena.testo) : '', kt = chiave(testo);
    const conPiena = !!piena && (kp === kt || (kp.length > kt.length && kp.startsWith(kt.slice(0, 6))));
    const fonte = piuVotato(conPiena && piena.fonte ? [piena.fonte, piena.fonte, ...voti] : voti);
    const critico = piuVotato(conPiena && piena.critico ? [piena.critico, ...g.interi.map(x => x.critico)] : g.interi.map(x => x.critico));
    // La È: Vision legge la E e perde l'accento staccato; lo si cerca nei pixel.
    const accenti = conPiena ? await accentiDi(grande, piena.righe).catch(() => []) : [];
    const frase = accenta(conPiena ? piena.testo : testo, accenti);

    // Lo sfondo: la scena pulita prima della citazione (fino a 5 secondi), se no quella dopo.
    // Solo se è nitida: le scene mosse o sfocate, ingrandite a tutto schermo, si vedono.
    const vicini = [];
    for (let k = 1; k <= 5 * FPS; k++) vicini.push(g.primo - k);
    for (let k = 1; k <= 5 * FPS; k++) vicini.push(g.ultimo + k);
    const candidati = [];
    for (const i of vicini) {
      const f = perIndice.get(i);
      if (!f || occupati.has(i) || usati.some(u => Math.abs(u - i) < 8)) continue;
      if (citazioneDi(f.righe)) continue;
      // Una scritta nella scena (un cartello) va bene, ma pesa meno di una scena pulita.
      const p = (await scena(f.f)) * (f.righe.length ? 0.5 : 1) * (i < g.primo ? 1.2 : 1);
      if (p > 0) candidati.push({ i, p });
    }
    candidati.sort((x, y) => y.p - x.p);
    let sfondo = null, fileSfondo = null;
    for (const c of candidati.slice(0, 8)) {
      const f = await fotogramma(video, c.i, crop, path.join(qui, `sfondo-${n}-${c.i}.jpg`));
      if (await nitidezza(f) >= NITIDO) { sfondo = c.i; fileSfondo = f; break; }
    }
    if (sfondo != null) usati.push(sfondo);
    citazioni.push({ testo: frase, fonte, critico, fileSfondo, schermata: grande });
    console.log(`«${tr.nome}» ${n + 1}. “${frase}” — ${critico ? `${critico}, ` : ''}${fonte || '(testata non letta)'}  [${((scelto.i - 1) / FPS).toFixed(1)} s, sfondo ${sfondo != null ? `${((sfondo - 1) / FPS).toFixed(1)} s` : 'nessuno nitido'}]`);
  }
  return { citazioni, righeLette };
}

// ── Il lavoro ────────────────────────────────────────────────────────────────

async function principale() {
  const a = argomenti(process.argv.slice(2));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `critica-${a.tmdbId}-`));
  if (a.prova) fs.mkdirSync(path.join(RADICE, 'tmp', `critica-${a.tmdbId}`), { recursive: true });
  try {
    await stato(a, { stato: 'lavoro', messaggio: 'Cerco i trailer italiani su TMDB…' });
    const [trailer, film] = await Promise.all([
      a.video ? [{ key: a.video, nome: a.video }] : trailerItaliani(a.tmdbId),
      datiFilm(a.tmdbId),
    ]);
    avvisa(`Leggo ${trailer.length > 1 ? `${trailer.length} trailer` : `«${trailer[0].nome}»`}`);
    const bin = await lettore();

    // Tutti i trailer italiani (al massimo tre): uno solo spesso ha una citazione, quello della riuscita ne ha sei.
    const lette = [];
    const righeLette = [];
    for (const tr of trailer) {
      try {
        const r = await leggiTrailer(a, tr, dir, bin);
        lette.push(...r.citazioni);
        righeLette.push(...r.righeLette);
      } catch (e) {
        // Un trailer che non si scarica non ferma gli altri.
        console.error(`«${tr.nome}»: ${e instanceof Error ? e.message : e}`);
        if (trailer.length === 1) throw e;
      }
    }
    const tenute = uniche(lette.map(c => ({ ...c, fondale: c.fileSfondo ?? '' })), film.titoli);
    if (!tenute.length) throw new Error('Nei trailer italiani non ho trovato citazioni della critica.');

    // Gli sfondi: il fotogramma nitido del trailer, se no una foto ufficiale di TMDB senza scritte (mai la stessa due volte).
    const libere = [...film.foto];
    const citazioni = [];
    for (const [n, c] of tenute.entries()) {
      let fondale = '';
      if (c.fileSfondo) {
        fondale = await carica(a, c.fileSfondo, `critica-${a.tmdbId}-${n + 1}.jpg`);
      } else if (libere.length) {
        const p = libere.shift();
        const r = await fetch(`https://image.tmdb.org/t/p/original${p}`).catch(() => null);
        if (r?.ok) {
          const f = path.join(dir, `tmdb-${n}.jpg`);
          fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
          fondale = await carica(a, f, `critica-${a.tmdbId}-${n + 1}-tmdb.jpg`);
        }
      }
      if (a.prova) await carica(a, c.schermata, `schermata-${n + 1}.jpg`);
      citazioni.push({ testo: c.testo, fonte: c.fonte, critico: c.critico, fondale });
      console.log(`${n + 1}. “${c.testo}” — ${c.critico ? `${c.critico}, ` : ''}${c.fonte || '(testata non letta)'}  [sfondo ${c.fileSfondo ? 'dal trailer' : fondale ? 'TMDB' : 'nessuno'}]`);
    }

    // Il carattere: le righe più lunghe, al massimo otto, contro i candidati di Google Fonts.
    let carattere = null;
    if (righeLette.length) {
      await stato(a, { stato: 'lavoro', messaggio: 'Cerco il carattere più simile a quello del trailer…' });
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

    await stato(a, { stato: 'fatto', messaggio: `${citazioni.length} citazioni dai trailer${carattere ? `, carattere ${carattere.famiglia}` : ''}.`, citazioni, ...(carattere ? { carattere } : {}) });
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
