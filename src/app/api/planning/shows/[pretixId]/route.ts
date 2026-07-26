import { NextResponse } from 'next/server';
import { apiError, requireApiKey } from '@/services/apiAuth';
import { planningDeleteShow } from '@/actions/planningActions';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/planning/shows/{pretixId} → elimina uno spettacolo.
 *
 * Toglie il sub-evento da Pretix, la riga dal database e, se era l'ultima
 * proiezione di quel film, anche i metadati rimasti orfani.
 *
 * ATTENZIONE, LATO CLIENT — è irreversibile e si vede subito online.
 *
 * Se ci sono biglietti già venduti risponde **409** con `{ error, soldTickets }`
 * e non cancella niente. Per procedere comunque si ripete la chiamata con
 * `?force=1`: da fare solo sapendo che gli ordini di chi ha pagato restano
 * orfani e vanno gestiti a mano dal pannello Pretix.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ pretixId: string }> }
) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  try {
    const { pretixId } = await params;
    const id = Number(pretixId);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { error: 'Identificativo dello spettacolo non valido.' },
        { status: 400 }
      );
    }

    const force = new URL(request.url).searchParams.get('force') === '1';
    const result = await planningDeleteShow(id, force);

    if (!result.deleted) {
      return NextResponse.json(
        { error: result.error, soldTickets: result.soldTickets },
        { status: 409 }
      );
    }

    return NextResponse.json({ deleted: true, soldTickets: result.soldTickets });
  } catch (err) {
    return apiError(err);
  }
}
