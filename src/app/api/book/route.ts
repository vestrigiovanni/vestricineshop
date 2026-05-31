import { NextRequest, NextResponse } from 'next/server';
import { finalizeBooking } from '@/services/pretix';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, seats, subeventId } = body;

    // Validation
    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    if (!seats || !Array.isArray(seats) || seats.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one seat selection is required' },
        { status: 400 }
      );
    }

    if (!subeventId) {
      return NextResponse.json(
        { success: false, error: 'SubeventId is required' },
        { status: 400 }
      );
    }

    const subeventIdNum = parseInt(subeventId, 10);
    if (isNaN(subeventIdNum)) {
      return NextResponse.json(
        { success: false, error: 'Invalid subeventId' },
        { status: 400 }
      );
    }

    // Call Pretix service securely (with server-side token hidden from client)
    const order = await finalizeBooking(email, seats, subeventIdNum);

    return NextResponse.json({ success: true, order });
  } catch (error: any) {
    console.error('[API Book] Error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to complete booking' },
      { status: 500 }
    );
  }
}
