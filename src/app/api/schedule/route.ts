import { NextResponse } from 'next/server';
import { getDisplayData } from '@/actions/displayActions';

export const revalidate = 0; // Disable Vercel caching to get real-time seat availability

export async function GET() {
  try {
    const schedule = await getDisplayData();
    return NextResponse.json({ success: true, schedule });
  } catch (error: any) {
    console.error('[API Schedule] Error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch schedule' },
      { status: 500 }
    );
  }
}
