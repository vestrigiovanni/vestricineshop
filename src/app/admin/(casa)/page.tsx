'use client';

/**
 * "Oggi", versione provvisoria.
 *
 * Fino alla tappa 2 del restyling qui vive il vecchio pannello: contiene ancora
 * Sale, Display, Catalogo, Recupero biglietti e la lista di Pretix, che non
 * hanno una stanza loro. Prima stava in un overlay sopra la home pubblica;
 * adesso ha un indirizzo, e la X della programmazione non porta più a un 404.
 */
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { adminListEvents } from '@/actions/adminActions';

const AdminPanel = dynamic(() => import('@/components/Admin/AdminPanel'), { ssr: false });

type Events = Awaited<ReturnType<typeof adminListEvents>>;

export default function OggiProvvisorio() {
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
