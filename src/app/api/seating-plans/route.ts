import { NextResponse } from 'next/server';
import { getSeatingPlansMap } from '@/services/pretix';

/**
 * GET /api/seating-plans
 * Returns a mapping of seating plan ID → name for client-side use.
 * This is needed because getSeatingPlansMap() uses a server-side secret token
 * and cannot be called directly from client components.
 */
export async function GET() {
  try {
    const map = await getSeatingPlansMap();
    return NextResponse.json(map, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    console.error('[API] Failed to fetch seating plans map:', error);
    return NextResponse.json({}, { status: 500 });
  }
}
