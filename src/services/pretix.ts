'use server';

import { ITEM_INTERO_ID, ITEM_VIP_ID, ALLOWED_ROOM_IDS } from '@/constants/pretix';
import { getShortTermCache, setShortTermCache, saveOverride, getOverrides } from './db.service';

import { formatInTimeZone, toDate } from 'date-fns-tz';
import { calculatePretixDateTime } from '@/utils/dateUtils';

const TIMEZONE = 'Europe/Rome';

const PRETIX_API_URL = 'https://pretix.eu/api/v1';
const PRETIX_ORGANIZER = 'vestri';
const PRETIX_EVENT = 'npkez';
const PRETIX_TOKEN = process.env.PRETIX_TOKEN;

if (!PRETIX_TOKEN && process.env.NODE_ENV === 'production') {
  console.error('[PRETIX] ERRORE CRITICO: PRETIX_TOKEN non configurato su Vercel!');
}

if (process.env.NODE_ENV === 'production' && !PRETIX_TOKEN) {
}

const pad = (n: number) => n.toString().padStart(2, '0');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function limitConcurrency<T>(tasks: (() => Promise<T>)[], limit: number = 3): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let currentIndex = 0;
  async function executor() {
    while (currentIndex < tasks.length) {
      const index = currentIndex++;
      results[index] = await tasks[index]();
    }
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, executor);
  await Promise.all(workers);
  return results;
}

let activeRequests = 0;
const requestQueue: (() => void)[] = [];
const MAX_CONCURRENT_REQUESTS = 3;

// Global halt for rate-limiting
let isRateLimited = false;
let rateLimitResetTime = 0;

async function apiQueueGate() {
  if (isRateLimited) {
    const now = Date.now();
    if (now < rateLimitResetTime) {
      const wait = rateLimitResetTime - now;
      console.warn(`[Pretix] Rate-limit active. Waiting ${wait}ms before next gate...`);
      await sleep(wait);
    }
    isRateLimited = false;
  }

  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests++;
    return;
  }
  return new Promise<void>((resolve) => {
    requestQueue.push(resolve);
  });
}

function apiQueueRelease() {
  activeRequests--;
  if (requestQueue.length > 0) {
    const next = requestQueue.shift();
    if (next) {
      activeRequests++;
      next();
    }
  }
}

// Memory-based cache for GET requests using db.service (TTL 5 mins = 300s)
const CACHE_TTL_SECONDS = 300; 

function getCachedData(endpoint: string) {
  return getShortTermCache(`pretix_${endpoint}`, CACHE_TTL_SECONDS);
}

function setCachedData(endpoint: string, data: any) {
  setShortTermCache(`pretix_${endpoint}`, data);
}

export async function clearPretixCache() {
  // Emptying the cacheMap is hard, but we can rely on TTL or we could export a clear method from db.service.
  // For now, no op as Vercel restarts anyway.
}

/**
 * Custom ISO formatter to bypass server UTC shifts.
 * Hardcoded to Europe/Rome (+02:00 for CEST).
 * USES PURE MATH TO PREVENT TIMEZONE GHOSTS.
 */
function formatManualISO(d: Date) {
  // Usiamo formatInTimeZone per estrarre i pezzi in modo sicuro rispetto al fuso di Roma
  return `${formatInTimeZone(d, TIMEZONE, 'yyyy-MM-dd')}T${formatInTimeZone(d, TIMEZONE, 'HH:mm')}:00+02:00`;
}

/**
 * Fetches all events from the organizer.
 */
export async function listEvents() {
  try {
    const url = `${PRETIX_API_URL}/organizers/${PRETIX_ORGANIZER}/events/`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `${PRETIX_TOKEN}`,
        'Content-Type': 'application/json',
      }
    });
    if (!response.ok) throw new Error('Failed to list events');
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error listing Pretix events:', error);
    return [];
  }
}

/**
 * Creates a new event in Pretix.
 */
export async function createEvent(movieData: { title: string; slug: string; date: string; description?: string }) {
  try {
    const payload = {
      name: { it: movieData.title },
      slug: movieData.slug,
      live: true,
      date_from: formatInTimeZone(toDate(movieData.date, { timeZone: TIMEZONE }), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"),
      description: movieData.description ? { it: movieData.description } : undefined,
      currency: 'EUR',
      plugins: ['pretix.plugins.statistics']
    };

    const url = `${PRETIX_API_URL}/organizers/${PRETIX_ORGANIZER}/events/`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `${PRETIX_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Pretix event creation failed: ${err}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating Pretix event:', error);
    throw error;
  }
}

/**
 * Deletes an event from Pretix.
 */
export async function deleteEvent(eventSlug: string) {
  try {
    const url = `${PRETIX_API_URL}/organizers/${PRETIX_ORGANIZER}/events/${eventSlug}/`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `${PRETIX_TOKEN}`,
      }
    });

    if (!response.ok && response.status !== 204) {
      const err = await response.text();
      throw new Error(`Pretix event deletion failed: ${err}`);
    }

    return true;
  } catch (error) {
    console.error(`Error deleting Pretix event ${eventSlug}:`, error);
    throw error;
  }
}

/**
 * Updates an existing event.
 */
export async function updateEvent(eventSlug: string, patchData: any) {
  try {
    const url = `${PRETIX_API_URL}/organizers/${PRETIX_ORGANIZER}/events/${eventSlug}/`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `${PRETIX_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patchData)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Pretix event update failed: ${err}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error updating Pretix event ${eventSlug}:`, error);
    throw error;
  }
}

/**
 * Helper to fetch data from Pretix API
 */
/**
 * Helper to parse Pretix error responses into a human-readable string.
 */
function parsePretixError(errorText: string, endpoint?: string): string {
  try {
    const errorData = JSON.parse(errorText);

    // 1. Handle positions array errors (common for seat/quota issues)
    if (errorData.positions && Array.isArray(errorData.positions)) {
      for (const pos of errorData.positions) {
        // Seat specific error
        if (pos.seat && Array.isArray(pos.seat) && pos.seat[0]) {
          const seatMsg = String(pos.seat[0]).toLowerCase();
          if (seatMsg.includes('not available')) {
            return 'Il posto selezionato non è più disponibile. Scegline un altro.';
          }
          return pos.seat[0];
        }
        // Item/Quota specific error
        if (pos.item && Array.isArray(pos.item) && pos.item[0]) {
          const itemMsg = String(pos.item[0]).toLowerCase();
          if (itemMsg.includes('enough quota')) {
            return 'Disponibilità esaurita per questa tipologia di biglietto.';
          }
          return pos.item[0];
        }
      }
    }

    // 2. Handle generic field errors (e.g. {"email": ["Enter a valid email"]})
    if (typeof errorData === 'object' && !Array.isArray(errorData)) {
      const keys = Object.keys(errorData);
      if (keys.length > 0) {
        const firstKey = keys[0];
        const firstVal = errorData[firstKey];
        if (Array.isArray(firstVal) && typeof firstVal[0] === 'string') {
          return `${firstKey}: ${firstVal[0]}`;
        }
        if (typeof firstVal === 'string') return `${firstKey}: ${firstVal}`;
      }
    }

    return `Errore Pretix (${endpoint}): ${errorText}`;
  } catch {
    return `Errore nella comunicazione con Pretix (${errorText})`;
  }
}

/**
 * Helper to fetch data from Pretix API
 */
export async function fetchPretix(endpoint: string, options: RequestInit = {}, skipCache: boolean = false) {
  if (!PRETIX_TOKEN) {
    throw new Error('Configurazione Mancante: PRETIX_TOKEN non trovato nell\'ambiente (Vercel Secrets).');
  }
  const maxRetries = 3;

  
  // Only cache GET requests without body
  const isCacheable = (!options.method || options.method === 'GET') && !options.body;
  if (isCacheable && !skipCache) {
    const cached = getCachedData(endpoint);
    if (cached) return cached;
  }

  // Use organizer-level if endpoint starts with /organizers/, else event-level
  const baseUrl = endpoint.startsWith('/organizers/')
    ? `${PRETIX_API_URL}`
    : `${PRETIX_API_URL}/organizers/${PRETIX_ORGANIZER}/events/${PRETIX_EVENT}`;

  const url = `${baseUrl}${endpoint}`;

  const headers = new Headers(options.headers);
  const authValue = PRETIX_TOKEN?.startsWith('Token ') ? PRETIX_TOKEN : `Token ${PRETIX_TOKEN}`;

  headers.set('Authorization', authValue);
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');

  await apiQueueGate();

  try {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          headers,
          cache: 'no-store',
        });

        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 2000 * Math.pow(2, attempt);
          
          isRateLimited = true;
          rateLimitResetTime = Date.now() + waitMs + 500; // Buffer 500ms
          
          console.error(`[Pretix] 🛑 429 RATE LIMIT (Retry-After: ${retryAfter || 'auto'}). Halting all requests for ${waitMs}ms...`);
          await sleep(waitMs);
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          const status = response.status;
          console.error(`Pretix API error [${status}] at ${endpoint}:`, errorText);
          throw new Error(`Pretix API failed: ${status}`);
        }

        if (response.status === 204) return null;
        
        const data = await response.json();
        if (isCacheable && !skipCache) setCachedData(endpoint, data);
        return data;

      } catch (error: any) {
        if (attempt === maxRetries) throw error;
        // Generic backoff for other errors
        await sleep(500 * Math.pow(2, attempt));
      }
    }
  } finally {
    apiQueueRelease();
  }
}


/**
 * Fetches the main event details (needed for metadata fields).
 */
export async function getMainEvent() {
  try {
    return await fetchPretix('/');
  } catch (error) {
    console.error('Error fetching main event:', error);
  }
}

/**
 * Fetches the seating plan layout and current status.
 * Returns either seats for a sub-event or all available seating plans.
 */
export async function getSeatingPlan(subeventId?: number) {
  try {
    if (subeventId) {
      return await getSubEventSeats(subeventId);
    }
    return await listSeatingPlans();
  } catch (error) {
    console.error('Failed to get Seating Plan', error);
    return [];
  }
}



/**
 * Fetches all seating plans from Pretix.
 */
export async function listSeatingPlans(skipCache = false) {
  try {
    const data = await fetchPretix(`/organizers/${PRETIX_ORGANIZER}/seatingplans/`, {}, skipCache);
    const results = data.results || [];
    
    // Filtro di sicurezza: escludi solo le sale "spazzatura" con nomi specifici.
    // NON filtriamo più per ALLOWED_ROOM_IDS — il registro in /tmp gestisce la visibilità.
    // Questo permette a una sala appena creata di apparire subito dopo sync.
    return results
      .filter((p: any) => {
        const name = (p.name?.it || p.name || '').toUpperCase();
        return !name.includes('SALA 0') && !name.includes('TEST');
      })
      .map((p: any) => ({
        id: p.id,
        name: p.name?.it || p.name || 'Sala',
        isHidden: false
      }));
  } catch (error) {
    console.error('Error listing seating plans:', error);
    return [];
  }
}

/**
 * Returns a mapping of seating plan ID to its name for quick lookups.
 * Fetches directly from Pretix.
 */
export async function getSeatingPlansMap() {
  try {
    const plans = await listSeatingPlans();
    const map: Record<number, string> = {};
    plans.forEach((p: any) => {
      map[p.id] = p.name;
    });
    return map;
  } catch (error) {
    console.error('Error fetching seating plans map:', error);
    return {};
  }
}


/**
 * Fetches a single seating plan detail directly from Pretix.
 */
export async function getSeatingPlanDetail(planId: number) {
  try {
    const data = await fetchPretix(`/organizers/${PRETIX_ORGANIZER}/seatingplans/${planId}/`);
    return data;
  } catch (error) {
    console.error(`Error fetching seating plan ${planId}:`, error);
    return null;
  }
}

/**
 * Creates a new seating plan.
 */
export async function createSeatingPlan(postData: any) {
  try {
    return await fetchPretix(`/organizers/${PRETIX_ORGANIZER}/seatingplans/`, {
      method: 'POST',
      body: JSON.stringify(postData)
    });
  } catch (error) {
    console.error(`Error creating seating plan:`, error);
    throw error;
  }
}

/**
 * -------------------------------------------------------------------
 * PRETIX SYSTEM FETCHERS
 * -------------------------------------------------------------------
 */

/**
 * Updates an existing seating plan.
 */
export async function updateSeatingPlan(planId: number, patchData: any) {
  try {
    return await fetchPretix(`/organizers/${PRETIX_ORGANIZER}/seatingplans/${planId}/`, {
      method: 'PATCH',
      body: JSON.stringify(patchData)
    });
  } catch (error) {
    console.error(`Error updating seating plan ${planId}:`, error);
    throw error;
  }
}

/**
 * Fetches all items (products) for the event.
 */
export async function getItems() {
  try {
    const data = await fetchPretix('/items/');
    return data.results || [];
  } catch (error) {
    console.error('Error fetching items:', error);
    return [];
  }
}

/**
 * Creates a quota for a specific sub-event.
 */
export async function createQuota(subeventId: number, name: string, size: number | null, itemIds: number[], variationIds?: number[]) {
  try {
    const payload: any = {
      name,
      size,
      items: itemIds,
      subevent: subeventId,
      close_when_sold_out: false,
      closed: false,
      ignore_for_event_availability: false
    };

    if (variationIds && variationIds.length > 0) {
      payload.variations = variationIds;
    }

    return await fetchPretix('/quotas/', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error(`Error creating quota "${name}" for sub-event ${subeventId}:`, error);
    throw error;
  }
}

/**
 * List all quotas for the event, optionally filtered by sub-event.
 */
/**
 * Fetches quotas for a specific sub-event.
 * SURGICAL SYNC: Global pagination is disabled to avoid 429 rate-limiting.
 */
export async function listQuotas(subeventId?: number) {
  try {
    if (!subeventId) {
      // PROHIBITED: Global quota sync is too heavy (46+ pages).
      // If no subeventId is provided, we return empty or throw to prevent DDoS.
      console.warn('[Pretix] Global listQuotas() call blocked to prevent 429 rate-limiting. Use subeventId.');
      return [];
    }

    const endpoint = `/quotas/?subevent=${subeventId}&with_availability=true`;
    const data = await fetchPretix(endpoint, {
      next: { tags: ['availability'] }
    } as any, true); // skipCache = true for availability!

    return data.results || [];
  } catch (error) {
    console.error(`Error listing quotas for subevent ${subeventId}:`, error);
    return [];
  }
}

/**
 * Fetches all quotas for a specific sub-event.
 * Alias for listQuotas(subeventId) to maintain compatibility.
 */
export async function getSubeventQuotas(subeventId: number) {
  return await listQuotas(subeventId);
}

/**
 * Optimized check for Biglietto Intero availability.
 */
export async function getFastInteroAvailability(subeventId: number) {
  return await getItemAvailability(subeventId, ITEM_INTERO_ID);
}

/**
 * Fetches a single quota by ID.
 */
export async function getQuota(quotaId: number) {
  try {
    return await fetchPretix(`/quotas/${quotaId}/`);
  } catch (error) {
    console.error(`Error fetching quota ${quotaId}:`, error);
    throw error;
  }
}

/**
 * Updates an existing quota.
 */
export async function updateQuota(quotaId: number, patchData: any) {
  try {
    return await fetchPretix(`/quotas/${quotaId}/`, {
      method: 'PATCH',
      body: JSON.stringify(patchData)
    });
  } catch (error) {
    console.error(`Error updating quota ${quotaId}:`, error);
    throw error;
  }
}

/**
 * Deletes a quota.
 */
export async function deleteQuota(quotaId: number) {
  try {
    await fetchPretix(`/quotas/${quotaId}/`, {
      method: 'DELETE'
    });
    return true;
  } catch (error) {
    console.error(`Error deleting quota ${quotaId}:`, error);
    throw error;
  }
}

/**
 * Returns availability information for a specific quota.
 */
export async function getQuotaAvailability(quotaId: number) {
  try {
    return await fetchPretix(`/quotas/${quotaId}/availability/`);
  } catch (error) {
    console.error(`Error fetching availability for quota ${quotaId}:`, error);
    throw error;
  }
}

/**
 * Fetches availability for all items, including seats.
 */
export async function getAvailability(subeventId?: number) {
  try {
    const endpoint = subeventId ? `/items/?subevent=${subeventId}` : '/items/';
    const data = await fetchPretix(endpoint);
    return data.results || [];
  } catch (error) {
    console.error('Failed to get availability', error);
    return [];
  }
}

/**
 * Checks availability for a specific item in a sub-event.
 */
export async function getItemAvailability(subeventId: number, itemId: number) {
  try {
    const data = await fetchPretix(`/items/${itemId}/availability/?subevent=${subeventId}`);
    return {
      available: data.available === true,
      available_number: data.available_number // Return raw value (can be null for unlimited)
    };
  } catch (error) {
    console.error(`Error checking availability for item ${itemId} in sub-event ${subeventId}:`, error);
    return { available: true, available_number: null }; // Default to available on error to avoid false sold-outs
  }
}

/**
 * Checks if a sub-event is sold out based on the 'Biglietto Intero' availability.
 * Fail-Safe: Always returns false (Available) on error.
 */
export async function isSubEventSoldOut(subeventId: number) {
  try {
    const quotas = await listQuotas(subeventId);
    
    // DIAGNOSTIC LOG (as requested)
    console.log(`[DEBUG-QUOTAS] SubEvent: ${subeventId} | Raw Quotas:`, JSON.stringify(quotas));

    // Robust Identification: 
    // 1. Look for exact name "Quota Intero" (case-insensitive)
    // 2. Fallback to any quota containing the ITEM_INTERO_ID
    // 3. Fallback to "Biglietti" (observed in some events)
    const interoQuota = quotas.find((q: any) => 
      (q.name && q.name.trim().toLowerCase() === "quota intero") ||
      (Array.isArray(q.items) && q.items.includes(ITEM_INTERO_ID)) ||
      (q.name && q.name.trim().toLowerCase() === "biglietti")
    );

    if (!interoQuota) {
      console.warn(`[DEBUG-QUOTAS] 'Quota Intero' NOT FOUND for subevent ${subeventId}. Quotas:`, quotas.map((q: any) => `${q.name} (ID: ${q.id})`));
      return false; // FAIL-OPEN
    }

    const available_number = interoQuota.available_number;
    const isSoldOut = available_number !== null && available_number <= 0;

    console.log(`[DEBUG-QUOTAS] ID: ${subeventId} | Quota: ${interoQuota.name} | Available: ${available_number} | isSoldOut: ${isSoldOut}`);

    return isSoldOut;
  } catch (error) {
    console.error(`Error in isSubEventSoldOut for ${subeventId}:`, error);
    return false; // FAIL-SAFE: available
  }
}

/**
 * Finalizes the booking by creating an order directly.
 * Server-side guard: rejects any VIP seats to prevent bypassing the UI restriction.
 */
export async function finalizeBooking(email: string, seats: string[], subeventId?: number) {
  try {
    // Server-side validation: verify no VIP seats are in the selection
    if (subeventId && seats.length > 0) {
      const seatsData = await fetchPretix(`/subevents/${subeventId}/seats/`);
      const allSeats: any[] = seatsData?.results || [];

      const vipGuidSet = new Set(
        allSeats
          .filter((s: any) => s.product === ITEM_VIP_ID)
          .map((s: any) => s.seat_guid)
      );

      const vipAttempted = seats.filter(guid => vipGuidSet.has(guid));
      if (vipAttempted.length > 0) {
        throw new Error('Non è possibile prenotare posti Poltrona VIP.');
      }
    }

    const orderPayload = {
      email,
      locale: 'it',
      positions: seats.map((seatGuid: string) => ({
        item: ITEM_INTERO_ID, // Product for 'INTERO' - VIP seats are blocked above
        seat: seatGuid,
        subevent: subeventId,
        price: '0.00', // Force zero amount for free tickets
      }))
    };

    // Use event-level orders endpoint (POST on organizer-level returns 405)
    const data = await fetchPretix(`/orders/`, {
      method: 'POST',
      body: JSON.stringify(orderPayload)
    });

    // --- NEW: Post-booking REAL-TIME sync (Standard Tecnico) ---
    // ATOMIC SYNC: We MUST await this to ensure the DB is updated before the client redirects
    try {
      if (subeventId) {
        const { updateEventAvailability } = await import('@/services/sync.service');
        await updateEventAvailability(subeventId, true);
      }
      
      // We don't necessarily need to await the global movie status check, 
      // but we do it for absolute consistency
      await syncSoldOutStatus();
    } catch (err) {
      console.error('[SYNC] Sync error after order:', err);
    }

    return data;
  } catch (error) {
    console.error('Failed to finalize booking', error);
    throw error;
  }
}

/**
 * List all sub-events for the main event.
 * @param futureOnly If true, only returns sub-events that end after current time.
 * @param includeHiddenRooms (Not used internally but kept for signature)
 * @param skipCache If true, bypasses the memory cache.
 */
export async function listSubEvents(futureOnly = false, includeHiddenRooms = false, skipCache = false) {
  try {
    const params = new URLSearchParams();

    if (futureOnly) {
      params.append('ends_after', new Date().toISOString());
    }

    // Always sort by date_from ASC (soonest first)
    params.append('ordering', 'date_from');
    // Request maximum page size to minimize round-trips
    params.append('limit', '100');

    let endpoint = `/subevents/?${params.toString()}`;
    const allResults: any[] = [];

    // Paginate through ALL pages — Pretix paginates results!
    while (endpoint) {
      const data = await fetchPretix(endpoint, {
        next: { tags: ['availability'] }
      } as any, skipCache);
      if (data?.results) {
        allResults.push(...data.results);
      }

      // Follow the `next` cursor if present
      if (data?.next) {
        // Add a small delay between paginated requests
        await sleep(50);
        // Extract the path+query from the full URL
        try {
          const nextUrl = new URL(data.next);
          endpoint = nextUrl.pathname.replace(
            `/api/v1/organizers/${PRETIX_ORGANIZER}/events/${PRETIX_EVENT}`,
            ''
          ) + nextUrl.search;
        } catch {
          endpoint = '';
        }
      } else {
        endpoint = '';
      }
    }

    return allResults;
  } catch (error) {
    console.error('Error listing sub-events:', error);
    return [];
  }
}


export async function getSubEvent(subEventId: number) {
  try {
    return await fetchPretix(`/subevents/${subEventId}/`);
  } catch (error: any) {
    if (error.message?.includes('404')) {
      console.warn(`[Pretix] Sub-event ${subEventId} not found (404).`);
      return null;
    }
    throw error;
  }
}

/**
 * Creates a new sub-event (screening) in Pretix.
 */
export async function createSubEvent(movieData: {
  title: string;
  date: string;
  time: string;
  tmdbId: string;
  overview: string;
  posterPath: string;
  runtime: number;
  director: string;
  language: string;
  subtitles: string;
  versionLanguage?: string;
  cast: string;
  seatingPlanId: number;
  seatCategoryMapping?: Record<string, number>;
  // Optional rich metadata for the Souvenir Ticket
  tagline?: string;
  genres?: string;
  year?: string;
  rating?: string;
  logoPath?: string;
  backdropPath?: string;
  awards?: any[];
}) {
  try {
    const runtimeMinutes = movieData.runtime || 120;

    // --- PROTOCOLLO EMERGENZA MATEMATICA (PURE STRING) ---
    const dateFrom = calculatePretixDateTime(movieData.date, movieData.time, 0);
    const dateTo = calculatePretixDateTime(movieData.date, movieData.time, runtimeMinutes);

    console.log('--- PROTOCOLLO EMERGENZA (MATEMATICA PURA) ---');
    console.log(`[Math] Input Date=${movieData.date}, Time=${movieData.time}, Durata=${runtimeMinutes}m`);
    console.log(`[Math] Inviato a Pretix (date_from): ${dateFrom}`);
    console.log(`[Math] Inviato a Pretix (date_to):   ${dateTo}`);
    console.log('---------------------------------------------');

    // Format description as HTML for frontpage_text
    const descriptionHtml = `
      <div class="movie-details">
        <p><strong>Regia:</strong> ${movieData.director || 'N/D'}</p>
        <p><strong>Durata:</strong> ${runtimeMinutes} min</p>
        <p><strong>Lingua:</strong> ${movieData.language || 'Italiano'}</p>
        <p><strong>Sottotitoli:</strong> ${movieData.subtitles || 'Italiano'}</p>
        <hr />
        <p>${movieData.overview}</p>
        ${movieData.cast ? `<br /><p>Con: ${movieData.cast}</p>` : ''}
      </div>
    `.trim();

    // Store all rich metadata in the 'comment' field as JSON.
    // This is read back by CheckoutButton.tsx and cassaActions.ts when rendering the souvenir ticket.
    const commentPayload = JSON.stringify({
      tmdbId: movieData.tmdbId,
      posterPath: movieData.posterPath || '',
      backdropPath: movieData.backdropPath || '',
      logoPath: movieData.logoPath || '',
      runtime: movieData.runtime || 120,
      director: movieData.director || '',
      cast: movieData.cast || '',
      tagline: movieData.tagline || '',
      genres: movieData.genres || '',
      year: movieData.year || '',
      rating: movieData.rating || '',
      versionLanguage: movieData.versionLanguage || '',
      subtitles: movieData.subtitles || '',
      awards: movieData.awards || [],
    });

    const payload: any = {
      name: { it: movieData.title },
      active: true,
      is_public: true,
      date_from: dateFrom,
      date_to: dateTo, // Must be a valid ISO string — null causes 500 on Pretix Cloud
      frontpage_text: { it: movieData.title + ' - VESTRI CINEMA' },
      comment: commentPayload,
      seating_plan: Number(movieData.seatingPlanId),
      meta_data: {
        lingua: movieData.versionLanguage || '',
        sottotitoli: movieData.subtitles || ''
      }
    };

    // Only include seat_category_mapping if it has entries — an empty or undefined mapping
    // causes Pretix to return 500 on newly created rooms that haven't been indexed yet.
    if (movieData.seatCategoryMapping && Object.keys(movieData.seatCategoryMapping).length > 0) {
      payload.seat_category_mapping = movieData.seatCategoryMapping;
    }

    console.log('[createSubEvent] Payload finale:', JSON.stringify(payload, null, 2));

    const data = await fetchPretix('/subevents/', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    return data;
  } catch (error) {
    console.error('Error creating Pretix sub-event:', error);
    throw error;
  }
}

/**
 * Updates a sub-event in Pretix.
 */
export async function updateSubEvent(subEventId: number, patchData: any) {
  try {
    return await fetchPretix(`/subevents/${subEventId}/`, {
      method: 'PATCH',
      body: JSON.stringify(patchData)
    });
  } catch (error) {
    console.error(`Error updating Pretix sub-event ${subEventId}:`, error);
    throw error;
  }
}

/**
 * Force specific items/variations to be free (0.00 EUR) for a sub-event.
 */
export async function setSubEventPriceOverrides(subeventId: number, itemOverrides: { item: number; price: string }[]) {
  try {
    // Formatting: variations are checked first, then items. For VESTRICINEMASHOP we override items directly.
    const payload = {
      subevent_item_overrides: itemOverrides.map(o => ({
        item: o.item,
        price: o.price
      }))
    };

    // We use PATCH on the sub-event to update its overrides
    return await fetchPretix(`/subevents/${subeventId}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error(`Error setting price overrides for sub-event ${subeventId}:`, error);
    throw error;
  }
}

/**
 * Deletes a sub-event from Pretix.
 */
export async function deleteSubEvent(subEventId: number) {
  try {
    await fetchPretix(`/subevents/${subEventId}/`, {
      method: 'DELETE'
    });
    return true;
  } catch (error) {
    console.error(`Error deleting Pretix sub-event ${subEventId}:`, error);
    throw error;
  }
}

/**
 * Creates a Pretix order from the physical Cassa (POS).
 * - Always uses cassa@vestricinema.it as email.
 * - Always sends price 0.00 (tickets are free on Pretix; physical price is local only).
 * - Creates the order with status 'p' (paid) so the ticket is immediately valid.
 */
export async function createCassaOrder(params: {
  subeventId: number;
  seats: { guid: string; itemId?: number }[];
}) {
  const { subeventId, seats } = params;

  const orderPayload = {
    email: 'cassa@vestricinema.it',
    locale: 'it',
    status: 'p', // paid — ticket gratuito, valido immediatamente
    positions: seats.map((s) => ({
      item: s.itemId || ITEM_INTERO_ID,
      seat: s.guid,
      subevent: subeventId,
      price: '0.00',
    })),
  };

  const data = await fetchPretix('/orders/', {
    method: 'POST',
    body: JSON.stringify(orderPayload),
  });

  // --- NEW: Post-booking REAL-TIME sync (Standard Tecnico) ---
  // ATOMIC SYNC: Await to ensure the DB is fresh for the POS/Cassa
  try {
    const { updateEventAvailability } = await import('@/services/sync.service');
    await updateEventAvailability(subeventId, true);
    
    // Also run the global movie status check
    await syncSoldOutStatus();
  } catch (err) {
    console.error('[SYNC] Sync error after Cassa order:', err);
  }

  return data;
}


/**
 * Fetches the seats for a given sub-event.
 * Returns array of seat objects with seat_guid, name, row, etc.
 * Handles Pretix pagination to ensure all seats are retrieved.
 */
export async function getSubEventSeats(subeventId: number) {
  try {
    let endpoint = `/subevents/${subeventId}/seats/`;
    const allSeats: any[] = [];

    while (endpoint) {
      // FORZA IL REFRESH: skipCache = true per avere lo stato reale dei posti
      const data = await fetchPretix(endpoint, {}, true);
      if (data?.results && Array.isArray(data.results)) {
        allSeats.push(...data.results);
      } else if (Array.isArray(data)) {
        allSeats.push(...data);
        break; // Not paginated format
      }

      // Follow next page
      if (data?.next) {
        // Add a small delay between paginated requests
        await sleep(50);
        try {
          const nextUrl = new URL(data.next);
          endpoint = nextUrl.pathname.replace(
            `/api/v1/organizers/${PRETIX_ORGANIZER}/events/${PRETIX_EVENT}`,
            ''
          ) + nextUrl.search;
        } catch {
          endpoint = '';
        }
      } else {
        endpoint = '';
      }
    }

    return allSeats;
  } catch (error: any) {
    if (error.message?.includes('404')) {
      console.warn(`[Pretix] Seats for sub-event ${subeventId} not found (404).`);
      return [];
    }
    console.error(`Error fetching seats for sub-event ${subeventId}:`, error);
    return [];
  }
}

/**
 * Post-booking availability sync logic.
 * Checks if a movie is fully sold out across all its subevents using DB data.
 */
export async function syncSoldOutStatus() {
  try {
    const prisma = (await import('@/lib/prisma')).default;
    const { getOverrides, saveOverride } = await import('./db.service');
    
    console.log('[SYNC] Checking for global movie sold-out status...');
    
    // 1. Get all active projections and overrides from DB
    const [projections, overrides] = await Promise.all([
      prisma.pretixSync.findMany({
        where: { active: true },
        select: { pretixId: true, isSoldOut: true, tmdbId: true, name: true }
      }),
      getOverrides()
    ]);

    // 2. Group by movie
    const movieStatus = new Map<string, { title: string, subevents: any[] }>();
    projections.forEach(p => {
      if (!p.tmdbId) return;
      if (!movieStatus.has(p.tmdbId)) movieStatus.set(p.tmdbId, { title: p.name || 'Film', subevents: [] });
      movieStatus.get(p.tmdbId)!.subevents.push({ id: p.pretixId, isSoldOut: p.isSoldOut });
    });

    // 3. Persist manual override if all subevents in DB are sold out
    for (const [tmdbId, status] of movieStatus.entries()) {
      const isCompletelySoldOut = status.subevents.length > 0 && status.subevents.every(se => se.isSoldOut);
      if (isCompletelySoldOut && !overrides[tmdbId]?.manualSoldOut) {
        console.log(`[SYNC] Movie "${status.title}" (TMDB: ${tmdbId}) detected as FULLY SOLD OUT. Saving override...`);
        await saveOverride(tmdbId, { manualSoldOut: true });
      } else if (!isCompletelySoldOut && overrides[tmdbId]?.manualSoldOut) {
        // Auto-reopen if not completely sold out anymore
        console.log(`[SYNC] Movie "${status.title}" (TMDB: ${tmdbId}) is no longer fully sold out. Reopening...`);
        await saveOverride(tmdbId, { manualSoldOut: false });
      }
    }
  } catch (err) {
    console.error('[SYNC] Global status check failed:', err);
  }
}

/**
 * Fetches order positions for shows occurring on a specific date.
 * Uses /orderpositions/ with subevent date filters.
 */
/**
 * Fetches order positions for shows occurring on a specific date.
 * SURGICAL FIX: First gets subevent IDs for the date, then filters orderpositions.
 */
export async function getTicketsByDate(dateStr: string) {
  try {
    // 1. Get SubEvents for this specific day to get their IDs
    // Pretix filters for /subevents/ are date_from_after and date_from_before
    const subEventsData = await fetchPretix(`/subevents/?date_from_after=${dateStr}T00:00:00Z&date_from_before=${dateStr}T23:59:59Z`, {}, true);
    const subEventIds = (subEventsData.results || []).map((se: any) => se.id);

    if (subEventIds.length === 0) {
      console.log(`[TicketRecovery] No subevents found for ${dateStr}`);
      return [];
    }

    // 2. Fetch order positions filtered by these subevent IDs
    // We use multiple 'subevent=ID' parameters as comma-separated lists are not supported for this filter.
    const subeventParams = subEventIds.map((id: number) => `subevent=${id}`).join('&');
    let endpoint = `/orderpositions/?${subeventParams}&order__status=p&expand=subevent&expand=item&expand=order`; 
    const allPositions: any[] = [];

    while (endpoint) {
      const data = await fetchPretix(endpoint, {}, true);
      
      if (data?.results) {
        data.results.forEach((pos: any) => {
          const itemObj = pos.item;
          pos.item_name = itemObj?.name?.it || itemObj?.name?.en || 'Film Sconosciuto';
          pos.order_code = pos.order?.code || pos.order; 
          
          const subevent = pos.subevent;
          pos.show_time = subevent?.date_from ? new Date(subevent.date_from).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '??:??';
          
          // Customer info: Check position first (attendee), then fallback to order
          pos.customer_name = pos.attendee_name || pos.order?.email || 'Acquirente';
          pos.customer_email = pos.attendee_email || pos.order?.email || '';
          pos.seat_name = pos.seat?.name || '';
          
          allPositions.push(pos);
        });
      }

      if (data?.next) {
        try {
          const nextUrl = new URL(data.next);
          endpoint = nextUrl.pathname.replace(
            `/api/v1/organizers/${PRETIX_ORGANIZER}/events/${PRETIX_EVENT}`,
            ''
          ) + nextUrl.search;
        } catch {
          endpoint = '';
        }
      } else {
        endpoint = '';
      }
    }

    // Sort by show time
    return allPositions.sort((a, b) => {
      const timeA = a.subevent?.date_from || '';
      const timeB = b.subevent?.date_from || '';
      return timeA.localeCompare(timeB);
    });
  } catch (error) {
    console.error(`Error fetching tickets for date ${dateStr}:`, error);
    return [];
  }
}

/**
 * Starts a batch rendering process for multiple ticket positions.
 */
export async function renderBatchTickets(orderPositions: string[]) {
  try {
    const payload = {
      positions: orderPositions,
      renderer: 'pdf'
    };
    
    const data = await fetchPretix('/ticketpdfrenderer/render_batch/', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    return data; // contains status_url
  } catch (error) {
    console.error('Error starting batch rendering:', error);
    throw error;
  }
}

/**
 * Polls the batch rendering status until completion.
 */
export async function checkBatchStatus(statusUrl: string) {
  // Extract endpoint from statusUrl if it's a full URL
  let endpoint = statusUrl;
  if (statusUrl.startsWith('http')) {
    try {
      const url = new URL(statusUrl);
      endpoint = url.pathname.replace(
        `/api/v1/organizers/${PRETIX_ORGANIZER}/events/${PRETIX_EVENT}`,
        ''
      );
    } catch {
      endpoint = statusUrl;
    }
  }

  while (true) {
    try {
      const response = await fetchPretix(endpoint, {}, true);
      // Pretix batch rendering returns 200 OK with the final document when done.
      return response;
    } catch (error: any) {
      if (error.message.includes('409')) {
        console.log('[Pretix] Batch rendering in progress (409). Retrying in 2s...');
        await sleep(2000);
        continue;
      }
      throw error;
    }
  }
}

