/**
 * Riconosce le citazioni della critica nel testo letto dai fotogrammi di un
 * trailer (25 novembre 2026). Solo funzioni pure: il programma che scarica e
 * legge è `scripts/critica-dal-trailer.mjs`.
 *
 * Una schermata di critica, nei trailer italiani, è fatta così:
 *   “Un film magistrale
 *    da un maestro del cinema”
 *    SEAN FENNESSEY, THE RINGER        ← nome in maiuscolo, virgola, testata (spesso un logo)
 */

const APRE = /^[\s.…]*["“”«„']/;
const CHIUDE = /["“”»']\s*[.…]*$/;

/** Solo lettere e cifre minuscole: per confrontare testi letti male. */
export function chiave(t) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** La distanza di Levenshtein, per i loghi letti male ("Reqer Ebert"). */
function distanza(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prima = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const ora = [i];
    for (let j = 1; j <= n; j++) ora[j] = Math.min(prima[j] + 1, ora[j - 1] + 1, prima[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prima = ora;
  }
  return prima[n];
}

/**
 * Le testate che si incontrano nei trailer, scritte come le scrivono loro.
 * Nei trailer la testata è spesso un logo, e l'OCR la legge a metà: si
 * riconosce per somiglianza. Se non è qui, si tiene quello che si è letto.
 */
export const TESTATE = [
  'Variety', 'IndieWire', 'The Hollywood Reporter', 'Deadline', 'The Guardian', 'The Observer', 'The New York Times',
  'The New Yorker', 'Los Angeles Times', 'The Washington Post', 'The Wall Street Journal', 'The Telegraph', 'The Independent',
  'Financial Times', 'Evening Standard', 'The Times', 'Time Out', 'Empire', 'Total Film', 'Little White Lies',
  'Sight and Sound', 'Screen International', 'Screen Daily', 'Rolling Stone', 'Vanity Fair', 'Vogue', 'Elle', 'GQ',
  'Esquire', 'Harper’s Bazaar', 'Wired', 'Vulture', 'The Atlantic', 'The Ringer', 'The Playlist', 'Collider', 'Slant',
  'Paste', 'The A.V. Club', 'The Wrap', 'RogerEbert.com', 'AwardsWatch', 'Awards Radar', 'The Awards Contender',
  'Awards Daily', 'Next Best Picture', 'Gold Derby', 'The Film Stage', 'Film Comment', 'Cahiers du Cinéma',
  'Le Monde', 'Libération', 'Télérama', 'Le Figaro', 'Les Inrockuptibles', 'Positif', 'El País', 'Der Spiegel',
  'Corriere della Sera', 'la Repubblica', 'La Stampa', 'Il Sole 24 Ore', 'il manifesto', 'Il Fatto Quotidiano',
  'Il Messaggero', 'Il Foglio', 'Avvenire', 'Il Giornale', 'Ciak', 'FilmTv', 'MYmovies', 'Sentieri Selvaggi',
  'Cineforum', 'Nocturno', 'Rivista del Cinematografo', 'Film Tv', 'Best Movie', 'Wired Italia', 'Rolling Stone Italia',
  'Vanity Fair Italia', 'Io Donna', 'D – la Repubblica', 'Internazionale', 'L’Espresso', 'Panorama', 'Ansa', 'Rai',
  'Sky Tg24', 'BBC', 'CNN', 'NPR', 'Associated Press', 'Time', 'Newsweek', 'Entertainment Weekly', 'IGN', 'Polygon',
  'Observer', 'Sydney Morning Herald', 'The Irish Times', 'Mubi', 'Letterboxd',
];

const PICCOLE = new Set(['di', 'del', 'della', 'de', 'du', 'la', 'le', 'il', 'of', 'the', 'and', 'e', 'des']);

/** "THE AWARDS CONTENDER" → "The Awards Contender", se non è fra le testate note. */
function maiuscole(t) {
  const su = p => p.charAt(0).toUpperCase() + p.slice(1);
  return t.toLowerCase().split(/\s+/)
    .map((p, i) => (i > 0 && PICCOLE.has(p) ? p : su(p)))
    // McQuade, O'Brien, Jean-Luc: la maiuscola anche dopo Mc, l'apostrofo e il trattino.
    .map(p => p.replace(/^Mc(\p{L})/u, (_, c) => `Mc${c.toUpperCase()}`).replace(/(['’-])(\p{L})/gu, (_, a, c) => a + c.toUpperCase()))
    .join(' ');
}

/** Toglie dal testo letto i segni dei loghi e la punteggiatura ai bordi. */
function ripulita(letta) {
  return letta.replace(/[™®©•·|]/g, ' ').replace(/^[^\p{L}\d]+|[^\p{L}\d.]+$/gu, '').replace(/\s+/g, ' ').trim();
}

/** La distanza più piccola fra `kt` e un pezzo qualunque di `k` lungo più o meno come lui. */
function distanzaDentro(k, kt) {
  let d = Infinity;
  for (let l = Math.max(1, kt.length - 2); l <= Math.min(k.length, kt.length + 2); l++)
    for (let i = 0; i + l <= k.length; i++) d = Math.min(d, distanza(k.slice(i, i + l), kt));
  return d;
}

/**
 * Riconosce una testata nota in quello che l'OCR ha letto, con un punteggio
 * da 0 a 1. Il logo letto a metà ("CONTENDE", "Hollywood") vale meno di quello
 * letto intero; "R3 Reqer Ebert.om" si riconosce per somiglianza.
 */
export function riconosci(letta) {
  const k = chiave(ripulita(letta));
  let nome = '', punti = 0;
  if (k.length < 2) return { nome, punti };
  for (const t of TESTATE) {
    const kt = chiave(t);
    let p = 0;
    if (k === kt) p = 1;
    else if (k.length >= 4 && kt.includes(k)) p = 0.9 * (k.length / kt.length) + 0.1;
    else if (kt.length >= 4 && k.includes(kt)) p = 0.95;
    if (kt.length >= 5 && k.length >= 4) {
      const s = 1 - distanzaDentro(k, kt) / kt.length;
      if (s >= 0.75) p = Math.max(p, s * 0.95);
    }
    if (p > punti) { punti = p; nome = t; }
  }
  return punti >= 0.45 ? { nome, punti } : { nome: '', punti: 0 };
}

/** La testata scritta per bene: quella nota se si riconosce, se no quella letta. */
export function testata(letta) {
  const r = riconosci(letta);
  if (r.nome) return r.nome;
  const pulita = ripulita(letta);
  if (chiave(pulita).length < 2) return '';
  return /[a-z]/.test(pulita) ? pulita : maiuscole(pulita);
}

/** Il testo della citazione come lo scrive il sito: senza virgolette, apostrofi tipografici. */
export function frase(righe) {
  return righe.join(' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.…]*["“”«„']+/, '')
    .replace(/["“”»']+\s*[.…]*$/, '')
    .replace(/'/g, '’')
    .trim()
    // La virgola (o il punto e virgola) prima della virgoletta di chiusura: nel sito non serve.
    .replace(/\s*[,;:]+$/, '');
}

/**
 * Cerca una citazione nel testo di un fotogramma. Le righe arrivano da Vision
 * con il riquadro (y dall'alto): si mettono in ordine di lettura, si prende il
 * blocco fra le virgolette e la riga in maiuscolo subito sotto.
 * Restituisce null se il fotogramma non ha una citazione intera.
 */
export function citazioneDi(righe) {
  const rr = righe.filter(r => r.t.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const inizio = rr.findIndex(r => APRE.test(r.t));
  if (inizio < 0) return null;
  let fine = -1;
  for (let i = inizio; i < Math.min(rr.length, inizio + 4); i++) {
    if (CHIUDE.test(rr[i].t) && (i > inizio || rr[i].t.trim().length > 2)) { fine = i; break; }
  }
  // La virgoletta di chiusura persa (scritta colorata sopra una scena): la frase
  // finisce allora dove comincia la firma, «-VANITY FAIR» o una testata nota.
  if (fine < 0) {
    for (let i = inizio + 1; i < Math.min(rr.length, inizio + 5); i++) {
      const t = rr[i].t.trim();
      if (/^[-–—]\s*\p{L}/u.test(t) || riconosci(t).punti >= 0.9) { fine = i - 1; break; }
    }
  }
  if (fine < 0) return null;
  const testo = frase(rr.slice(inizio, fine + 1).map(r => r.t));
  if (chiave(testo).length < 3) return null;
  // La firma: le righe subito sotto la frase. Quella con la virgola dice
  // "NOME, TESTATA"; le altre sono pezzi del logo della testata.
  const ultima = rr[fine];
  const sotto = rr.slice(fine + 1).filter(r => r.y - (ultima.y + ultima.h) < ultima.h * 3 && r.y < ultima.y + ultima.h * 5);
  const conVirgola = sotto.find(r => r.t.includes(','));
  let critico = '', fonte = '';
  const pezzi = sotto.filter(r => r !== conVirgola).map(r => r.t);
  const dopo = conVirgola ? conVirgola.t.slice(conVirgola.t.indexOf(',') + 1) : '';
  if (conVirgola) critico = conVirgola.t.slice(0, conVirgola.t.indexOf(',')).trim();
  const prove = [dopo, [...pezzi, dopo].join(' '), pezzi.join(' '), ...pezzi].filter(t => t.trim());
  const migliore = prove.map(riconosci).sort((a, b) => b.punti - a.punti)[0];
  if (migliore?.nome) fonte = migliore.nome;
  else if (prove.length) fonte = testata(prove[0]);
  const box = rr.slice(inizio, fine + 1);
  const x = Math.min(...box.map(r => r.x)), y = Math.min(...box.map(r => r.y));
  const x2 = Math.max(...box.map(r => r.x + r.w)), y2 = Math.max(...box.map(r => r.y + r.h));
  return { testo, critico: critico ? maiuscole(critico) : '', fonte, box: { x, y, w: x2 - x, h: y2 - y }, righe: box.map(r => ({ t: r.t, box: { x: r.x, y: r.y, w: r.w, h: r.h }, ...(r.e ? { e: r.e } : {}) })) };
}

/**
 * Raggruppa i fotogrammi consecutivi che mostrano la stessa citazione.
 * `fotogrammi` è [{ i, righe }] in ordine di tempo. Ogni gruppo tiene i
 * fotogrammi dove la citazione si legge intera (non in dissolvenza: lì
 * l'OCR perde le virgolette o le lettere) e quelli con del testo qualunque,
 * per sapere dove comincia e finisce la schermata.
 */
export function gruppi(fotogrammi) {
  const out = [];
  let ora = null;
  for (const f of fotogrammi) {
    const c = citazioneDi(f.righe);
    if (c) {
      const k = chiave(c.testo);
      const stessa = ora && f.i - ora.ultimo <= 3 && (ora.k === k || 1 - distanza(ora.k, k) / Math.max(ora.k.length, k.length) >= 0.8);
      if (!stessa) { ora = { k, interi: [], primo: f.i, ultimo: f.i }; out.push(ora); }
      ora.interi.push({ i: f.i, ...c });
      ora.ultimo = f.i;
    }
  }
  // Un gruppo di un fotogramma solo dentro un altro è una dissolvenza letta male.
  const veri = out.filter(g => g.interi.length > 1 || !out.some(h => h !== g && h.interi.length > 1 && g.primo >= h.primo - 2 && g.ultimo <= h.ultimo + 2));
  out.length = 0;
  out.push(...veri);
  // Allarga ogni gruppo ai fotogrammi con testo subito prima e dopo (le dissolvenze).
  const conTesto = new Set(fotogrammi.filter(f => f.righe.some(r => r.t.trim().length > 1)).map(f => f.i));
  for (const g of out) {
    while (conTesto.has(g.primo - 1)) g.primo--;
    while (conTesto.has(g.ultimo + 1)) g.ultimo++;
  }
  return out;
}

/** Il valore più frequente (a parità, il più lungo): l'OCR sbaglia su un fotogramma, non su tutti. */
export function piuVotato(xs) {
  const conta = new Map();
  for (const x of xs) if (x) conta.set(x, (conta.get(x) ?? 0) + 1);
  return [...conta.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0] ?? '';
}

// ── L'accento della È maiuscola ─────────────────────────────────────────────

/**
 * La E ha l'accento? `cime` sono, colonna per colonna dentro la E, le righe
 * (dall'alto) dove comincia l'inchiostro. La cima della E maiuscola è piatta;
 * l'accento della È, nei caratteri dei trailer, è un cuneo stretto attaccato
 * sopra: la fa sporgere di qualche pixel su un tratto corto. Vision lo legge
 * come E. Torna i pixel di sporgenza (0 se è piatta o se a sporgere è mezza lettera).
 */
export function sporgenza(cime) {
  const v = cime.filter(c => c >= 0).sort((a, b) => a - b);
  if (v.length < 5) return 0;
  const piano = v[Math.floor(v.length / 2)];
  const sopra = v.filter(c => c < piano - 2).length;
  if (sopra > v.length * 0.4) return 0;
  return piano - v[0];
}

/** Abbastanza per dire «accento»: almeno 3 pixel e l'1,2 % dell'altezza della riga (le tonde sporgono meno, ma qui si misura la E piatta). */
export function conAccento(sporge, altezza) {
  return sporge >= Math.max(3, 0.012 * altezza);
}

/**
 * Le parole maiuscole che senza accento non esistono (o quasi): Vision li
 * perde anche in fondo alla parola («È GIA UN CULT»). Solo parole sicure:
 * niente «NE», «DA», «LA», che hanno senso anche senza.
 */
const PAROLE_ACCENTATE = Object.fromEntries([
  'GIÀ', 'PIÙ', 'PERCHÉ', 'POICHÉ', 'AFFINCHÉ', 'BENCHÉ', 'NÉ', 'CIOÈ', 'COSÌ', 'PERÒ', 'PUÒ', 'FINCHÉ', 'LASSÙ', 'LAGGIÙ', 'QUAGGIÙ',
  'CITTÀ', 'VERITÀ', 'ETÀ', 'LIBERTÀ', 'UMANITÀ', 'REALTÀ', 'NOVITÀ', 'QUALITÀ', 'INTENSITÀ', 'ORIGINALITÀ', 'CRUDELTÀ', 'IDENTITÀ',
  'SENSIBILITÀ', 'MATURITÀ', 'MODERNITÀ', 'VITALITÀ', 'FELICITÀ', 'COMICITÀ', 'CREATIVITÀ', 'ATTUALITÀ', 'SINCERITÀ', 'BONTÀ', 'BELTÀ',
  'FRAGILITÀ', 'COMPLESSITÀ', 'SEMPLICITÀ', 'AUTENTICITÀ',
].map(p => [p.normalize('NFD').replace(/[\u0300-\u036f]/g, ''), p]));

/** Le «E» isolate di una frase (anche «E'»), nell'ordine in cui si leggono. */
const E_SOLA = /(^|[\s"“«'’])E(?=\s)/g;

/**
 * Rimette gli accenti: «E'» e «E’» diventano sempre «È»; le altre E isolate
 * solo dove `accenti` (nell'ordine di lettura) dice che sopra c'è il segno.
 */
export function accenta(testo, accenti = []) {
  let n = 0;
  return testo
    .replace(/\p{Lu}+/gu, p => PAROLE_ACCENTATE[p] ?? p)
    .replace(/(^|[\s"“«])E['’](?=\s|$)/g, '$1È')
    .replace(E_SOLA, (m, prima) => (accenti[n++] ? `${prima}È` : m));
}

// ── Doppioni e cartelli ─────────────────────────────────────────────────────

/**
 * Senza la firma attaccata in fondo: quando Vision perde la virgoletta di
 * chiusura, un pezzo della testata può finire nella frase («… E PROFANA FAIR»
 * con la firma «-VANITY FAIR»). Si tolgono le ultime parole che sono parole della testata.
 */
export function senzaFirma(testo, fonte) {
  const parole = new Set((fonte ?? '').split(/\s+/).map(chiave).filter(p => p.length > 1));
  if (!parole.size) return testo;
  const pezzi = testo.split(/\s+/);
  while (pezzi.length > 2 && parole.has(chiave(pezzi[pezzi.length - 1]))) pezzi.pop();
  return pezzi.join(' ').replace(/\s*[,;:]+$/, '');
}

/**
 * Le citazioni da tenere: una sola per frase (la stessa schermata riletta due
 * volte o in due trailer), e niente cartelli col titolo del film («THE
 * SUBSTANCE» sotto i nomi degli attori non è una citazione). A parità resta
 * quella con lo sfondo, poi quella con la testata.
 */
export function uniche(citazioni, titoli = []) {
  const vietate = new Set(titoli.map(chiave).filter(Boolean));
  const viste = new Map();
  citazioni = citazioni.map(c => ({ ...c, testo: senzaFirma(c.testo, c.fonte) }));
  for (const c of citazioni) {
    const k = chiave(c.testo);
    if (!k || vietate.has(k)) continue;
    const prima = viste.get(k);
    const punti = x => (x.fondale ? 2 : 0) + (x.fonte ? 1 : 0);
    if (!prima || punti(c) > punti(prima)) viste.set(k, c);
  }
  // L'ordine del trailer, non quello delle sostituzioni.
  return citazioni.filter(c => viste.get(chiave(c.testo)) === c);
}
