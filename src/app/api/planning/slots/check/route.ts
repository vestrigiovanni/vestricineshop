import { NextResponse } from 'next/server';
import { apiError, requireApiKey } from '@/services/apiAuth';
import { planningCheckManualSlot, planningDefaultStartDate } from '@/actions/planningActions';
import { daysBetweenISO } from '@/services/scheduling/times';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Oltre questo scarto dall'origine la sala non viene più letta: vedi sotto. */
const MAX_DAY_OFFSET = 58;

/**
 * GET /api/planning/slots/check?room=12&tmdb=27205&day=2026-08-01&time=21:00
 *   &from=2026-08-01
 *
 * L'altra metà di GET /api/planning/slots: quella propone il libero, questa
 * risponde su un orario deciso a mano. Se è occupato non dice solo "no", dice
 * *cosa* c'è e quanti biglietti ci sono sopra, così l'app può offrire la
 * sostituzione con il prezzo scritto in chiaro.
 *
 * Non tocca niente: la rimozione dei conflitti avviene solo alla conferma,
 * dentro POST /api/planning/commit.
 *
 * `from` è l'origine dell'asse dei minuti, non un filtro: passa lo stesso
 * `fromDate` che ti ha restituito /api/planning/slots, così `startMinute` e
 * `endMinute` di questo slot sono confrontabili con quelli delle proposte. Se
 * lo ometti si parte dal primo giorno programmabile, e la risposta lo dice.
 */
export async function GET(request: Request) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const room = Number(url.searchParams.get('room'));
  const tmdb = (url.searchParams.get('tmdb') ?? '').trim();
  const day = (url.searchParams.get('day') ?? '').trim();
  const time = (url.searchParams.get('time') ?? '').trim();
  const from = url.searchParams.get('from');

  if (!Number.isFinite(room) || room <= 0) {
    return NextResponse.json({ error: 'Parametro `room` mancante o non valido.' }, { status: 400 });
  }
  if (!/^\d+$/.test(tmdb)) {
    return NextResponse.json({ error: 'Parametro `tmdb` mancante o non valido: serve un id TMDB numerico.' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json({ error: 'Parametro `day` mancante o non valido: atteso YYYY-MM-DD.' }, { status: 400 });
  }
  if (!time) {
    return NextResponse.json({ error: 'Parametro `time` mancante: atteso HH:mm.' }, { status: 400 });
  }
  if (from !== null && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return NextResponse.json({ error: 'Parametro `from` atteso nel formato YYYY-MM-DD.' }, { status: 400 });
  }

  // Un orario scritto storto non è un errore di protocollo: il controllo lo
  // riconosce e lo spiega in italiano, ed è quel messaggio che l'app deve
  // mostrare. Qui si ferma solo ciò che manca del tutto.

  try {
    const fromDate = from ?? (await planningDefaultStartDate());

    // La sala viene letta a partire da `fromDate` e per una finestra limitata:
    // un giorno fuori da quella finestra risulterebbe vuoto, e ogni orario
    // libero. Meglio un rifiuto esplicito che un "libero" falso, che si
    // scoprirebbe solo al commit — con lo spettacolo sopra un altro.
    const offset = daysBetweenISO(fromDate, day);
    if (offset < 0) {
      return NextResponse.json(
        { error: `Il giorno scelto viene prima di ${fromDate}: sposta \`from\` indietro per controllarlo.` },
        { status: 400 }
      );
    }
    if (offset > MAX_DAY_OFFSET) {
      return NextResponse.json(
        { error: `Il giorno scelto è oltre ${MAX_DAY_OFFSET} giorni da ${fromDate}: troppo in là per controllare la sala.` },
        { status: 400 }
      );
    }

    // `fromDate` torna indietro perché può essere stato deciso qui: senza,
    // l'app non saprebbe su quale asse leggere `startMinute`.
    return NextResponse.json({
      ...(await planningCheckManualSlot({ seatingPlanId: room, tmdbId: tmdb, day, time, fromDate })),
      fromDate,
    });
  } catch (err) {
    return apiError(err);
  }
}
