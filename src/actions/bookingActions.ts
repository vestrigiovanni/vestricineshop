'use server';

import prisma from '@/lib/prisma';
import { MovieOverride } from '@/services/db.service';

/**
 * SOURCE OF TRUTH: Fetches movie metadata from the Neon database
 * for a specific sub-event. This bypasses any Pretix API caching.
 */
export async function getTrustedSubeventMetadata(subeventId: number) {
  try {
    // 1. Get the data from PretixSync table
    const syncData = await prisma.pretixSync.findUnique({
      where: { pretixId: subeventId },
      select: { 
        tmdbId: true,
        metaLingua: true,
        metaSottotitoli: true,
        roomName: true
      }
    });

    if (!syncData?.tmdbId) {
      return null;
    }

    // 2. Get the MovieOverride for this tmdbId
    const override = await prisma.movieOverride.findUnique({
      where: { tmdbId: syncData.tmdbId }
    });

    if (!override) return null;

    // 3. Construct the clean metadata object (Standard Tecnico)
    return {
      tmdbId: syncData.tmdbId,
      rating: (override as any).customRating || 'T',
      // Prioritize PretixSync (direct from Pretix) then MovieOverride
      versionLanguage: syncData.metaLingua || (override as any).versionLanguage || 'ITA',
      subtitles: syncData.metaSottotitoli || (override as any).subtitles || 'NESSUNO',
      title: (override as any).customTitle,
      posterPath: (override as any).customPosterPath,
      backdropPath: (override as any).customBackdropPath,
      runtime: (override as any).runtime || 120,
      roomName: syncData.roomName || 'Sala'
    };
  } catch (error) {
    console.error(`[Booking Actions] Error fetching trusted metadata for ${subeventId}:`, error);
    return null;
  }
}

/**
 * Triggered by the client when it detects a "Sold Out" state 
 * during the booking process. Ensures the database is synchronized.
 */
export async function reportSoldOut(subeventId: number) {
  try {
    const { syncSingleSubevent } = await import('@/services/sync.service');
    await syncSingleSubevent(subeventId);
    return { success: true };
  } catch (error) {
}

/**
 * Real-time verification of quota availability.
 * Used before opening the checkout to prevent race conditions.
 */
export async function verifyQuotaAvailability(subeventId: number): Promise<{ isSoldOut: boolean, availableSeats: number | null }> {
  try {
    const { listQuotas } = await import('@/services/pretix');
    const { ITEM_INTERO_ID, ITEM_VIP_ID } = await import('@/constants/pretix');
    
    const quotas = await listQuotas(subeventId);
    const relevantQuotas = quotas.filter((q: any) => 
      Array.isArray(q.items) && (q.items.includes(ITEM_INTERO_ID) || q.items.includes(ITEM_VIP_ID))
    );

    let totalQuotaAvailable = 0;
    let allQuotasUnavailable = true;
    
    if (relevantQuotas.length > 0) {
      totalQuotaAvailable = relevantQuotas.reduce((sum: number, q: any) => {
        return sum + (q.available_number !== null ? Math.max(0, q.available_number) : 0);
      }, 0);
      allQuotasUnavailable = relevantQuotas.every((q: any) => q.available === false);
    }
    
    const isSoldOut = allQuotasUnavailable || totalQuotaAvailable <= 0;
    
    return { isSoldOut, availableSeats: totalQuotaAvailable };
  } catch (error) {
    console.error(`[Booking Actions] Error verifying availability for ${subeventId}:`, error);
    return { isSoldOut: false, availableSeats: null }; // Fail-open
  }
}
