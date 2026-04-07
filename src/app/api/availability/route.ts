import { NextResponse } from 'next/server';
import { listSubEvents, listQuotas } from '@/services/pretix';
import { ITEM_INTERO_ID } from '@/constants/pretix';

export const revalidate = 0; // Disable cache for this API to ensure freshness

export async function GET() {
  try {
    // 1. Get all future sub-events
    const rawSubEvents = await listSubEvents(true);

    // 2. Fetch all quotas in parallel
    const quotaResults = await Promise.all(
      rawSubEvents.map(se => listQuotas(se.id))
    );

    // 3. Build the availability map
    const availabilityMap: Record<number, boolean> = {};

    rawSubEvents.forEach((se, index) => {
      const seQuotas = quotaResults[index] || [];

      // Find the Intero quota
      const interoQuota = seQuotas.find((q: any) =>
        Array.isArray(q.items) && q.items.includes(ITEM_INTERO_ID)
      );

      // Same logic as in page.tsx
      const isSoldOut = interoQuota
        ? (interoQuota.available === false || (interoQuota.available_number !== null && interoQuota.available_number <= 0))
        : (se.best_availability_state === 'sold_out');

      availabilityMap[se.id] = !!isSoldOut;
    });

    return NextResponse.json(availabilityMap);
  } catch (error) {
    console.error('[API Availability] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500 });
  }
}
