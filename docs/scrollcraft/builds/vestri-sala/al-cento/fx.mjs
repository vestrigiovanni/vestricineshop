// Firefox separato da quello di Gio (profilo temporaneo, -no-remote), pilotato in WebDriver BiDi
// col WebSocket di Node 22. Disegna col processore (layers.acceleration.disabled), come il suo.
//
//   node fx.mjs misura --url http://localhost:3000/ --istantanea copia.html --out m.json [--finestra] [--css "..."] [--js "..."] [--leggero]
//   node fx.mjs scatta --url http://localhost:3000/ --istantanea copia.html --dir cartella --nome prima [--telefono] [--fermo] [--solo oggi,tutto]
//
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const FIREFOX = '/Applications/Firefox.app/Contents/MacOS/firefox';

const args = process.argv.slice(2);
const modo = args[0];
const opt = (nome, dflt = '') => { const i = args.indexOf('--' + nome); return i < 0 ? dflt : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : '1'); };
const ha = nome => args.includes('--' + nome);

function profilo({ fermo, dpr }) {
  const dir = mkdtempSync(join(QUI, 'profilo-'));
  const prefs = {
    'layers.acceleration.disabled': true,
    'layout.css.devPixelsPerPx': String(dpr),
    'ui.prefersReducedMotion': fermo ? 1 : 0,
    'privacy.reduceTimerPrecision': false,
    'remote.active-protocols': 1,
    'browser.shell.checkDefaultBrowser': false,
    'browser.startup.homepage_override.mstone': 'ignore',
    'browser.aboutwelcome.enabled': false,
    'browser.startup.page': 0,
    'startup.homepage_welcome_url': 'about:blank',
    'datareporting.policy.dataSubmissionEnabled': false,
    'datareporting.healthreport.uploadEnabled': false,
    'toolkit.telemetry.reportingpolicy.firstRun': false,
    'app.update.auto': false,
    'app.update.enabled': false,
    'browser.sessionstore.resume_from_crash': false,
    'browser.tabs.warnOnClose': false,
    'extensions.update.enabled': false,
    'media.autoplay.default': 0,
  };
  writeFileSync(join(dir, 'user.js'), Object.entries(prefs).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n'));
  return dir;
}

async function apri({ finestra = false, fermo = false, larghezza = 1440, altezza = 806, dpr = 2 }) {
  const dir = profilo({ fermo, dpr });
  const porta = 9300 + Math.floor(Math.random() * 500);
  const argv = ['-no-remote', '-profile', dir, '--remote-debugging-port', String(porta), '--width', String(larghezza), '--height', String(altezza + (finestra ? 90 : 0))];
  if (!finestra) argv.push('--headless');
  const proc = spawn(FIREFOX, argv, { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, MOZ_HEADLESS_WIDTH: String(larghezza), MOZ_HEADLESS_HEIGHT: String(altezza) } });
  const url = await new Promise((ok, no) => {
    let buf = '';
    const t = setTimeout(() => no(new Error('Firefox non ha aperto BiDi: ' + buf.slice(-400))), 40000);
    proc.stderr.on('data', d => {
      buf += d;
      const m = buf.match(/WebDriver BiDi listening on (ws:\/\/[^\s]+)/);
      if (m) { clearTimeout(t); ok(m[1]); }
    });
    proc.on('exit', c => no(new Error('Firefox uscito: ' + c + ' ' + buf.slice(-400))));
  });
  const ws = new WebSocket(url + '/session');
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = e => no(new Error('ws: ' + (e.message || 'errore'))); });
  let n = 0;
  const attese = new Map();
  const errori = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && attese.has(m.id)) {
      const { ok, no } = attese.get(m.id); attese.delete(m.id);
      if (m.type === 'error') no(new Error(m.error + ': ' + m.message)); else ok(m.result);
    } else if (m.method === 'log.entryAdded' && (m.params.level === 'error' || m.params.level === 'warn')) {
      errori.push(`[${m.params.level}] ${String(m.params.text).slice(0, 300)}`);
    }
  };
  const cmd = (method, params = {}) => new Promise((ok, no) => { const id = ++n; attese.set(id, { ok, no }); ws.send(JSON.stringify({ id, method, params })); });
  await cmd('session.new', { capabilities: {} });
  await cmd('session.subscribe', { events: ['log.entryAdded'] });
  const albero = await cmd('browsingContext.getTree', {});
  const context = albero.contexts[0].context;
  await cmd('browsingContext.setViewport', { context, viewport: { width: larghezza, height: altezza }, devicePixelRatio: dpr });
  const valuta = async (expression, awaitPromise = true) => {
    const r = await cmd('script.evaluate', { expression, target: { context }, awaitPromise, resultOwnership: 'none' });
    if (r.type === 'exception') throw new Error('nella pagina: ' + (r.exceptionDetails?.text || JSON.stringify(r.exceptionDetails).slice(0, 400)));
    return r.result?.value;
  };
  const chiudi = async () => {
    try { await cmd('browser.close', {}); } catch {}
    await new Promise(r => setTimeout(r, 600));
    try { proc.kill('SIGKILL'); } catch {}
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  };
  return { cmd, context, valuta, chiudi, errori };
}

/**
 * La copia: la pagina salvata una volta (--istantanea file.html) e servita da un proxy
 * locale, che per tutto il resto (script, stili, immagini) chiede al server vero.
 * Così la misura non dipende dal database, e ogni giro vede gli stessi film.
 * La disponibilità dal vivo risponde vuota: niente chiamate alle /api.
 */
async function copia(url, file) {
  if (!file) return { url, chiudi: () => {} };
  const origine = new URL(url);
  if (!existsSync(file)) {
    let html = '';
    for (let giro = 0; giro < 8 && !html.includes('data-sc-act'); giro++) {
      try { html = await (await fetch(url, { signal: AbortSignal.timeout(75000) })).text(); } catch { html = ''; }
      if (!html.includes('data-sc-act')) await new Promise(r => setTimeout(r, 3000));
    }
    if (!html.includes('data-sc-act')) throw new Error('la home non risponde coi film: niente istantanea');
    writeFileSync(file, html);
    console.error('istantanea salvata: ' + file);
  }
  const html = readFileSync(file);
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/' && req.method === 'GET' && !req.headers['rsc']) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(html); return; }
    if (u.pathname.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); return; }
    const p = http.request({ host: origine.hostname, port: origine.port, path: req.url, method: req.method, headers: { ...req.headers, host: origine.host } }, r => { res.writeHead(r.statusCode || 502, r.headers); r.pipe(res); });
    p.on('error', () => { try { res.writeHead(502); } catch {} res.end(); });
    req.pipe(p);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { url: `http://localhost:${srv.address().port}/`, chiudi: () => srv.close() };
}

/** Prima di ogni script della pagina: il modo leggero non si accende, e si può spegnere un effetto. */
const preload = ({ css, js, leggero }) => `() => {
  ${leggero ? '' : `
  try { sessionStorage.removeItem('vestri-leggero'); } catch (e) {}
  new MutationObserver(ms => { for (const m of ms) if (m.target.hasAttribute && m.target.hasAttribute('data-leggero')) { m.target.removeAttribute('data-leggero'); window.__leggeroBloccato = (window.__leggeroBloccato || 0) + 1; try { sessionStorage.removeItem('vestri-leggero'); } catch (e) {} } })
    .observe(document, { subtree: true, attributes: true, attributeFilter: ['data-leggero'] });`}
  ${css ? `
  const metti = () => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)}; (document.head || document.documentElement).appendChild(s); };
  if (document.head) metti(); else document.addEventListener('DOMContentLoaded', metti);` : ''}
  // Gli spostamenti di layout (CLS), atto per atto.
  try { window.__cls = []; new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls.push([Math.round(scrollY), +e.value.toFixed(4)]); }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
  ${js || ''}
}`;

/** Gli atti della home, riconosciuti dai loro titoli (i nomi delle classi sono impastati). */
const ATTI = `(() => {
  const nomi = { 'apertura-titolo': 'apertura', 'oggi-titolo': 'oggi', 'prossimi-titolo': 'prossimi', 'trailer-titolo': 'trailer', 'lontani-titolo': 'lontani', 'tutto-titolo': 'tutto' };
  const out = [];
  for (const s of document.querySelectorAll('section')) {
    const nome = s.dataset.atto || nomi[s.getAttribute('aria-labelledby')] || (s.getAttribute('aria-label') === 'Si spengono le luci' ? 'silenzio' : '');
    if (!nome) continue;
    const r = s.getBoundingClientRect();
    out.push({ nome, top: r.top + scrollY, bottom: r.bottom + scrollY });
  }
  return out;
})()`;

const MISURA = (passo) => `(async () => {
  const aspetta = ms => new Promise(r => setTimeout(r, ms));
  const fotogramma = () => new Promise(r => requestAnimationFrame(r));
  await aspetta(4500);
  const vai = y => scrollTo({ top: y, behavior: 'instant' });
  vai(0);
  await aspetta(600);
  const atti = ${ATTI};
  const dove = y => { const c = y + innerHeight / 2; let a = 'altro'; for (const x of atti) if (c >= x.top && c < x.bottom) a = x.nome; return a; };
  const tempi = {};
  const fermo = []; let p = await fotogramma();
  for (let i = 0; i < 90; i++) { const t = await fotogramma(); fermo.push(t - p); p = t; }
  const fine = document.documentElement.scrollHeight - innerHeight;
  let prima = await fotogramma();
  let guardia = 0, y = 0;
  while (y < fine && guardia++ < 20000) {
    y = Math.min(fine, y + ${passo});
    vai(y);
    const ora = await fotogramma();
    const a = dove(y);
    (tempi[a] = tempi[a] || []).push(Math.round((ora - prima) * 100) / 100);
    prima = ora;
  }
  const cls = {};
  for (const [yy, v] of (window.__cls || [])) { const a = dove(yy); cls[a] = +((cls[a] || 0) + v).toFixed(4); }
  return JSON.stringify({
    atti, tempi, cls, fermo: fermo.map(x => Math.round(x * 100) / 100),
    altezza: document.documentElement.scrollHeight, vista: [innerWidth, innerHeight, devicePixelRatio],
    leggero: !!document.querySelector('[data-leggero]'), bloccato: window.__leggeroBloccato || 0,
    ua: navigator.userAgent, visibile: document.visibilityState,
  });
})()`;

function riassunto(xs) {
  if (!xs || !xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: xs.length, mediana: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), oltre33: +(100 * xs.filter(x => x > 33).length / xs.length).toFixed(1), oltre50: +(100 * xs.filter(x => x > 50).length / xs.length).toFixed(1), max: +s[s.length - 1].toFixed(0) };
}

/** Apre la pagina; se arriva senza atti (pagina d'errore) riprova. */
async function naviga(fx, url) {
  for (let giro = 0; giro < 4; giro++) {
    await fx.cmd('browsingContext.navigate', { context: fx.context, url, wait: 'complete' });
    const atti = await fx.valuta(`document.querySelectorAll('section[data-sc-act]').length`, false);
    if (atti >= 2) return;
    console.error(`pagina senza atti (giro ${giro + 1}): riprovo`);
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error('la home non si carica: nessun atto dopo 4 giri');
}

async function misura() {
  const servita = await copia(opt('url', 'http://localhost:3000/'), opt('istantanea'));
  const url = servita.url;
  const fx = await apri({ finestra: ha('finestra') });
  try {
    await fx.cmd('script.addPreloadScript', { functionDeclaration: preload({ css: opt('css'), js: opt('js'), leggero: ha('leggero') }) });
    await naviga(fx, url);
    const dati = JSON.parse(await fx.valuta(MISURA(Number(opt('passo', '14')))));
    const ordine = ['apertura', 'oggi', 'prossimi', 'silenzio', 'trailer', 'lontani', 'tutto', 'altro'];
    const per = {};
    for (const a of ordine) if (dati.tempi[a]) per[a] = riassunto(dati.tempi[a]);
    const tutti = Object.values(dati.tempi).flat();
    const out = { quando: new Date().toISOString(), etichetta: opt('etichetta', ''), finestra: ha('finestra'), vista: dati.vista, altezza: dati.altezza, ua: dati.ua, visibile: dati.visibile, leggero: dati.leggero, bloccato: dati.bloccato, fermo: riassunto(dati.fermo), pagina: riassunto(tutti), atti: per, cls: dati.cls, errori: fx.errori.slice(0, 12), estensione: dati.atti };
    if (opt('out')) { mkdirSync(dirname(opt('out')), { recursive: true }); writeFileSync(opt('out'), JSON.stringify({ ...out, tempi: dati.tempi }, null, 1)); }
    const riga = (nome, r) => `${nome.padEnd(9)} n=${String(r.n).padStart(4)}  mediana ${String(r.mediana).padStart(5)} ms  p95 ${String(r.p95).padStart(6)}  >33ms ${String(r.oltre33).padStart(5)}%  >50ms ${String(r.oltre50).padStart(5)}%  max ${r.max}`;
    console.log(`# ${opt('etichetta', 'misura')} · ${dati.vista.join('×')} · alta ${dati.altezza}px · ${ha('finestra') ? 'in finestra' : 'senza finestra'} · leggero ${dati.leggero ? 'ACCESO' : 'spento'} (bloccato ${dati.bloccato} volte)`);
    console.log(riga('fermo', out.fermo));
    for (const [a, r] of Object.entries(per)) console.log(riga(a, r));
    console.log(riga('PAGINA', out.pagina));
    console.log('CLS per atto: ' + (JSON.stringify(dati.cls) || '{}'));
    if (fx.errori.length) console.log('console:\n  ' + fx.errori.slice(0, 8).join('\n  '));
  } finally { await fx.chiudi(); servita.chiudi(); }
}

/** Le posizioni da fotografare: per ogni atto l'inizio, e per quelli fissati anche metà e fine. */
const TAPPE = `(() => {
  const atti = ${ATTI};
  const vh = innerHeight, out = [];
  for (const a of atti) {
    const corsa = a.bottom - a.top - vh;
    if (a.nome === 'apertura') out.push([a.nome + '-1', 0], [a.nome + '-2', a.top + corsa * 0.7]);
    else if (a.nome === 'oggi') out.push([a.nome + '-1', a.top + 4], [a.nome + '-2', a.top + corsa * 0.55]);
    else if (a.nome === 'prossimi') out.push([a.nome + '-1', a.top + 4], [a.nome + '-2', a.top + corsa * 0.6]);
    else if (a.nome === 'silenzio') out.push([a.nome, a.top]);
    else if (a.nome === 'trailer') out.push([a.nome + '-1', a.top + corsa * 0.04], [a.nome + '-2', a.top + corsa * 0.5], [a.nome + '-3', a.top + corsa * 0.97]);
    else if (a.nome === 'lontani') out.push([a.nome + '-1', a.top - vh * 0.15], [a.nome + '-2', a.top + vh * 0.9]);
    else if (a.nome === 'tutto') out.push([a.nome + '-1', a.top - vh * 0.1], [a.nome + '-2', a.bottom - vh]);
  }
  return JSON.stringify(out);
})()`;

async function scatta() {
  const servita = await copia(opt('url', 'http://localhost:3000/'), opt('istantanea'));
  const url = servita.url + (opt('query') ? '?' + opt('query') : '');
  const dir = opt('dir'), nome = opt('nome', 'home');
  const telefono = ha('telefono'), fermo = ha('fermo');
  mkdirSync(dir, { recursive: true });
  const fx = await apri({ fermo, larghezza: telefono ? 390 : 1440, altezza: telefono ? 844 : 806, dpr: 2 });
  try {
    await fx.cmd('script.addPreloadScript', { functionDeclaration: preload({ css: opt('css'), js: opt('js'), leggero: ha('leggero') }) });
    await naviga(fx, url);
    await new Promise(r => setTimeout(r, 6000));
    if (opt('prima')) { await fx.valuta(opt('prima')); await new Promise(r => setTimeout(r, 2500)); }
    const solo = opt('solo') ? opt('solo').split(',') : null;
    const tappe = JSON.parse(await fx.valuta(TAPPE, false)).filter(([n]) => !solo || solo.some(s => n.startsWith(s)));
    const fatte = [];
    for (const [tappa, y] of tappe) {
      // Si arriva scorrendo a passi, come una mano: così le entrate a tempo partono davvero.
      await fx.valuta(`(async () => { const a = ${Math.round(y)}; const da = Math.max(0, a - innerHeight * 1.2); const vai = y => scrollTo({ top: y, behavior: 'instant' }); vai(da); for (let i = 1; i <= 24; i++) { vai(da + (a - da) * i / 24); await new Promise(r => requestAnimationFrame(r)); } })()`);
      await new Promise(r => setTimeout(r, Number(opt('posa', '2600'))));
      const s = await fx.cmd('browsingContext.captureScreenshot', { context: fx.context, origin: 'viewport' });
      const file = join(dir, `${nome}-${telefono ? 'telefono' : 'desktop'}${fermo ? '-fermo' : ''}-${tappa}.png`);
      writeFileSync(file, Buffer.from(s.data, 'base64'));
      fatte.push(file);
    }
    console.log(fatte.length + ' schermate in ' + dir);
    if (fx.errori.length) console.log('console:\n  ' + fx.errori.slice(0, 8).join('\n  '));
  } finally { await fx.chiudi(); servita.chiudi(); }
}

if (modo === 'misura') await misura();
else if (modo === 'scatta') await scatta();
else { console.error('uso: node fx.mjs misura|scatta …'); process.exit(2); }
process.exit(0);
