/**
 * Ridà il trailer ai film che ne sono rimasti senza.
 *
 * PERCHÉ ESISTE — fino a questo fix la riga `MovieOverride` di un film appena
 * programmato nasceva completa di tutto tranne che del trailer, e l'unica
 * funzione capace di riempirlo dopo (l'idratazione profonda in `sync.service`)
 * gira solo su record mancanti o stub: quel film restava senza trailer per
 * sempre. Il codice ora scrive il trailer alla nascita, ma i film già in
 * palinsesto vanno recuperati una volta a mano — è quello che fa questo script.
 *
 * COSA TOCCA — solo `customTrailerUrl` e `customTrailerKeys`, e solo dove sono
 * vuoti. Niente poster, niente titoli, niente premi: le correzioni fatte a mano
 * in `/admin/movies-control` restano dove sono.
 *
 * USO
 *   npx tsx scripts/backfill-trailers.ts           i film con proiezioni attive
 *   npx tsx scripts/backfill-trailers.ts --all     tutto il catalogo locale
 *   npx tsx scripts/backfill-trailers.ts --dry     dice cosa farebbe, senza scrivere
 *   npx tsx scripts/backfill-trailers.ts --force   riestrae anche dove il trailer c'è già
 */

import * as dotenv from 'dotenv';

// L'ordine conta: `src/lib/prisma` legge DATABASE_URL nel momento in cui viene
// importato, quindi le variabili vanno caricate prima — e con un import statico
// non si può, perché gli import vengono valutati tutti per primi. Da qui il
// dynamic import più sotto.
dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', quiet: true });

const args = new Set(process.argv.slice(2));
const ALL = args.has('--all');
const DRY = args.has('--dry');
const FORCE = args.has('--force');

async function main() {
  const prisma = (await import('../src/lib/prisma')).default;
  const { getEnrichedMovieMetadata } = await import('../src/services/tmdb');

  const targets: { tmdbId: string; customTitle: string | null }[] = ALL
    ? await prisma.movieOverride.findMany({ select: { tmdbId: true, customTitle: true } })
    : await prisma.$queryRaw`
        SELECT DISTINCT m."tmdbId", m."customTitle"
        FROM "PretixSync" p
        JOIN "MovieOverride" m ON p."tmdbId" = m."tmdbId"
        WHERE p."active" = true AND p."isHidden" = false
      `;

  console.log(
    `🎬 ${targets.length} film da controllare (${ALL ? 'tutto il catalogo' : 'solo con proiezioni attive'})${DRY ? ' · prova a vuoto' : ''}\n`
  );

  let riempiti = 0;
  let giaOk = 0;
  let senzaTrailer = 0;

  for (const t of targets) {
    const row = (await prisma.movieOverride.findUnique({ where: { tmdbId: t.tmdbId } })) as any;
    const haUrl = !!row?.customTrailerUrl;
    const haKeys = (row?.customTrailerKeys?.length ?? 0) > 0;

    if (haUrl && haKeys && !FORCE) {
      giaOk++;
      continue;
    }

    const metadata = await getEnrichedMovieMetadata(t.tmdbId);
    const keys: string[] = metadata?.trailerKeys || [];

    if (!metadata || keys.length === 0) {
      console.log(`⚠️  ${t.customTitle ?? t.tmdbId}: nessun trailer su TMDB`);
      senzaTrailer++;
      continue;
    }

    // L'url già scelto a mano vince sempre: è la scelta di chi programma, e
    // questo script è qui per riempire i vuoti, non per sovrascriverla.
    const url = (!FORCE && haUrl) ? row.customTrailerUrl : (metadata.trailerUrl || null);

    console.log(
      `🍿 ${metadata.title} (${metadata.original_language}): ${keys.length} trailer · primo ${keys[0]}`
    );

    if (!DRY) {
      await prisma.movieOverride.update({
        where: { tmdbId: t.tmdbId },
        data: { customTrailerUrl: url, customTrailerKeys: keys } as any,
      });
    }
    riempiti++;
  }

  console.log(
    `\n✅ ${DRY ? 'da riempire' : 'riempiti'}: ${riempiti} · già a posto: ${giaOk} · senza trailer su TMDB: ${senzaTrailer}`
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ backfill fallito:', e);
  process.exit(1);
});
