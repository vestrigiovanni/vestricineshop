// La "regia del giorno", comune ai tre prototipi.
// Dai dati veri (dati.js) decide: quale film apre, quali premi meritano la scala grande,
// quali fondali comporre e in che ordine. Il seme è la data: ogni giorno un disegno diverso.
// Con ?giorno=2026-10-21 si vede la pagina di un altro giorno.
(function () {
  const D = window.VESTRI;
  const params = new URLSearchParams(location.search);
  const today = params.get('giorno') || D.today;

  const IMG = (p, size = 'w1280') => (p && p !== 'none' ? `https://image.tmdb.org/t/p/${size}${p}` : '');
  const LOGO_DIR = '../../../public/logos/';

  const FEST = {
    cannes: { name: 'Festival di Cannes', short: 'Cannes', logo: 'cannes_v1.png', rank: 10 },
    venice: { name: 'Mostra di Venezia', short: 'Venezia', logo: 'venezia_v1.png', rank: 10 },
    berlin: { name: 'Berlinale', short: 'Berlino', logo: 'berlinale_v1.png', rank: 9 },
    oscar: { name: 'Academy Awards', short: 'Oscar', logo: 'oscars_v1.png', rank: 9 },
    bafta: { name: 'BAFTA', short: 'BAFTA', logo: 'bafta_v1.png', rank: 7 },
    toronto: { name: 'Toronto', short: 'TIFF', logo: 'tiff.png', rank: 6 },
    ssiff: { name: 'San Sebastián', short: 'San Sebastián', logo: 'ssiff_v1.png', rank: 6 },
    locarno: { name: 'Locarno', short: 'Locarno', logo: 'locarno.png', rank: 6 },
    telluride: { name: 'Telluride', short: 'Telluride', logo: 'telluride_v1.png', rank: 5 },
    davids: { name: 'David di Donatello', short: 'David', logo: 'david.png', rank: 7 },
    nastri: { name: "Nastri d'Argento", short: 'Nastri', logo: 'nastri.png', rank: 5 },
    romacinemafest: { name: 'Festa del Cinema di Roma', short: 'Roma', logo: 'roma.png', rank: 4 },
  };

  // Premi che valgono da soli una pagina intera.
  const SUPREME = /palma d'oro|palme d'or|leone d'oro|golden lion|orso d'oro|golden bear|^miglior film$|best picture/i;

  function parseAward(a) {
    const out = { won: [], nominated: [], selection: false };
    for (const part of (a.details || '').split(' · ')) {
      if (/^Vincitore:/.test(part)) out.won.push(...part.replace('Vincitore:', '').split(',').map(s => s.trim()).filter(Boolean));
      else if (/^Candidatura:/.test(part)) out.nominated.push(...part.replace('Candidatura:', '').split(',').map(s => s.trim()).filter(Boolean));
      else if (/Selezione/i.test(part)) out.selection = true;
    }
    return out;
  }

  // Peso di un premio: decide la scala con cui si mostra.
  function weigh(a) {
    const f = FEST[a.type] || { rank: 3 };
    const p = parseAward(a);
    const supreme = p.won.find(w => SUPREME.test(w));
    if (supreme) return { ...a, ...p, fest: f, prize: supreme, weight: 100 + f.rank };
    if (p.won.length) return { ...a, ...p, fest: f, prize: p.won[0], weight: 40 + f.rank * 3 + p.won.length };
    if (p.nominated.length) return { ...a, ...p, fest: f, prize: 'Candidatura · ' + p.nominated[0], weight: 15 + f.rank };
    return { ...a, ...p, fest: f, prize: 'Selezione ufficiale', weight: f.rank };
  }

  // Seme della giornata.
  function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { return function () { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const rand = rng(hash(today));
  const pick = arr => arr[Math.floor(rand() * arr.length)];
  const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  const films = D.films.map(f => {
    const awards = f.awards.map(weigh).sort((a, b) => b.weight - a.weight);
    return {
      ...f,
      awards,
      top: awards[0] || null,
      backdrops: [f.backdrop, ...f.extra].filter(Boolean),
      upcoming: f.shows.filter(s => s.t.slice(0, 10) >= today),
    };
  }).filter(f => f.upcoming.length);

  const showsOn = day => films.flatMap(f => f.upcoming.filter(s => s.t.slice(0, 10) === day).map(s => ({ ...s, film: f }))).sort((a, b) => a.t.localeCompare(b.t));
  const days = [...new Set(films.flatMap(f => f.upcoming.map(s => s.t.slice(0, 10))))].sort();
  const tonight = showsOn(today);
  const opening = (tonight[0] && tonight[0].film) || films[0];

  // Il film col premio più pesante della settimana: la sua pagina d'onore.
  const laureate = films.filter(f => f.top).sort((a, b) => b.top.weight - a.top.weight)[0];

  const DAYS_IT = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const MONTHS_IT = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const dateOf = d => new Date(d + 'T12:00:00');
  const fmt = {
    day: d => { const x = dateOf(d); return `${DAYS_IT[x.getDay()]} ${x.getDate()} ${MONTHS_IT[x.getMonth()]}`; },
    dayShort: d => { const x = dateOf(d); return `${DAYS_IT[x.getDay()].slice(0, 3)} ${x.getDate()}`; },
    time: t => t.slice(11, 16),
    runtime: m => (m ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}′` : ''),
    lang: s => [s.lang, s.subs ? 'sott. ' + s.subs.toLowerCase().slice(0, 3) : ''].filter(Boolean).join(' · '),
    specs: s => (s.specs || []).map(x => x.replace('DOLBY_VISION', 'Dolby Vision').replace('ATMOS', 'Atmos')),
  };

  window.REGIA = { today, films, days, tonight, opening, laureate, showsOn, FEST, LOGO_DIR, IMG, fmt, rand, pick, shuffle };
})();

// Loghi TMDB scuri su fondo scuro: se il logo è quasi nero lo si accende in bianco.
// Lo si misura davvero (canvas), non si indovina.
window.REGIA.fixDarkLogo = function (img) {
  const run = () => {
    try {
      const c = document.createElement('canvas'); const w = (c.width = 64); const h = (c.height = Math.max(8, Math.round(64 * img.naturalHeight / img.naturalWidth)));
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h);
      const d = x.getImageData(0, 0, w, h).data; let sum = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; }
      if (n && sum / n < 70) img.classList.add('logo-acceso');
    } catch (e) { /* senza CORS si lascia com'è */ }
  };
  img.crossOrigin = 'anonymous';
  if (img.complete && img.naturalWidth) run(); else img.addEventListener('load', run, { once: true });
};
