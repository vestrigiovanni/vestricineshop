import { NextResponse } from 'next/server';
import { syncCompleta } from '@/biglietteria/sync';

export const dynamic = 'force-dynamic';
/** Tutti gli spettacoli futuri, con le pause di Pretix: può metterci un po'. */
export const maxDuration = 300;

/**
 * GET /api/cron/sync-pretix — la sync completa, ogni notte alle 04:00
 * (vercel.json). In produzione serve il segreto del cron di Vercel. Nella v1
 * bastava aggiungere `?manual=true` per lanciarla da qualunque browser: non lo
 * usava nessuno, e qui non c'è più.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    // Senza CRON_SECRET il confronto sarebbe con "Bearer undefined": chiunque
    // l'avrebbe indovinato. Senza segreto, la rotta resta chiusa.
    const segreto = process.env.CRON_SECRET;
    if (!segreto || request.headers.get('authorization') !== `Bearer ${segreto}`) {
      return new Response('Unauthorized', { status: 401 });
    }
  }
  try {
    return NextResponse.json(await syncCompleta());
  } catch (e) {
    console.error('[cron] sync non riuscita:', e);
    return NextResponse.json({ success: false, error: 'Sync failed' }, { status: 500 });
  }
}
