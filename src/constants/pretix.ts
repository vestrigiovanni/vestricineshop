export const ITEM_INTERO_ID = 264975;
export const ITEM_VIP_ID = 344653;

// Cache per le planimetrie delle sale.
// IMPORTANTE: usa /tmp (path di sistema) che è scrivibile sia in locale che su Vercel Serverless.
// process.cwd()/tmp è read-only su Vercel — questa è la fix corretta.
export const SEATING_PLANS_CACHE_FILE = '/tmp/vestricinema_seating_plans.json';

// Whitelist esplicita ID sale da Pretix.
// Solo le sale incluse in questa lista verranno mostrate nel sito.
// Se vuoto [], vengono mostrate tutte (escluse quelle con "SALA 0" o "TEST" nel nome).
export const ALLOWED_ROOM_IDS: number[] = [5392, 9659, 7354, 9624, 6439, 10557, 10741, 10742, 10743];
