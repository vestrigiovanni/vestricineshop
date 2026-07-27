import { NextResponse } from 'next/server';
import { apiError, requireApiKey } from '@/services/apiAuth';
import { catalogPreviewTmdb } from '@/actions/catalogActions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/planning/tmdb/{tmdbId} → il film nella forma del catalogo.
 *
 * Serve a programmare un titolo di passaggio: gli spettacoli leggono titolo,
 * durata e locandina da TMDB, non dalla riga di catalogo. Questa rotta quindi
 * **non scrive**: se il film in catalogo c'è già i suoi dati vincono, ma se non
 * c'è resta fuori. Aggiungerlo è una decisione a parte, POST /api/planning/catalog.
 *
 * 404 se TMDB non conosce l'id.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tmdbId: string }> }
) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  try {
    const { tmdbId } = await params;
    if (!/^\d+$/.test(tmdbId)) {
      return NextResponse.json({ error: 'Identificativo TMDB non valido.' }, { status: 400 });
    }

    const film = await catalogPreviewTmdb(tmdbId);
    if (!film) {
      return NextResponse.json({ error: 'TMDB non conosce questo film.' }, { status: 404 });
    }
    return NextResponse.json(film);
  } catch (err) {
    return apiError(err);
  }
}
