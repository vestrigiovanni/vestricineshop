import { cookies } from 'next/headers';
import { COOKIE, chiavi, sessioneValida } from './sessione';

/** C'è il cookie firmato e non scaduto? */
export async function entrato(): Promise<boolean> {
  const segreto = chiavi()?.segreto;
  return sessioneValida((await cookies()).get(COOKIE)?.value, Date.now(), segreto);
}

/**
 * La prima riga di ogni azione del gestionale. Le azioni del server si possono
 * chiamare da qualsiasi pagina, non solo da /admin: il proxy non basta.
 */
export async function soloGestionale(): Promise<void> {
  if (!(await entrato())) throw new Error('Serve il login del gestionale.');
}
