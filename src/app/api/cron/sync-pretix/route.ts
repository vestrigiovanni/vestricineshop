import { NextResponse } from 'next/server';
import { syncPretixToDatabase } from '@/services/sync.service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  // Check authorization header for Vercel Cron
  const authHeader = request.headers.get('authorization');
  const isManual = request.url.includes('manual=true');
  const forceMetadata = request.url.includes('forceMetadata=true');

  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
    !isManual
  ) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const result = await syncPretixToDatabase({ forceMetadataRefresh: forceMetadata });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[CRON] Sync failed:', error);
    return NextResponse.json({ success: false, error: 'Sync failed' }, { status: 500 });
  }
}
