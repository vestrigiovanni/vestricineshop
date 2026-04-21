import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/print/thermal
//
// Accetta due formati:
//  A) { imageData: "data:image/png;base64,..." } — stampa PNG via lpr (percorso principale)
//  B) { movieTitle, ... }                        — stampa testo (fallback)
//
// La stampante è: Printer_printer_80 (Munbyn POS-80, USB, 57mm)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PRINTER = 'Printer_printer_80';
const PAPER_WIDTH_MM  = 57;
const PAPER_HEIGHT_MM = 250; // Altezza generosa per carta a rotolo

export async function POST(request: NextRequest) {
  let tempFilePath: string | null = null;

  try {
    const body = await request.json();
    const printerName = body.printerName || DEFAULT_PRINTER;
    const timestamp   = Date.now();

    // ── Percorso A: IMAGE (html2canvas PNG) ────────────────────────────────
    if (body.imageData) {
      const base64 = (body.imageData as string).replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64, 'base64');

      tempFilePath = join(tmpdir(), `vc_ticket_${timestamp}.png`);
      await writeFile(tempFilePath, buffer);

      // Stampa PNG: Rimosso fit-to-page per evitare ingrandimenti eccessivi.
      // media=Custom.58x297mm è una dimensione standard che molte stampanti termiche accettano meglio.
      const lprCmd = `lpr -P "${printerName}" -o media=Custom.58x297mm "${tempFilePath}"`;
      console.log(`[THERMAL] PNG print: ${lprCmd}`);
      const { stderr } = await execAsync(lprCmd);
      if (stderr?.trim()) console.warn('[THERMAL] lpr warning:', stderr);

      console.log(`[THERMAL] ✅ Immagine inviata (ordine: ${body.orderCode || '?'})`);
      return NextResponse.json({ ok: true, message: `Biglietto inviato a ${printerName}` });
    }

    // ── Percorso B: TESTO (fallback) ───────────────────────────────────────
    if (!body.movieTitle || !body.orderCode) {
      return NextResponse.json(
        { ok: false, error: 'imageData o (movieTitle + orderCode) obbligatori' },
        { status: 400 }
      );
    }

    const ticketText = buildTextTicket(body);
    tempFilePath = join(tmpdir(), `vc_ticket_${timestamp}.txt`);
    await writeFile(tempFilePath, ticketText, 'utf-8');

    const lprCmd = `lpr -P "${printerName}" "${tempFilePath}"`;
    console.log(`[THERMAL] TEXT print: ${lprCmd}`);
    await execAsync(lprCmd);

    console.log(`[THERMAL] ✅ Testo inviato (ordine: ${body.orderCode})`);
    return NextResponse.json({ ok: true, message: `Testo inviato a ${printerName}` });

  } catch (error: any) {
    console.error('[THERMAL] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Errore durante la stampa' },
      { status: 500 }
    );
  } finally {
    if (tempFilePath) {
      try { await unlink(tempFilePath); } catch { /* ignore */ }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback text ticket (plain text, ~24 colonne per 57mm)
// ─────────────────────────────────────────────────────────────────────────────
function buildTextTicket(data: Record<string, string>): string {
  const W = 24;
  const c = (s: string) => {
    const t = String(s).slice(0, W);
    const pad = Math.max(0, Math.floor((W - t.length) / 2));
    return ' '.repeat(pad) + t;
  };
  const L = '========================';
  const D = '- - - - - - - - - - - -';

  return [
    '',
    c('VESTRI CINEMA'),
    L,
    c((data.movieTitle || '').toUpperCase()),
    L,
    '',
    c(data.screening || ''),
    c(data.roomName || ''),
    D,
    c(`FILA ${data.rowLabel || '-'}  POSTO ${data.seatLabel || '-'}`),
    D,
    c(data.orderCode || ''),
    '',
    c(`EUR ${parseFloat(data.price || '0').toFixed(2)}`),
    '',
    c('SCONTRINO DI CORTESIA'),
    L,
    c('VESTRICINEMA.IT'),
    c(data.printDate || ''),
    '', '', '', '',
  ].join('\n');
}
