// Interruttore della "modalità vetrina": con VESTRI_SYNC_OFF=1 nessuna sincronizzazione
// con Pretix scrive nel database. Serve quando Claude apre il sito in locale per
// guardare il design: il DB Neon è quello vero, condiviso con app, social e gioco.
export function isSyncOff(env: Record<string, string | undefined> = process.env): boolean {
  return env.VESTRI_SYNC_OFF === '1';
}
