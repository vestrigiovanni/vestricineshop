'use server';

import prisma from '@/lib/prisma';
import { MovieOverride } from '@/services/db.service';

/**
 * SOURCE OF TRUTH: Fetches movie metadata from the Neon database
 * for a specific sub-event. This bypasses any Pretix API caching.
 */
export async function getTrustedSubeventMetadata(subeventId: number) {
  try {
    // 1. Get the tmdbId from PretixSync table
    const syncData = await prisma.pretixSync.findUnique({
      where: { pretixId: subeventId },
      select: { tmdbId: true }
    });

    if (!syncData?.tmdbId) {
      return null;
    }

    // 2. Get the MovieOverride for this tmdbId
    const override = await prisma.movieOverride.findUnique({
      where: { tmdbId: syncData.tmdbId }
    });

    if (!override) return null;

    // 3. Construct the clean metadata object
    return {
      tmdbId: syncData.tmdbId,
      rating: (override as any).customRating || 'T',
      versionLanguage: (override as any).versionLanguage || 'ITA',
      subtitles: (override as any).subtitles || 'NESSUNO',
      title: (override as any).customTitle,
      posterPath: (override as any).customPosterPath,
      backdropPath: (override as any).customBackdropPath,
      runtime: (override as any).runtime || 120,
    };
  } catch (error) {
    console.error(`[Booking Actions] Error fetching trusted metadata for ${subeventId}:`, error);
    return null;
  }
}
