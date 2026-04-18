'use server';

import { ITEM_INTERO_ID, ITEM_VIP_ID } from '@/constants/pretix';

import { formatInTimeZone, toDate } from 'date-fns-tz';
import { calculatePretixDateTime } from '@/utils/dateUtils';
import fs from 'fs';
import path from 'path';

const REGISTRY_PATH = path.join(process.cwd(), 'src/constants/rooms_registry.json');

const TIMEZONE = 'Europe/Rome';

const PRETIX_API_URL = 'https://pretix.eu/api/v1';
const PRETIX_ORGANIZER = 'vestri';
const PRETIX_EVENT = 'npkez';
const PRETIX_TOKEN = process.env.PRETIX_TOKEN; // "Token uqvj3n2vyn1yc0xzqqcqw44f93ug86s8x8l5uj61jb2wd3aywsfdfmyq9apshgjb"
const pad = (n: number) => n.toString().padStart(2, '0');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Limited concurrency helper to avoid hitting API rate limits.
 */
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

// API Queue State
let activeRequests = 0;
const requestQueue: (() => void)[] = [];
const MAX_CONCURRENT_REQUESTS = 3;

async function apiQueueGate() {
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

// In-memory cache for GET requests
const pretixCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30 * 1000; // 30 seconds

function getCachedData(endpoint: string) {
  const cached = pretixCache.get(endpoint);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedData(endpoint: string, data: any) {
  pretixCache.set(endpoint, { data, timestamp: Date.now() });
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
function parsePretixError(errorText: string): string {
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
          return firstVal[0];
        }
        if (typeof firstVal === 'string') return firstVal;
      }
    }

    return `Errore Pretix: ${errorText}`;
  } catch {
    return `Errore nella comunicazione con Pretix (${errorText})`;
  }
}

/**
 * Helper to fetch data from Pretix API
 */
async function fetchPretix(endpoint: string, options: RequestInit = {}) {
  const maxRetries = 3;
  
  // Only cache GET requests without body
  const isCacheable = (!options.method || options.method === 'GET') && !options.body;
  if (isCacheable) {
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
          const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 1000 * Math.pow(2, attempt);
          console.warn(`[Pretix] 429 Too Many Requests at ${endpoint}. Retrying in ${waitMs}ms... (Attempt ${attempt + 1}/${maxRetries})`);
          await sleep(waitMs);
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          const status = response.status;

          if (status === 400) {
            console.error(`Pretix API error [400 Bad Request] at ${endpoint}. Error details:`, errorText);
            throw new Error(parsePretixError(errorText));
          } else if (status === 403) {
            console.error(`Pretix API error [403 Forbidden] at ${endpoint}. This usually means the event has tickets sold and is locked.`);
            throw new Error(`Pretix API Error 403: L'evento è in uso (biglietti emessi) e non può essere modificato.`);
          } else {
            console.error(`Pretix API error [${status}] at ${endpoint}:`, errorText);
            throw new Error(`Pretix API failed: ${status} ${errorText}`);
          }
        }

        if (response.status === 204) return null;

        const contentType = response.headers.get('content-type');
        let data: any;

        if (contentType && contentType.includes('application/json')) {
          try {
            data = await response.json();
          } catch (e) {
            console.error(`[Pretix] Failed to parse JSON from ${endpoint}:`, e);
            throw new Error(`Risposta del server non valida (JSON corrotto).`);
          }
        } else {
          data = await response.text();
        }

        if (isCacheable) {
          setCachedData(endpoint, data);
        }
        return data;

      } catch (error) {
        if (attempt === maxRetries) throw error;
        // Exponential backoff for network errors
        const waitMs = 500 * Math.pow(2, attempt);
        await sleep(waitMs);
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
 * MIRROR SYSTEM: Returns data from local registry to optimize performance.
 */
export async function getSeatingPlan(subeventId?: number, options: { includeHidden?: boolean; onlyFromMirror?: boolean } = {}) {
  try {
    if (subeventId) {
      return await getSubEventSeats(subeventId);
    }

    const registry = await readRegistry();
    
    // If registry is empty and not onlyFromMirror, trigger a sync
    // Note: The new structure might start empty {}
    if (Object.keys(registry).length === 0 && !options.onlyFromMirror) {
      console.log('[Mirror] Registry empty, triggering initial sync...');
      await syncSeatingPlansWithMirror();
      return await getSeatingPlan(undefined, options);
    }

    // Convert registry to array of plans
    // In the new structure, keys are IDs.
    const plans: any[] = [];
    Object.entries(registry).forEach(([id, data]: [string, any]) => {
      if (id === 'DEFAULT') return;
      plans.push({
        id: parseInt(id),
        name: data.name || 'Sala',
        isHidden: data.isHidden ?? registry.DEFAULT?.isHidden ?? false
      });
    });

    // Filter hidden rooms unless requested
    if (!options.includeHidden) {
      return plans.filter((p: any) => !p.isHidden);
    }

    return plans;
  } catch (error) {
    console.error('Failed to get Seating Plan from Mirror', error);
    return [];
  }
}

/**
 * Returns a mapping of seating plan ID to its name for quick lookups.
 * Uses registry data.
 */
export async function getSeatingPlansMap() {
  const registry = await readRegistry();
  const map: Record<number, string> = {};
  
  Object.entries(registry).forEach(([id, data]: [string, any]) => {
    if (id === 'DEFAULT') return;
    map[parseInt(id)] = data.alias || data.name || 'Sala';
  });
  
  return map;
}


/**
 * Fetches a single seating plan detail.
 * MIRROR SYSTEM: Prioritizes local cached layout.
 */
export async function getSeatingPlanDetail(planId: number) {
  try {
    const registry = await readRegistry();
    const id = planId.toString();
    
    if (registry[id] && registry[id].layout && Object.keys(registry[id].layout).length > 0) {
      return registry[id];
    }

    // If not in registry or layout missing, fetch from Pretix
    console.log(`[Mirror] Layout missing for ${planId}, fetching from Pretix...`);
    const data = await fetchPretix(`/organizers/${PRETIX_ORGANIZER}/seatingplans/${planId}/`);
    
    if (data && data.id) {
      // Update registry with layout
      if (registry[id]) {
        registry[id].layout = data.layout || {};
        registry[id].lastSync = new Date().toISOString();
      } else {
        registry[id] = {
          id: data.id,
          internalName: data.name?.it || data.name,
          alias: '',
          isHidden: false,
          isFavorite: false,
          lastSync: new Date().toISOString(),
          layout: data.layout || {}
        };
      }
      await writeRegistry(registry);
    }
    
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
 * MIRROR SYSTEM HELPERS
 * -------------------------------------------------------------------
 */

async function readRegistry() {
  try {
    if (!fs.existsSync(REGISTRY_PATH)) {
      return {};
    }
    const data = fs.readFileSync(REGISTRY_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading rooms registry:', error);
    return {};
  }
}

async function writeRegistry(registry: any) {
  try {
    const dir = path.dirname(REGISTRY_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  } catch (error) {
    console.error('Error writing rooms registry:', error);
  }
}

/**
 * Synchronizes Pretix seating plans with the local mirror (registry).
 * - Detects new rooms.
 * - Updates existing room names.
 * - Detects orphaned rooms (deleted from Pretix) and hides them.
 * - Caches layouts to prevent 429 errors.
 */
export async function syncSeatingPlansWithMirror(forceLayoutUpdate: boolean = false) {
  try {
    console.log('[Mirror] Starting sync with Pretix...');
    const pretixPlans = await getSeatingPlan();
    const registry = await readRegistry();
    const pretixIds = new Set(pretixPlans.map((p: any) => p.id));

    // 1. Update/Add plans from Pretix
    for (const plan of pretixPlans) {
      const id = plan.id.toString();
      const existing = registry[id];

      if (!existing) {
        // New room found - default to shown unless global DEFAULT says otherwise
        console.log(`[Mirror] New room detected: ${plan.name} (${id})`);
        registry[id] = {
          name: plan.name,
          isHidden: registry.DEFAULT?.isHidden ?? false
        };
      }
      // Note: We intentionally DO NOT update 'name' or 'isHidden' for existing rooms
      // to allow manual overrides in rooms_registry.json to persist.
    }

    // 2. Orphan Detection: rooms in registry but NOT in Pretix
    Object.keys(registry).forEach(id => {
      if (!pretixIds.has(parseInt(id))) {
        if (!registry[id].isOrphaned) {
          console.warn(`[Mirror] Orphaned room detected: ${registry[id].internalName} (${id}). Archiving...`);
          registry[id].isOrphaned = true;
          registry[id].isHidden = true; // Auto-hide orphans
        }
      } else {
        registry[id].isOrphaned = false;
      }
    });

    await writeRegistry(registry);
    console.log('[Mirror] Sync completed successfully.');
    return { success: true, count: pretixPlans.length };
  } catch (error) {
    console.error('[Mirror] Sync failed:', error);
    return { success: false, error };
  }
}

/**
 * Updates metadata for a specific room in the mirror registry.
 */
export async function updateRoomMetadata(planId: number, metadata: { isHidden?: boolean, isFavorite?: boolean, internalName?: string, alias?: string }) {
  try {
    const registry = await readRegistry();
    const id = planId.toString();
    
    if (!registry[id]) {
      console.warn(`[Mirror] Cannot update metadata: room ${planId} not found in registry.`);
      return { success: false, error: 'Room not found' };
    }

    if (metadata.isFavorite) {
      // Ensure only one favorite
      Object.keys(registry).forEach(key => {
        registry[key].isFavorite = false;
      });
    }

    registry[id] = {
      ...registry[id],
      ...metadata,
      lastSync: new Date().toISOString()
    };

    await writeRegistry(registry);
    return { success: true, registry };
  } catch (error) {
    console.error('[Mirror] Metadata update failed:', error);
    return { success: false, error };
  }
}

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
export async function listQuotas(subeventId?: number) {
  try {
    // IMPORTANT: `with_availability=true` tells Pretix to compute and return
    // the real-time `available_number` field for each quota.
    // Without this parameter, `available_number` is always null and the
    // isSoldOut check in page.tsx will never trigger.
    const base = subeventId ? `/quotas/?subevent=${subeventId}&` : '/quotas/?';
    const endpoint = `${base}with_availability=true`;
    const data = await fetchPretix(endpoint, {
      next: { tags: ['availability'] }
    } as any);

    const results = data.results || [];

    // [DEBUG] Log availability for traceability
    if (subeventId && results.length > 0) {
      const intero = results.find((q: any) => Array.isArray(q.items) && q.items.includes(ITEM_INTERO_ID));
      const vip = results.find((q: any) => Array.isArray(q.items) && q.items.includes(ITEM_VIP_ID));
      console.log(`[DEBUG] Subevent ID: ${subeventId} | Quota Intero: ${intero?.available_number ?? 'N/D'} | Quota VIP: ${vip?.available_number ?? 'N/D'}`);
    }

    return results;
  } catch (error) {
    console.error('Error listing quotas:', error);
    return [];
  }
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
 * Note: This helper is now mostly used as a fallback. Direct quota mapping in 
 * display actions is preferred for performance.
 */
export async function isSubEventSoldOut(subeventId: number) {
  try {
    // We use Promise.allSettled to ensure that one failing call doesn't block the whole check
    const [seRes, quotasRes, seatsRes] = await Promise.allSettled([
      getSubEvent(subeventId),
      listQuotas(subeventId),
      getSubEventSeats(subeventId)
    ]);

    const se = seRes.status === 'fulfilled' ? seRes.value : null;
    const quotas = quotasRes.status === 'fulfilled' ? quotasRes.value : [];
    const seats = seatsRes.status === 'fulfilled' ? seatsRes.value : [];

    // 1. Check if subevent itself is unavailable or presale stopped
    if (se) {
      if (se.best_availability_state === 'sold_out' || (se.active && se.presale_is_running === false)) {
        return true;
      }
    }

    // 2. Check quotas availability (PRIMARY TRUTH)
    const relevantQuotas = (quotas || []).filter((q: any) => 
      Array.isArray(q.items) && (q.items.includes(ITEM_INTERO_ID) || q.items.includes(ITEM_VIP_ID))
    );

    if (relevantQuotas.length > 0) {
      const totalAvailable = relevantQuotas.reduce((sum: number, q: any) => {
        return sum + (q.available_number !== null ? Math.max(0, q.available_number) : 0);
      }, 0);

      const allUnavailable = relevantQuotas.every((q: any) => q.available === false);

      // We ONLY mark as sold out if we HAVE quota data and it explicitly says 0
      if (allUnavailable || totalAvailable <= 0) {
        return true;
      }
    }

    // 3. Check physical availability (SECONDARY TRUTH / FALLBACK)
    // ONLY check seats if we have a non-empty array. If empty, assume API failure and IGNORE.
    if (Array.isArray(seats) && seats.length > 0) {
      const availableSeatsCount = seats.filter((s: any) => 
        s.available !== false && !s.blocked && s.orderposition === null && s.cartposition === null
      ).length;

      if (availableSeatsCount <= 0) {
        // If we have seat data and it's definitely 0, then it's sold out
        return true;
      }
    }

    // Safety fallback: if we reach here and have no evidence of sold out, it's AVAILABLE.
    return false;
  } catch (error) {
    console.error(`Error in isSubEventSoldOut for ${subeventId}:`, error);
    return false; // Default to available on catastrophic catch
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

    return data;
  } catch (error) {
    console.error('Failed to finalize booking', error);
    throw error;
  }
}

/**
 * List all sub-events for the main event.
 * @param futureOnly If true, only returns sub-events that end after current time.
 */
export async function listSubEvents(futureOnly = false, includeHiddenRooms = false) {
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
      } as any);
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

    // MIRROR SYSTEM FILTERING
    if (!includeHiddenRooms) {
      const registry = await readRegistry();
      return allResults.filter(se => {
        if (!se.seating_plan) return true;
        const planId = se.seating_plan.toString();
        return !registry[planId]?.isHidden;
      });
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
  } catch (error) {
    console.error(`Error fetching sub-event ${subEventId}:`, error);
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
  cast: string;
  seatingPlanId: number;
  seatCategoryMapping?: Record<string, number>;
  // Optional rich metadata for the Souvenir Ticket
  tagline?: string;
  genres?: string;
  year?: string;
  rating?: string;
  logoPath?: string;
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

    // Fetch main event to get required metadata
    const mainEvent = await getMainEvent();
    const mainMetaData = mainEvent?.meta_data || {};

    // Map TMDB details to metadata
    // For VESTRICINEMA, we may have 'poster', 'regia', 'durata', 'lingua'
    const subMetaData: Record<string, string> = { ...mainMetaData };

    // Always map these keys even if not present in mainMetaData, 
    // as they might be mandatory at organizer level
    if (movieData.posterPath) subMetaData['poster'] = movieData.posterPath;
    if (movieData.director) subMetaData['regia'] = movieData.director;
    if (movieData.runtime) subMetaData['durata'] = `${movieData.runtime} min`;
    if (movieData.language) subMetaData['lingua'] = movieData.language;
    if (movieData.subtitles) subMetaData['sottotitoli'] = movieData.subtitles;

    const payload: any = {
      name: { it: movieData.title },
      active: true,
      is_public: true,
      date_from: dateFrom,
      date_to: dateTo,
      frontpage_text: { it: descriptionHtml },
      seating_plan: movieData.seatingPlanId,
      seat_category_mapping: movieData.seatCategoryMapping,
      meta_data: subMetaData,
      // Keep extra metadata in comment for future UI usage
      comment: JSON.stringify({
        tmdbId: movieData.tmdbId,
        overview: movieData.overview,
        posterPath: movieData.posterPath,
        runtime: movieData.runtime,
        director: movieData.director,
        language: movieData.language,
        subtitles: movieData.subtitles,
        cast: movieData.cast,
        tagline: movieData.tagline || '',
        genres: movieData.genres || '',
        year: movieData.year || '',
        rating: movieData.rating || '',
        logoPath: movieData.logoPath || ''
      })
    };

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
      const data = await fetchPretix(endpoint);
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
  } catch (error) {
    console.error(`Error fetching seats for sub-event ${subeventId}:`, error);
    return [];
  }
}

/**
 * Simple check for quotas (Deprecated, use listQuotas)
 */
export async function checkQuota() {
  return await listQuotas();
}
