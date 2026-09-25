'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import TicketPDF, { generateTicketPDF } from '@/components/TicketPDF';
import TicketCard from '@/components/TicketCard/TicketCard';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import styles from './success.module.css';

function SuccessContent() {
  const searchParams = useSearchParams();
  const subeventId = searchParams.get('subeventId');
  const [orderData, setOrderData] = useState<any>(null);
  // Il riepilogo vive in sessionStorage: letto, sappiamo se c'è o no.
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (subeventId) {
      const saved = sessionStorage.getItem(`order_${subeventId}`);
      if (saved) setOrderData(JSON.parse(saved));
    }
    setChecked(true);
  }, [subeventId]);

  const handleDownloadPDF = async () => {
    if (!orderData) return;
    setLoading(true);
    try {
      const ticketIds = orderData.tickets.map((t: any) => `full-ticket-${t.secret}`);
      await generateTicketPDF(ticketIds, `biglietti_${orderData.orderCode}`, null, true);
    } catch (err) {
      console.error('Failed to generate PDF', err);
    } finally {
      setLoading(false);
    }
  };

  if (!orderData) {
    return (
      <div className={`cabina pubblico ${styles.page}`}>
        <div className={styles.content}>
          <h1 className={styles.title}>{checked ? 'Riepilogo non trovato' : 'Un attimo'}</h1>
          <p className={styles.note}>
            {checked
              ? 'Il riepilogo si apre nella finestra in cui hai prenotato. Se hai lasciato l’email, il biglietto è anche lì.'
              : 'Caricamento dati ordine…'}
          </p>
          <Link href="/" className={styles.ghost}>‹ Home</Link>
        </div>
      </div>
    );
  }

  const { tickets, orderCode, subeventData, isAnonymous } = orderData;
  const backdrop = subeventData?.backdropPath ? getTMDBImageUrl(subeventData.backdropPath, 'w1280') : null;

  return (
    <div className={`cabina pubblico ${styles.page}`}>
      {backdrop && (
        <div className={styles.backdrop} aria-hidden="true">
          <Image src={backdrop} alt="" fill sizes="100vw" style={{ objectFit: 'cover' }} priority />
        </div>
      )}
      <div className={styles.shade} aria-hidden="true" />

      <div className={styles.content}>
        <p className={styles.kicker}>✓ Prenotato · ordine <span>{orderCode}</span></p>
        <h1 className={styles.title}>Ci vediamo in sala.</h1>

        <TicketCard
          title={subeventData?.movieTitle || 'Film'}
          logoPath={subeventData?.logoPath}
          date={subeventData?.date}
          roomName={subeventData?.roomName}
          duration={subeventData?.duration}
          orderCode={orderCode}
          tickets={tickets}
        />

        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={handleDownloadPDF} disabled={loading}>
            {loading ? 'Generazione PDF…' : 'Scarica PDF'}
          </button>
          <Link href="/" className={styles.ghost}>‹ Home</Link>
        </div>

        <p className={styles.note}>
          {isAnonymous ? 'Niente email: scarica il biglietto adesso.' : 'Ti arriva anche una copia via email.'} All&apos;ingresso mostra il QR.
        </p>
      </div>

      {/* Area nascosta per il PDF, a grandezza vera, fuori dalla pagina. */}
      <div style={{ position: 'fixed', top: 0, left: '-9999px', pointerEvents: 'none' }}>
        {tickets.map((ticket: any, idx: number) => (
          <TicketPDF
            key={`full-${ticket.id}`}
            preview={false}
            id={`full-ticket-${ticket.secret}`}
            backdropIndex={idx}
            data={{
              ...subeventData,
              seatName: ticket.seat_name || 'Posto Unico',
              orderCode: orderCode,
              qrSecret: ticket.secret,
              purchaseDate: new Date().toLocaleDateString('it-IT'),
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="cabina pubblico" />}>
      <SuccessContent />
    </Suspense>
  );
}
