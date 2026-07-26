import { NextResponse } from 'next/server';
import { apiError, requireApiKey } from '@/services/apiAuth';
import { planningGetRooms } from '@/actions/planningActions';

export const dynamic = 'force-dynamic';

/** GET /api/planning/rooms → le sale in cui si può programmare. */
export async function GET(request: Request) {
  const denied = requireApiKey(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ rooms: await planningGetRooms() });
  } catch (err) {
    return apiError(err);
  }
}
