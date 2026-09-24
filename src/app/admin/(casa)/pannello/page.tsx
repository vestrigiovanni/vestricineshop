'use client';

/**
 * Il vecchio pannello, in attesa di trasloco.
 *
 * Contiene ancora Sale, Display, Catalogo, Recupero biglietti, la lista di
 * Pretix e la pulizia delle proiezioni vuote. Ognuna di queste cose si sposta
 * nella sua stanza nelle prossime tappe; quando l'ultima se ne va, se ne va
 * anche questa pagina.
 */
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { adminListEvents } from '@/actions/adminActions';

const AdminPanel = dynamic(() => import('@/components/Admin/AdminPanel'), { ssr: false });

type Events = Awaited<ReturnType<typeof adminListEvents>>;

export default function PannelloProvvisorio() {
  const [events, setEvents] = useState<Events | null>(null);

  useEffect(() => {
    adminListEvents()
      .then((list) => setEvents(list ?? []))
      .catch((err) => {
        console.error(err);
        setEvents([]);
      });
  }, []);

  if (!events) {
    return (
      <p style={{ padding: '2rem', fontFamily: 'var(--c-font-mono)', fontSize: 12, color: 'var(--c-dim)' }}>
        Carico la programmazione…
      </p>
    );
  }
  return <AdminPanel initialEvents={events} />;
}
