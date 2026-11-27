import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import { formatShowDayLong, formatShowTime } from '../home/date';

/**
 * Il biglietto in PDF, disegnato sul server (nella v1 era una pagina nascosta
 * fotografata nel browser con html2canvas, con la chiave TMDB in chiaro).
 * Una pagina A5 orizzontale per posto: a sinistra il fotogramma del film nel
 * buio, il logo, quando, la sala e il posto; a destra la matrice col QR, che
 * all'ingresso si legge come quello di Pretix (è lo stesso segreto).
 */
export interface DatiBiglietto {
  titolo: string;
  /** ISO, inizio dello spettacolo. */
  data: string;
  sala: string;
  durata?: number | null;
  regia?: string;
  fondale?: string;
  logo?: string;
  ordine: string;
  posti: { segreto: string; posto: string }[];
}

const A5 = { w: 595.28, h: 419.53 };
const MATRICE = 190;
const NERO = rgb(0.06, 0.045, 0.035);
const CREMA = rgb(0.95, 0.93, 0.89);
const CREMA_2 = rgb(0.8, 0.76, 0.7);
const BRACE = rgb(0.91, 0.45, 0.23);

const tmdb = (p: string, misura: string) => (p.startsWith('http') ? p : `https://image.tmdb.org/t/p/${misura}${p}`);

async function scarica(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

async function immagine(doc: PDFDocument, url: string): Promise<PDFImage | null> {
  const b = await scarica(url);
  if (!b) return null;
  try {
    // JPEG comincia con FF D8, PNG con 89 50.
    return b[0] === 0xff ? await doc.embedJpg(b) : await doc.embedPng(b);
  } catch {
    return null;
  }
}

/** Il testo che sta nella larghezza: si accorcia con i puntini. */
function cheSta(t: string, f: PDFFont, corpo: number, larghezza: number) {
  if (f.widthOfTextAtSize(t, corpo) <= larghezza) return t;
  let s = t;
  while (s.length > 1 && f.widthOfTextAtSize(`${s}…`, corpo) > larghezza) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** Le parole su più righe, al massimo `righe`. */
function aCapo(t: string, f: PDFFont, corpo: number, larghezza: number, righe: number): string[] {
  const out: string[] = [];
  let riga = '';
  for (const p of t.split(/\s+/)) {
    const prova = riga ? `${riga} ${p}` : p;
    if (f.widthOfTextAtSize(prova, corpo) <= larghezza) riga = prova;
    else { if (riga) out.push(riga); riga = p; }
  }
  if (riga) out.push(riga);
  if (out.length > righe) { out.length = righe; out[righe - 1] = cheSta(`${out[righe - 1]}…`, f, corpo, larghezza); }
  return out;
}

/** I caratteri che i font standard del PDF non sanno scrivere diventano i più vicini. */
/** "Fila B - Posto 5" → "Fila B · Posto 5". */
const posto = (t: string) => t.replace(/\s+-\s+/g, ' · ');
const pulito = (t: string) => t.replace(/[‐-―]/g, '-').replace(/[“”]/g, '"').replace(/[^\x20-\x7e -ÿ’·…€]/g, '');

export async function disegnaBiglietto(d: DatiBiglietto): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Biglietto ${d.ordine} — ${d.titolo}`);
  doc.setAuthor('Vestri Cinema');
  const [testo, forte, titoli] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.TimesRoman),
  ]);
  const [fondale, logo] = await Promise.all([
    d.fondale ? immagine(doc, tmdb(d.fondale, 'w1280')) : null,
    d.logo ? immagine(doc, tmdb(d.logo, 'w500')) : null,
  ]);

  const titolo = pulito(d.titolo);
  const quando = `${formatShowDayLong(d.data)} · ${formatShowTime(d.data)}`;
  const dettagli = [d.sala, d.durata ? `${d.durata} min` : '', d.regia ? `regia di ${d.regia}` : ''].filter(Boolean).map(pulito).join(' · ');

  for (const p of d.posti) {
    const pagina = doc.addPage([A5.w, A5.h]);
    const largo = A5.w - MATRICE;
    pagina.drawRectangle({ x: 0, y: 0, width: A5.w, height: A5.h, color: NERO });

    // Il fotogramma, a coprire la parte sinistra, nel buio della sala.
    if (fondale) {
      const s = Math.max(largo / fondale.width, A5.h / fondale.height);
      const w = fondale.width * s, h = fondale.height * s;
      pagina.drawImage(fondale, { x: (largo - w) / 2, y: (A5.h - h) / 2, width: w, height: h });
      pagina.drawRectangle({ x: 0, y: 0, width: largo, height: A5.h, color: NERO, opacity: 0.62 });
      // In basso più buio, dove sta il testo: una sfumatura a gradini (i PDF semplici non ne hanno).
      for (let i = 0; i < 12; i++) pagina.drawRectangle({ x: 0, y: 0, width: largo, height: A5.h * (0.62 - i * 0.04), color: NERO, opacity: 0.07 });
    }

    const m = 32;
    pagina.drawText('VESTRI CINEMA', { x: m, y: A5.h - m - 8, size: 9, font: forte, color: CREMA });
    pagina.drawText('PROIEZIONE GRATUITA', { x: largo - m - forte.widthOfTextAtSize('PROIEZIONE GRATUITA', 7) - 14, y: A5.h - m - 7, size: 7, font: forte, color: BRACE });

    // Il film: il logo se c'è, se no il titolo.
    let y = 232;
    if (logo) {
      const s = Math.min(300 / logo.width, 84 / logo.height);
      pagina.drawImage(logo, { x: m, y, width: logo.width * s, height: logo.height * s });
    } else {
      const righe = aCapo(titolo, titoli, 34, largo - 2 * m, 2);
      righe.forEach((r, i) => pagina.drawText(r, { x: m, y: y + 40 - i * 36, size: 34, font: titoli, color: CREMA }));
    }

    y = 196;
    pagina.drawText(cheSta(pulito(quando), forte, 15, largo - 2 * m), { x: m, y, size: 15, font: forte, color: CREMA });
    pagina.drawText(cheSta(dettagli, testo, 10, largo - 2 * m), { x: m, y: y - 20, size: 10, font: testo, color: CREMA_2 });

    pagina.drawRectangle({ x: m, y: 132, width: 28, height: 2, color: BRACE });
    pagina.drawText('POSTO', { x: m, y: 112, size: 7.5, font: forte, color: CREMA_2 });
    pagina.drawText(cheSta(pulito(posto(p.posto)), titoli, 30, largo - 2 * m), { x: m, y: 82, size: 30, font: titoli, color: CREMA });

    pagina.drawText(`Ordine ${d.ordine}  ·  Mostra il QR all'ingresso: vale per una persona.`, { x: m, y: m, size: 8, font: testo, color: CREMA_2 });

    await matrice(doc, pagina, p, d.ordine, testo, forte);
  }
  return doc.save();
}

/** La matrice a destra, chiara, col QR al centro. */
async function matrice(doc: PDFDocument, pagina: PDFPage, p: { segreto: string; posto: string }, ordine: string, testo: PDFFont, forte: PDFFont) {
  const x = A5.w - MATRICE;
  pagina.drawRectangle({ x, y: 0, width: MATRICE, height: A5.h, color: CREMA });
  // La linea tratteggiata dello strappo.
  for (let y = 8; y < A5.h; y += 10) pagina.drawRectangle({ x: x - 0.5, y, width: 1, height: 5, color: CREMA_2 });

  const qr = await doc.embedPng(await QRCode.toBuffer(p.segreto, { errorCorrectionLevel: 'M', margin: 0, width: 600, color: { dark: '#0f0b09', light: '#00000000' } }));
  const lato = 140;
  const qx = x + (MATRICE - lato) / 2, qy = (A5.h - lato) / 2 + 22;
  pagina.drawImage(qr, { x: qx, y: qy, width: lato, height: lato });

  const centro = (t: string, f: PDFFont, corpo: number, y: number, colore = NERO) =>
    pagina.drawText(t, { x: x + (MATRICE - f.widthOfTextAtSize(t, corpo)) / 2, y, size: corpo, font: f, color: colore });
  centro('INGRESSO', forte, 8, qy + lato + 22, NERO);
  centro(cheSta(pulito(posto(p.posto)), forte, 13, MATRICE - 24), forte, 13, qy - 30);
  centro(ordine, testo, 9, qy - 48, rgb(0.35, 0.32, 0.29));
}
