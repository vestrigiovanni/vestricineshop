import { NextResponse } from 'next/server';
import { listSubEvents, listQuotas, getSubEventSeats, limitConcurrency } from '@/services/pretix';
import { ITEM_INTERO_ID, ITEM_VIP_ID } from '@/constants/pretix';

export const revalidate = 0; // Disable cache for this API to ensure freshness

export async function GET() {
  try {
    // 1. Get all future sub-events
    const rawSubEvents = await listSubEvents(true);

    // 2. Fetch all quotas and SEATS with limited concurrency (max 3 at a time)
    // We process each sub-event sequentially in terms of its own data, 
    // but run multiple sub-events in parallel up to the limit.
    const results = await limitConcurrency(
      rawSubEvents.map(se => async () => {
        const [quotas, seats] = await Promise.all([
          listQuotas(se.id),
          getSubEventSeats(se.id)
        ]);
        return { subeventId: se.id, quotas, seats };
      }),
      3
    );

    // 3. Build the availability map
    const availabilityMap: Record<number, boolean> = {};

    rawSubEvents.forEach((se, index) => {
      // Find results for this sub-event
      const seResult = results.find(r => r.subeventId === se.id);
      const seQuotas = seResult?.quotas || [];
      const seSeats = seResult?.seats || [];

      // 1. Multi-product quota check (PRIMARY TRUTH)
      let quotaSoldOut = false;
      
      // RULE: We ONLY mark as Sold Out if we HAVE valid quota data and it's explicitly 0.
      if (!seQuotas || seQuotas.length === 0) {
        quotaSoldOut = false;
      } else {
        const relevantQuotas = seQuotas.filter((q: any) => 
          Array.isArray(q.items) && q.items.some((id: any) => 
            String(id) === String(ITEM_INTERO_ID) || String(id) === String(ITEM_VIP_ID)
          )
        );

        if (relevantQuotas.length > 0) {
          const hasUnlimited = relevantQuotas.some((q: any) => q.available_number === null);
          if (hasUnlimited) {
            quotaSoldOut = false;
          } else {
            const totalQuotaAvailable = relevantQuotas.reduce((sum: number, q: any) => sum + (Number(q.available_number) || 0), 0);
            if (totalQuotaAvailable <= 0) {
              quotaSoldOut = true;
            }
          }
        }
      }

      // 2. Physical capacity check (SECONDARY TRUTH / FALLBACK)
      let seatsSoldOut = false;
      if (Array.isArray(seSeats) && seSeats.length > 0) {
        const availableSeatsCount = seSeats.filter((s: any) => 
          s.available !== false && !s.blocked && s.orderposition === null && s.cartposition === null
        ).length;
        if (availableSeatsCount <= 0) {
          seatsSoldOut = true;
        }
      }

      // 3. Overall Pretix State
      const pretixStateSoldOut = se.best_availability_state === 'sold_out' || (se.active && se.presale_is_running === false);

      // Final decision: Only sold out if we are SURE. Default is false (Available).
      const isSoldOut = pretixStateSoldOut || quotaSoldOut || seatsSoldOut;

      availabilityMap[se.id] = !!isSoldOut;
    });

    return NextResponse.json(availabilityMap);
  } catch (error) {
    console.error('[API Availability] Critical Error (Fail-Safe Triggered):', error);
    
    // FAIL-SAFE: If anything fails, return an empty object or a map where everything is Available (false)
    // This allows the frontend to show the film cards and let users try the seating map.
    try {
      const rawSubEvents = await listSubEvents(true);
      const failSafeMap: Record<number, boolean> = {};
      rawSubEvents.forEach(se => { failSafeMap[se.id] = false; });
      return NextResponse.json(failSafeMap);
    } catch (e) {
      // Last resort fallback
      return NextResponse.json({});
    }
  }

}
