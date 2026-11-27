'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { rileggiPosti } from '@/programma/azioni';
import { useAvviso } from '../Avviso';

/** «Adesso» invecchia: con la scheda visibile, la stanza si rilegge ogni minuto. */
export function Rinfresca({ ogni = 60_000 }: { ogni?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, ogni);
    return () => window.clearInterval(id);
  }, [router, ogni]);
  return null;
}

/** I posti liberi di tutti gli spettacoli futuri, riletti da Pretix. */
export function RileggiPosti({ etichetta }: { etichetta: string }) {
  const router = useRouter();
  const di = useAvviso();
  const [lavoro, setLavoro] = useState(false);
  const vai = async () => {
    setLavoro(true);
    try {
      const r = await rileggiPosti();
      di(`Posti riletti da Pretix: ${r.count} spettacoli aggiornati.`);
      router.refresh();
    } catch {
      di('Pretix non ha risposto. Riprova fra poco.', 'errore');
    } finally {
      setLavoro(false);
    }
  };
  return <button type="button" className="g-tasto g-tasto--piccolo" onClick={vai} disabled={lavoro}>{lavoro ? 'Rileggo…' : etichetta}</button>;
}
