import { listSubEvents, listQuotas } from './pretix';
import { ITEM_INTERO_ID, ITEM_VIP_ID } from '@/constants/pretix';
import { getOverrides, getShortTermCache, setShortTermCache } from './db.service';

/**
 * Optimized availability map:
 * 1. Checks short-term cache (60s)
 * 2. Fetches sub-events and quotas in parallel
 * 3. Incorporates manual overrides from DB
 * 4. Removes slow per-seat fetching (critical for speed)
 */
export async function getAvailabilityMap(): Promise<Record<number, boolean>> {
  const CACHE_KEY = 'availability_map_v3';
  const cached = getShortTermCache(CACHE_KEY, 60); // 60 seconds TTL
  if (cached) {
    return cached;
  }

  try {
    // 1. Get sub-events, quotas, and overrides in parallel
    const [rawSubEvents, allQuotas, overrides] = await Promise.all([
      listSubEvents(true),
      listQuotas(),
      getOverrides()
    ]);

    const availabilityMap: Record<number, boolean> = {};

    // Group quotas by sub-event for efficient lookup
    const quotasBySubevent = new Map<number, any[]>();
    allQuotas.forEach((q: any) => {
      if (q.subevent) {
        if (!quotasBySubevent.has(q.subevent)) {
          quotasBySubevent.set(q.subevent, []);
        }
        quotasBySubevent.get(q.subevent)!.push(q);
      }
    });

    // Extract TMDB IDs that are manually marked as Sold Out
    const manualSoldOutTmdbIds = new Set(
      Object.entries(overrides)
        .filter(([_, ov]) => ov.manualSoldOut)
        .map(([tmdbId, _]) => tmdbId)
    );

    rawSubEvents.forEach((se) => {
      // --- Priority 0: Manual Override via TMDB ID ---
      let tmdbId: string | null = null;
      if (se.comment) {
        try {
          const commentData = JSON.parse(se.comment);
          tmdbId = commentData.tmdbId?.toString();
        } catch (e) {
          const tmdbIdMatch = se.comment.match(/TMDB_ID:(\d+)/);
          tmdbId = tmdbIdMatch ? tmdbIdMatch[1] : null;
        }
      }

      if (tmdbId && manualSoldOutTmdbIds.has(tmdbId)) {
        availabilityMap[se.id] = true;
        return;
      }

      // --- Priority 1: Pretix Best Availability State ---
      if (se.best_availability_state === 'sold_out' || (se.active && se.presale_is_running === false)) {
        availabilityMap[se.id] = true;
        return;
      }

      // --- Priority 2: Quotas (INTERO and VIP) ---
      const seQuotas = quotasBySubevent.get(se.id) || [];
      const relevantQuotas = seQuotas.filter((q: any) => 
        Array.isArray(q.items) && (q.items.includes(ITEM_INTERO_ID) || q.items.includes(ITEM_VIP_ID))
      );

      if (relevantQuotas.length > 0) {
        const totalQuotaAvailable = relevantQuotas.reduce((sum: number, q: any) => {
          return sum + (q.available_number !== null ? Math.max(0, q.available_number) : 0);
        }, 0);
        
        const allQuotasUnavailable = relevantQuotas.every((q: any) => q.available === false);
        
        if (allQuotasUnavailable || totalQuotaAvailable <= 0) {
          availabilityMap[se.id] = true;
          return;
        }
      }

      // Default: Available
      availabilityMap[se.id] = false;
    });

    // Cache the result in the short-term cache
    setShortTermCache(CACHE_KEY, availabilityMap);

    return availabilityMap;
  } catch (error) {
    console.error('[Availability Service] Error:', error);
    return {};
  }
}
