'use server';

import {
  listSubEvents,
  listQuotas,
  createCassaOrder,
  getSubEvent,
  getSubEventSeats,
} from '@/services/pretix';
import { ITEM_INTERO_ID, ITEM_VIP_ID, ROOM_NAMES } from '@/constants/pretix';
import { getMovieDetails } from '@/services/tmdb';
import { revalidatePath } from 'next/cache';

// ─────────────────────────────────────────────────────────────────
// NOTE: Filesystem archiving is disabled to support read-only environments like Vercel.
// Sales history is now session-based in the client.

export interface CassaTicketRecord {
  id: string;           // e.g. "20260406_ABC12"
  orderCode: string;    // e.g. "ABC12"
  date: string;         // ISO sale date
  movieTitle: string;
  screening: string;    // "Gio 6 Apr • 21:00"
  room: string;
  seatName: string;
  seatGuid: string;
  rowLabel: string;
  seatLabel: string;
  price: string;        // e.g. "8.50" — display only, not Pretix
  subeventId: number;
  qrValue: string;      // Pretix order URL or secret for QR
  backdropPath?: string;
  logoPath?: string;
  tagline?: string;
  genres?: string;
  year?: string;
  rating?: string;
}
// TODAY'S SCREENINGS
// ─────────────────────────────────────────────────────────────────

export interface CassaScreening {
  subeventId: number;
  movieTitle: string;
  posterPath: string;
  dateFrom: string;
  dateTo: string;
  roomName: string;
  seatingPlanId: number;
  availableSeats: number | null; // null = unlimited
  isSoldOut: boolean;
  tmdbId: string | null;
  runtime: number;
  director: string;
  cast: string;
  backdropPath?: string;
  logoPath?: string;
  tagline?: string;
  genres?: string;
  year?: string;
  rating?: string;
}

async function mapSubEventsToCassaScreenings(subEvents: any[]): Promise<CassaScreening[]> {
  // Fetch quotas in parallel for all relevant sub-events
  const quotaResults = await Promise.all(
    subEvents.map((se: any) => listQuotas(se.id))
  );

  return Promise.all(
    subEvents.map(async (se: any, i: number) => {
      const quotas: any[] = quotaResults[i] || [];
      const interoQuota = quotas.find(
        (q: any) => Array.isArray(q.items) && q.items.includes(ITEM_INTERO_ID)
      );

      const isSoldOut = interoQuota
        ? interoQuota.available === false ||
          (interoQuota.available_number !== null &&
            interoQuota.available_number <= 0)
        : se.best_availability_state === 'sold_out';

      const availableSeats =
        interoQuota?.available_number !== undefined
          ? interoQuota.available_number
          : null;

      // Extract TMDB metadata from comment
      let tmdbId: string | null = null;
      let posterPath = '';
      let runtime = 120;
      let director = '';
      let cast = '';
      let backdropPath = '';
      let logoPath = '';
      let tagline = '';
      let genres = '';
      let year = '';
      let rating = '';

      if (se.comment) {
        try {
          const meta = JSON.parse(se.comment);
          tmdbId = meta.tmdbId || null;
          posterPath = meta.posterPath || '';
          runtime = meta.runtime || 120;
          director = meta.director || '';
          cast = meta.cast || '';
          backdropPath = meta.backdropPath || '';
          logoPath = meta.logoPath || '';
          tagline = meta.tagline || '';
          genres = meta.genres || '';
          year = meta.year || '';
          rating = meta.rating || '';
        } catch {}
      }

      const seatingPlanId = Number(se.seating_plan);
      const roomName = ROOM_NAMES[seatingPlanId] || se.seating_plan_name || 'SALA CINEMA';

      const movieTitle =
        typeof se.name === 'string' ? se.name : se.name?.it || 'Film';

      return {
        subeventId: se.id,
        movieTitle,
        posterPath,
        dateFrom: se.date_from,
        dateTo: se.date_to || '',
        roomName,
        seatingPlanId,
        availableSeats,
        isSoldOut,
        tmdbId,
        runtime,
        director,
        cast,
        backdropPath,
        logoPath,
        tagline,
        genres,
        year,
        rating,
      };
    })
  );
}

export async function cassaGetTodayScreenings(): Promise<CassaScreening[]> {
  const now = new Date();
  
  // Get today's date string in YYYY-MM-DD format (local time)
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;

  // futureOnly=true: only fetch events that haven't ended yet
  const allEvents = await listSubEvents(true);

  // Filter to exactly today's events, starting from 'now'
  const todayEvents = allEvents.filter((se: any) => {
    if (!se.active) return false;
    const start = new Date(se.date_from);
    
    const sy = start.getFullYear();
    const sm = String(start.getMonth() + 1).padStart(2, '0');
    const sd = String(start.getDate()).padStart(2, '0');
    const startDayStr = `${sy}-${sm}-${sd}`;
    
    return startDayStr === todayStr && start >= now;
  });

  return mapSubEventsToCassaScreenings(todayEvents);
}

/**
 * Fetches screenings for a specific day (YYYY-MM-DD).
 * Useful for navigating between days in the POS.
 */
export async function cassaGetScreenings(dateStr: string): Promise<CassaScreening[]> {
  // allEvents includes future sub-events
  const allEvents = await listSubEvents(true);

  // filter events starting on exactly that day (local time)
  const dayScreenings = allEvents.filter((se: any) => {
    if (!se.active) return false;
    const start = new Date(se.date_from);
    const y = start.getFullYear();
    const m = String(start.getMonth() + 1).padStart(2, '0');
    const d = String(start.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}` === dateStr;
  });

  return mapSubEventsToCassaScreenings(dayScreenings);
}

/**
 * Searches for alternative future screenings of a specific movie.
 * Scans all future sub-events and filters by title, then checks for availability.
 */
export async function cassaFindAlternatives(movieTitle: string, excludeSubeventId?: number): Promise<CassaScreening[]> {
  // 1. Fetch all future events
  const allFuture = await listSubEvents(true);
  
  // 2. Filter by movie title (case-insensitive, accent-insensitive, partial match)
  const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const normalizedSearch = normalize(movieTitle);
  const matchingEvents = allFuture.filter((se: any) => {
    if (!se.active || se.id === excludeSubeventId) return false;
    const name = typeof se.name === 'string' ? se.name : se.name?.it || '';
    return normalize(name).includes(normalizedSearch);
  });

  // 3. Limit investigation to top 10 matches for performance
  const topMatches = matchingEvents.slice(0, 10);

  // 4. Map them to CassaScreenings (this fetches quotas for each)
  const screenings = await mapSubEventsToCassaScreenings(topMatches);

  // 5. Return only those that are NOT sold out, ordered by date
  return screenings
    .filter(s => !s.isSoldOut)
    .sort((a, b) => new Date(a.dateFrom).getTime() - new Date(b.dateFrom).getTime());
}

// ─────────────────────────────────────────────────────────────────
// SEATS FOR A SCREENING
// ─────────────────────────────────────────────────────────────────

export interface CassaSeat {
  guid: string;
  name: string;
  row: string;
  seat: string;
  isVip: boolean;
  isBlocked: boolean; // already sold / blocked by Pretix
}

export async function cassaGetSeats(subeventId: number): Promise<CassaSeat[]> {
  const seats = await getSubEventSeats(subeventId);
  return seats.map((s: any) => {
    const isVip =
      s.product === ITEM_VIP_ID ||
      (typeof s.seat_guid === 'string' &&
        s.seat_guid.toUpperCase().includes('VIP'));

    // 1. Try to use Pretix dedicated fields (row_name, seat_number)
    // 2. Fallback to extracting from name if fields are empty
    let row = s.row_name || '';
    let seat = s.seat_number || '';

    if (!row || !seat) {
      const rowMatch = s.name?.match(/(?:Row|Fila)\s*(\w+)/i);
      const seatMatch = s.name?.match(/(?:Seat|Posto)\s*(\w+)/i);
      row = row || rowMatch?.[1] || '-';
      seat = seat || seatMatch?.[1] || s.name || '-';
    }

    return {
      guid: s.seat_guid || String(s.id),
      name: s.name || s.seat_guid || `Posto ${s.id}`,
      row,
      seat,
      isVip,
      isBlocked: !!s.blocked || !!s.orderposition,
    };
  });
}

// ─────────────────────────────────────────────────────────────────
// CREATE ORDER (CORE ACTION)
// ─────────────────────────────────────────────────────────────────

export interface CassaOrderResult {
  success: boolean;
  orderCode: string;
  orderUrl: string;
  records: CassaTicketRecord[];
}

export async function cassaExecuteSale(params: {
  subeventId: number;
  seats: {
    guid: string;
    name: string;
    row: string;
    seat: string;
  }[];
  movieTitle: string;
  screening: string;
  roomName: string;
  prezzoFisico: string;
  runtime: number;
  director: string;
  cast: string;
  backdropPath?: string;
  logoPath?: string;
  tagline?: string;
  genres?: string;
  year?: string;
  rating?: string;
}): Promise<CassaOrderResult> {
  // 1. Create order on Pretix (price always 0.00)
  const order = await createCassaOrder({
    subeventId: params.subeventId,
    seats: params.seats.map(s => ({ guid: s.guid })),
  });

  const orderCode: string = order.code;
  const orderUrl = `https://pretix.eu/vestri/npkez/order/${orderCode}/`;

  // 2. Build archive records for each position
  const now = new Date();
  const datePrefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  
  const records: CassaTicketRecord[] = order.positions.map((pos: any, index: number) => {
    // Find the seat info from params for this position
    const seatInfo = params.seats.find(s => s.guid === pos.seat_guid) || params.seats[index];
    const ticketId = `${datePrefix}_${orderCode}_${index + 1}`;

    return {
      id: ticketId,
      orderCode,
      date: now.toISOString(),
      movieTitle: params.movieTitle,
      screening: params.screening,
      room: params.roomName,
      seatName: seatInfo.name,
      seatGuid: pos.seat_guid,
      rowLabel: seatInfo.row,
      seatLabel: seatInfo.seat,
      price: params.prezzoFisico || '0.00',
      subeventId: params.subeventId,
      qrValue: pos.secret || orderCode,
      backdropPath: params.backdropPath,
      logoPath: params.logoPath,
      tagline: params.tagline,
      genres: params.genres,
      year: params.year,
      rating: params.rating,
    };
  });

  // 3. (REMOVED) Save records to archive index
  // We no longer write to the file system to avoid EROFS on Vercel.
  // Records are returned directly to the client for processing.

  revalidatePath('/admin/cassa');
  revalidatePath('/');

  return { success: true, orderCode, orderUrl, records };
}


// ─────────────────────────────────────────────────────────────────
// RECENT SALES
// ─────────────────────────────────────────────────────────────────

export async function cassaGetRecentSales(limit = 50): Promise<CassaTicketRecord[]> {
  // Stateless POS: Recent sales are no longer stored on the server disk.
  return [];
}

// ─────────────────────────────────────────────────────────────────
// CLEANUP — delete PDFs older than 7 days
// ─────────────────────────────────────────────────────────────────

export async function cassaCleanupOldPDFs(): Promise<{ deleted: number; kept: number }> {
  // Stateless POS: No longer managing PDF files on disk.
  return { deleted: 0, kept: 0 };
}


