/**
 * Le richieste che arrivano dai programmi sul Mac di Giovanni (Plex, Critica
 * dal trailer) portano il segreto CATALOG_SYNC_SECRET. Senza segreto
 * configurato sul sito, nessuna passa.
 */
export function dalMac(request: Request): boolean {
  const segreto = process.env.CATALOG_SYNC_SECRET;
  if (!segreto) return false;
  return request.headers.get('authorization') === `Bearer ${segreto}`;
}
