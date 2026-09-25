'use client';

import { useState } from 'react';
import Image from 'next/image';
import { QRCodeSVG } from 'qrcode.react';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import { formatShowDayLong, formatShowTime } from '@/utils/cinemaDate';
import { shortSeat } from '../bookingText';
import styles from './TicketCard.module.css';

export interface TicketCardTicket {
  secret: string;
  seat_name?: string;
}

interface TicketCardProps {
  title: string;
  logoPath?: string;
  /** Inizio dello spettacolo, ISO. */
  date: string;
  /** "SALA 1" come la scrive CheckoutButton. */
  roomName?: string;
  duration?: number;
  orderCode: string;
  tickets: TicketCardTicket[];
}

/**
 * Il biglietto disegnato in pagina: lo stesso nel cassetto, subito dopo la
 * conferma, e su /success. Serve a vederlo e a mostrare il QR all'ingresso.
 * Il PDF resta quello di TicketPDF, del progetto 4.
 */
export default function TicketCard({ title, logoPath, date, roomName, duration, orderCode, tickets }: TicketCardProps) {
  const [index, setIndex] = useState(0);
  if (tickets.length === 0) return null;

  const ticket = tickets[Math.min(index, tickets.length - 1)];
  const seat = ticket.seat_name ? shortSeat(ticket.seat_name) : 'Posto unico';
  const room = (roomName || '').replace(/^sala\s*/i, '') || '—';
  const small = [duration ? `${duration} min` : '', `Ordine ${orderCode}`].filter(Boolean).join(' · ');

  return (
    <article className={styles.card} aria-label={`Biglietto ${index + 1} di ${tickets.length}: ${title}`}>
      <div className={styles.main}>
        {logoPath ? (
          <Image src={getTMDBImageUrl(logoPath, 'w500')!} alt={title} width={320} height={96} className={styles.logo} />
        ) : (
          <h2 className={styles.title}>{title}</h2>
        )}
        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt className={styles.label}>Quando</dt>
            <dd className={`${styles.value} ${styles.when}`}>{formatShowDayLong(date)} · {formatShowTime(date)}</dd>
          </div>
          <div className={styles.fact}>
            <dt className={styles.label}>Posto</dt>
            <dd className={styles.value}>{seat}</dd>
          </div>
          <div className={styles.fact}>
            <dt className={styles.label}>Sala</dt>
            <dd className={styles.value}>{room}</dd>
          </div>
        </dl>
        <p className={styles.small}>{small}</p>
      </div>

      <div className={styles.stub}>
        <div className={styles.qr}>
          <QRCodeSVG value={ticket.secret} size={88} bgColor="#efe6d8" fgColor="#100d0a" />
        </div>
        {tickets.length > 1 && (
          <div className={styles.pager}>
            <button type="button" className={styles.pageBtn} onClick={() => setIndex(i => i - 1)} disabled={index === 0} aria-label="Biglietto precedente">‹</button>
            <span>{index + 1} / {tickets.length}</span>
            <button type="button" className={styles.pageBtn} onClick={() => setIndex(i => i + 1)} disabled={index === tickets.length - 1} aria-label="Biglietto successivo">›</button>
          </div>
        )}
      </div>
    </article>
  );
}
