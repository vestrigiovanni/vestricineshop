import { NextResponse } from 'next/server';
import { dalMac } from '@/lib/segretoMac';
import { abbinaInAttesa, completaSchede } from '@/gestionale/catalogo/abbina';
import { chiudiGiro, riceviFilm, type FilmPlex } from '@/gestionale/catalogo/plex';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/catalog/plex-sync — la libreria Plex del cinema, spinta dal Mac
 * (`scripts/plex-sync.mjs`, segreto `CATALOG_SYNC_SECRET`). Identica alla v1:
 * - `{ films }` a blocchi: i film, già fusi fra le librerie;
 * - `{ finalize: true, allPlexKeys }`: chi non c'è più esce dalla libreria;
 * - `{ enrich: 'tmdb' | 'backfill' }`: abbina a TMDB i nuovi, completa le schede.
 */
export async function POST(request: Request) {
  if (!dalMac(request)) return NextResponse.json({ error: 'Non autorizzato.' }, { status: 401 });

  let body: { films?: FilmPlex[]; finalize?: boolean; allPlexKeys?: string[]; enrich?: 'tmdb' | 'backfill' };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo della richiesta non valido.' }, { status: 400 });
  }

  try {
    if (body.enrich === 'tmdb') return NextResponse.json(await abbinaInAttesa(25));
    if (body.enrich === 'backfill') return NextResponse.json(await completaSchede(25));
    if (body.finalize) {
      // Una lista vuota vorrebbe dire «svuota la libreria»: quasi sempre è un giro interrotto.
      if (!Array.isArray(body.allPlexKeys) || body.allPlexKeys.length === 0) {
        return NextResponse.json({ error: 'allPlexKeys mancante o vuoto: non marco l\'intera libreria come uscita.' }, { status: 400 });
      }
      return NextResponse.json(await chiudiGiro(body.allPlexKeys.map(String)));
    }
    if (!Array.isArray(body.films)) return NextResponse.json({ error: 'Serve `films` (array) oppure `finalize: true`.' }, { status: 400 });
    return NextResponse.json(await riceviFilm(body.films));
  } catch (e) {
    console.error('[plex-sync]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore interno.' }, { status: 500 });
  }
}
