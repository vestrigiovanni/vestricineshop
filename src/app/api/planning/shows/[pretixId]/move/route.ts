import { NextResponse } from 'next/server';
import { apiError, requireApiKey } from '@/services/apiAuth';
import {
  planningCheckMove,
  planningMoveShow,
  planningDefaultStartDate,
} from '@/actions/planningActions';
import { daysBetweenISO } from '@/services/scheduling/times';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Come in /slots/check: oltre questo scarto la sala non viene più letta. */
const MAX_DAY_OFFSET = 58;

/**
 * Spostare uno spettacolo che è già in cartellone.
 *
 *   GET  /api/planning/shows/{pretixId}/move?room=12&day=2026-08-09&time=21:00
 *   POST /api/planning/shows/{pretixId}/move
 *
 * Due verbi per due cose diverse, ed è deliberato: qui il pubblico c'è già e
 * ogni scrittura si vede online l'istante dopo, quindi si guarda (GET), si
 * decide, e solo allora si scrive (POST). Il pannello che l'utente ha letto
 * non è ciò su cui il server si fida: il POST ricontrolla tutto da capo.
 *
 * **Lo spettacolo non viene ricreato**: cambia data al sub-evento Pretix che
 * esiste già. Chi ha comprato il biglietto se lo tiene — cambia l'orario, non
 * lo spettacolo. È la differenza fra spostare e cancellare-e-rifare, e per chi
 * ha pagato è tutta la differenza che c'è.
 */

/** Giorno e ora di destinazione, comuni ai due verbi. */
function readDestination(url: URL) {
  return {
    room: Number(url.searchParams.get('room')),
    day: (url.searchParams.get('day') ?? '').trim(),
    time: (url.searchParams.get('time') ?? '').trim(),
    from: url.searchParams.get('from'),
  };
}

/** I controlli che valgono per entrambi. Restituisce l'errore, o null. */
function refuse(room: number, day: string, time: string, from: string | null) {
  if (!Number.isFinite(room) || room <= 0) {
    return 'Parametro `room` mancante o non valido.';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return 'Parametro `day` mancante o non valido: atteso YYYY-MM-DD.';
  }
  if (!time) return 'Parametro `time` mancante: atteso HH:mm.';
  if (from !== null && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return 'Parametro `from` atteso nel formato YYYY-MM-DD.';
  }
  return null;
}

/**
 * L'origine dell'asse dei minuti, con i limiti oltre i quali la sala non si
 * legge più. Un giorno fuori finestra risulterebbe vuoto, e ogni orario libero:
 * meglio un rifiuto esplicito che un "libero" falso, che si scoprirebbe solo
 * dopo — con due film sulla stessa sala.
 */
async function resolveFromDate(day: string, from: string | null) {
  const fromDate = from ?? (await planningDefaultStartDate());
  const offset = daysBetweenISO(fromDate, day);
  if (offset < 0) {
    return { error: `Il giorno scelto viene prima di ${fromDate}: sposta \`from\` indietro per controllarlo.` };
  }
  if (offset > MAX_DAY_OFFSET) {
    return { error: `Il giorno scelto è oltre ${MAX_DAY_OFFSET} giorni da ${fromDate}: troppo in là per controllare la sala.` };
  }
  return { fromDate };
}

function readPretixId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Si può portarlo lì? Non sposta niente.
 *
 * Risponde nella stessa forma di `/slots/check`, che l'app sa già leggere, più
 * `movingShowSoldTickets`: quanti biglietti ci sono sullo spettacolo che si
 * muove. Non è un ostacolo — restano validi — ma è ciò che dice all'utente
 * quanta gente troverà un orario diverso da quello che aveva letto.
 * `null` significa «non sono riuscito a contarli», e non va confuso con zero.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ pretixId: string }> }
) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  try {
    const pretixId = readPretixId((await params).pretixId);
    if (pretixId === null) {
      return NextResponse.json({ error: 'Identificativo dello spettacolo non valido.' }, { status: 400 });
    }

    const { room, day, time, from } = readDestination(new URL(request.url));
    const bad = refuse(room, day, time, from);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });

    const origin = await resolveFromDate(day, from);
    if (origin.error) return NextResponse.json({ error: origin.error }, { status: 400 });

    return NextResponse.json({
      ...(await planningCheckMove({
        seatingPlanId: room,
        pretixId,
        day,
        time,
        fromDate: origin.fromDate!,
      })),
      fromDate: origin.fromDate,
    });
  } catch (err) {
    return apiError(err);
  }
}

/**
 * ⚠️ Sposta davvero. Si vede online nell'istante dopo.
 *
 * Body: `{ room, day, time, from?, replaces?, force?, allowOutsideHours? }`.
 *
 * `replaces` non è un'opzione ma una dichiarazione: sono gli id che l'utente ha
 * *visto* nel controllo e ha accettato di eliminare. Se al momento di scrivere
 * la destinazione è occupata da qualcos'altro — comparso nei minuti in cui
 * l'utente decideva — il sito si ferma, perché quella cosa lì non era nella
 * decisione. `force` è il consenso a togliere ciò che ha già biglietti venduti,
 * e vale su quello che si sostituisce: lo spettacolo spostato non perde niente.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ pretixId: string }> }
) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  try {
    const pretixId = readPretixId((await params).pretixId);
    if (pretixId === null) {
      return NextResponse.json({ error: 'Identificativo dello spettacolo non valido.' }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as {
      room?: number;
      day?: string;
      time?: string;
      from?: string | null;
      replaces?: number[];
      force?: boolean;
      allowOutsideHours?: boolean;
    } | null;

    if (!body) {
      return NextResponse.json({ error: 'Corpo della richiesta mancante o non leggibile.' }, { status: 400 });
    }

    const room = Number(body.room);
    const day = (body.day ?? '').trim();
    const time = (body.time ?? '').trim();
    const from = body.from ?? null;

    const bad = refuse(room, day, time, from);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });

    const replaces = Array.isArray(body.replaces)
      ? body.replaces.filter((v) => Number.isInteger(v) && v > 0)
      : [];

    const origin = await resolveFromDate(day, from);
    if (origin.error) return NextResponse.json({ error: origin.error }, { status: 400 });

    const result = await planningMoveShow({
      seatingPlanId: room,
      pretixId,
      day,
      time,
      fromDate: origin.fromDate!,
      replaces,
      force: body.force === true,
      allowOutsideHours: body.allowOutsideHours === true,
    });

    // Un rifiuto non è un errore del client: la richiesta era ben formata, è la
    // sala che non lo permette. 409 — e `deleted` viaggia comunque, perché se
    // qualcosa è già stato tolto chi ha chiamato deve saperlo.
    if (!result.moved) {
      return NextResponse.json(
        { moved: false, deleted: result.deleted, error: result.error },
        { status: 409 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
