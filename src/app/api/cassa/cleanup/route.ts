import { NextResponse } from 'next/server';
import { cassaCleanupOldPDFs } from '@/actions/cassaActions';

/**
 * GET /api/cassa/cleanup
 * Deletes PDF files and archive records older than 7 days.
 * Can be triggered manually or via a scheduled cron.
 */
export async function GET() {
  try {
    const result = await cassaCleanupOldPDFs();
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Cleanup error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
