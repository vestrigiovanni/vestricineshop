import prisma from '@/lib/prisma';
import { getOverrides, getShortTermCache, setShortTermCache } from './db.service';

/**
 * SOURCE OF TRUTH: Reads availability from the PretixSync table (Neon DB).
 * This prevents 429 Too Many Requests errors by avoiding massive global API calls.
 */
export async function getAvailabilityMap(): Promise<Record<number, boolean>> {
  const CACHE_KEY = 'availability_map_v5';
  const cached = getShortTermCache(CACHE_KEY, 30);
  if (cached) return cached;

  try {
    // 1. Get all active projections from DB and manual overrides
    const [projections, overrides] = await Promise.all([
      prisma.pretixSync.findMany({
        where: { active: true },
        select: { pretixId: true, isSoldOut: true, tmdbId: true }
      }),
      getOverrides()
    ]);

    const availabilityMap: Record<number, boolean> = {};

    // Extract TMDB IDs that are manually marked as Sold Out
    const manualSoldOutTmdbIds = new Set(
      Object.entries(overrides)
        .filter(([_, ov]) => ov.manualSoldOut)
        .map(([tmdbId, _]) => tmdbId)
    );

    projections.forEach((p) => {
      // 1. Check Manual Override (Global movie sold out)
      if (p.tmdbId && manualSoldOutTmdbIds.has(p.tmdbId)) {
        availabilityMap[p.pretixId] = true;
        return;
      }

      // 2. Use DB state (Synced from Pretix surgically)
      availabilityMap[p.pretixId] = p.isSoldOut;
    });

    setShortTermCache(CACHE_KEY, availabilityMap);
    return availabilityMap;
  } catch (error) {
    console.error('[Availability Service] Error reading from DB:', error);
    return {};
  }
}
