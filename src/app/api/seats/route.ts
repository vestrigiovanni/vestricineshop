import { NextRequest, NextResponse } from 'next/server';
import { getSubEventSeats } from '@/services/pretix';

export const revalidate = 0; // Real-time seat layouts

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subeventIdStr = searchParams.get('subeventId');

    if (!subeventIdStr) {
      return NextResponse.json(
        { success: false, error: 'Missing subeventId parameter' },
        { status: 400 }
      );
    }

    const subeventId = parseInt(subeventIdStr, 10);
    if (isNaN(subeventId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid subeventId parameter' },
        { status: 400 }
      );
    }

    const seats = await getSubEventSeats(subeventId);
    return NextResponse.json({ success: true, seats });
  } catch (error: any) {
    console.error('[API Seats] Error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch seats' },
      { status: 500 }
    );
  }
}
