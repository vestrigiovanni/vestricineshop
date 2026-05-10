import { NextRequest, NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pretix-pdf?url=<pretix_download_url>
//
// Proxy autenticato per i PDF di biglietti Pretix.
// Gestisce automaticamente il polling del 409 (PDF in generazione).
//
// Il browser NON può accedere direttamente alle URL Pretix perché:
//   1. Richiedono l'header Authorization: Token ...
//   2. Possono rispondere 409 mentre il PDF è in rendering (richiede polling)
//
// Questa route risolve entrambi i problemi server-side e streamma il PDF finale.
// ─────────────────────────────────────────────────────────────────────────────

const PRETIX_TOKEN = process.env.PRETIX_TOKEN;
const PRETIX_API_URL = 'https://pretix.eu/api/v1';
const PRETIX_ORGANIZER = 'vestri';
const PRETIX_EVENT = 'npkez';

const MAX_ATTEMPTS = 12;     // max polling attempts
const POLL_DELAY_MS = 2000;  // 2s between retries (Pretix recommendation)

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'Parametro url mancante' }, { status: 400 });
  }

  // Security: only allow Pretix URLs to prevent SSRF
  if (!targetUrl.startsWith(PRETIX_API_URL) && !targetUrl.startsWith('https://pretix.eu/')) {
    return NextResponse.json({ error: 'URL non autorizzata' }, { status: 403 });
  }

  if (!PRETIX_TOKEN) {
    return NextResponse.json({ error: 'PRETIX_TOKEN non configurato' }, { status: 500 });
  }

  const authValue = PRETIX_TOKEN.startsWith('Token ') ? PRETIX_TOKEN : `Token ${PRETIX_TOKEN}`;

  console.log(`[PretixPDF] Richiesta proxy per: ${targetUrl}`);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(targetUrl, {
        headers: {
          'Authorization': authValue,
          'Accept': 'application/pdf, application/json, */*',
        },
        cache: 'no-store',
      });

      // 409 = PDF non ancora generato, ritentiamo
      if (response.status === 409) {
        const body = await response.json().catch(() => ({}));
        console.log(`[PretixPDF] Tentativo ${attempt}/${MAX_ATTEMPTS}: 409 - ${body?.detail || 'not ready'}. Attendo ${POLL_DELAY_MS}ms...`);
        if (attempt < MAX_ATTEMPTS) {
          await sleep(POLL_DELAY_MS);
          continue;
        }
        return NextResponse.json(
          { error: 'Pretix impiega troppo tempo a generare il PDF. Riprova tra qualche secondo.' },
          { status: 504 }
        );
      }

      // 401 / 403 = Token non valido o accesso negato
      if (response.status === 401 || response.status === 403) {
        console.error(`[PretixPDF] Errore autenticazione (${response.status})`);
        return NextResponse.json(
          { error: `Accesso negato da Pretix (${response.status}). Verifica il token API.` },
          { status: response.status }
        );
      }

      // 404 = Biglietto non trovato
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Biglietto non trovato su Pretix (404).' },
          { status: 404 }
        );
      }

      // Qualsiasi altro errore HTTP
      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        console.error(`[PretixPDF] Errore Pretix ${response.status}: ${errText}`);
        return NextResponse.json(
          { error: `Pretix ha risposto con errore ${response.status}` },
          { status: 502 }
        );
      }

      // ── Successo! Streamma il PDF al browser ────────────────────────────────
      const contentType = response.headers.get('content-type') || 'application/pdf';
      const contentLength = response.headers.get('content-length');
      const contentDisposition = response.headers.get('content-disposition');

      console.log(`[PretixPDF] ✅ PDF pronto al tentativo ${attempt}. ContentType: ${contentType}`);

      const headers: Record<string, string> = {
        'Content-Type': contentType,
        'Cache-Control': 'private, no-cache',
      };

      if (contentLength) headers['Content-Length'] = contentLength;
      if (contentDisposition) {
        headers['Content-Disposition'] = contentDisposition;
      } else {
        // Default: apri nel browser (inline), non scaricare
        headers['Content-Disposition'] = 'inline; filename="biglietto.pdf"';
      }

      // Stream the PDF body directly
      return new NextResponse(response.body, {
        status: 200,
        headers,
      });

    } catch (error: any) {
      console.error(`[PretixPDF] Errore tentativo ${attempt}:`, error.message);
      if (attempt >= MAX_ATTEMPTS) {
        return NextResponse.json(
          { error: `Errore di connessione a Pretix: ${error.message}` },
          { status: 502 }
        );
      }
      await sleep(POLL_DELAY_MS);
    }
  }

  return NextResponse.json(
    { error: 'Impossibile ottenere il PDF dopo tutti i tentativi.' },
    { status: 504 }
  );
}
