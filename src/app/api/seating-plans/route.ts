import { NextResponse } from 'next/server';
import { sale } from '@/biglietteria/pretix';

/** GET /api/seating-plans — { numero della pianta: nome della sala }, come nella v1. */
export async function GET() {
  try {
    return NextResponse.json(await sale(), { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } });
  } catch (e) {
    console.error('[api/seating-plans]', e);
    return NextResponse.json({}, { status: 500 });
  }
}
