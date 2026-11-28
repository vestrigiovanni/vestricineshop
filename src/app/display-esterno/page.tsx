import type { Metadata } from 'next';
import Schermo from '@/display/Schermo';
import { caricaDisplay, type DatiDisplay } from '@/display/carica';
import '@/display/display.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Vestri Cinema · Oggi in sala',
  robots: { index: false, follow: false },
};

/**
 * Lo schermo all'ingresso: gli spettacoli di oggi e dei prossimi giorni, coi
 * posti rimasti letti dalle quote di Pretix. Stesso indirizzo della v1
 * (`/display-esterno`), così lo schermo non va riconfigurato. La pagina parte
 * già piena e poi si aggiorna da sola (`/api/display`); se il database non
 * risponde al primo colpo parte vuota e riprova.
 */
export default async function DisplayEsterno() {
  let iniziale: DatiDisplay | null = null;
  try {
    iniziale = await caricaDisplay();
  } catch (e) {
    console.error('[display-esterno]', e);
  }
  return <Schermo iniziale={iniziale} />;
}
