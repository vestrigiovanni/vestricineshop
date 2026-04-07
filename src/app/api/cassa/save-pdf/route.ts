import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const ARCHIVE_DIR = path.join(process.cwd(), 'public', 'tickets', 'cassa');

/**
 * POST /api/cassa/save-pdf
 * Body: { ticketId: string; pdfBase64: string }
 * Saves the PDF blob to /public/tickets/cassa/<ticketId>.pdf
 */
export async function POST(req: NextRequest) {
  try {
    const { ticketId, pdfBase64 } = await req.json();

    if (!ticketId || !pdfBase64) {
      return NextResponse.json({ error: 'Missing ticketId or pdfBase64' }, { status: 400 });
    }

    if (!fs.existsSync(ARCHIVE_DIR)) {
      fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    }

    // Strip the data:application/pdf;base64, prefix if present
    const base64Data = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const filePath = path.join(ARCHIVE_DIR, `${ticketId}.pdf`);
    fs.writeFileSync(filePath, buffer);

    return NextResponse.json({ success: true, path: `/tickets/cassa/${ticketId}.pdf` });
  } catch (error: any) {
    console.error('Error saving PDF:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
