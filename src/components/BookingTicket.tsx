'use client';

import { useState, type ReactNode } from 'react';
import Image from 'next/image';
import { ChevronLeft, X } from 'lucide-react';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import type { ShowChoice } from './BookingDrawer/showChoices';
import { shortSeat } from './bookingText';
import styles from './BookingFlow.module.css';

interface TicketHeadProps {
  title: string;
  logoPath?: string;
  /** "Sala 1 · V.O. · SOTT. ITA" */
  facts: string;
  /** "14+", "18+"; niente se è per tutti. */
  rating: string | null;
  day: string | null;
  time: string | null;
  choices?: ShowChoice[];
  currentId: number | null;
  onChangeShow?: (id: number) => void;
  onBack?: () => void;
  onClose?: () => void;
}

/** In cima alla colonna: il film, quando, e il modo di cambiare orario. */
export function TicketHead({
  title, logoPath, facts, rating, day, time, choices, currentId, onChangeShow, onBack, onClose,
}: TicketHeadProps) {
  const [picking, setPicking] = useState(false);
  const canChange = !!onChangeShow && !!choices && choices.length > 1;

  return (
    <header className={styles.head}>
      <div className={styles.headBar}>
        {onBack ? (
          <button type="button" className={styles.barBtn} onClick={onBack}>
            <ChevronLeft size={14} aria-hidden="true" /> Cambia posti
          </button>
        ) : <span />}
        {onClose && (
          <button type="button" className={styles.barBtn} onClick={onClose} aria-label="Chiudi">
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className={styles.film}>
        {logoPath ? (
          <Image
            src={getTMDBImageUrl(logoPath, 'w500')!}
            alt={title}
            width={320}
            height={120}
            className={styles.logo}
          />
        ) : (
          <h2 className={styles.title}>{title}</h2>
        )}
        {(facts || rating) && (
          <p className={styles.facts}>
            {facts}
            {rating && <span className={rating === '18+' ? styles.alarm : undefined}>{facts ? ' · ' : ''}{rating}</span>}
          </p>
        )}
      </div>

      {time && (
        <div className={styles.when}>
          <span className={styles.label}>Quando</span>
          <span className={styles.whenDay}>{day}</span>
          <span className={styles.whenTime}>{time}</span>
          {canChange && (
            <button type="button" className={styles.change} onClick={() => setPicking(p => !p)} aria-expanded={picking}>
              {picking ? 'Chiudi' : 'Cambia orario'}
            </button>
          )}
        </div>
      )}

      {picking && canChange && (
        <ul className={styles.choices}>
          {choices!.map(c => (
            <li key={c.id}>
              <button
                type="button"
                className={[
                  styles.choice,
                  c.id === currentId ? styles.choiceOn : '',
                  c.isSoldOut ? styles.choiceOff : '',
                ].filter(Boolean).join(' ')}
                disabled={c.isSoldOut || c.id === currentId}
                onClick={() => onChangeShow!(c.id)}
              >
                <span>{c.day}</span>
                <span className={styles.choiceTime}>{c.isSoldOut ? 'esaurito' : c.time}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}

interface TicketFootProps {
  seatLabels: string[];
  legal: { alarm: boolean; text: string } | null;
  onProceed: () => void;
  /** Il modulo della conferma (CheckoutButton), quando è partita. */
  checkout?: ReactNode;
}

/** In fondo alla colonna: posti, costo e bottone, oppure la conferma. */
export function TicketFoot({ seatLabels, legal, onProceed, checkout }: TicketFootProps) {
  const count = seatLabels.length;

  return (
    <footer className={styles.foot}>
      {legal && (
        <p className={legal.alarm ? `${styles.legal} ${styles.legalAlarm}` : styles.legal}>{legal.text}</p>
      )}

      {checkout ? (
        <div className={styles.checkoutBox}>
          <span className={styles.label}>Quasi fatto</span>
          <p className={styles.seatsBig}>{seatLabels.map(shortSeat).join(' · ')}</p>
          {checkout}
        </div>
      ) : (
        <>
          <dl className={styles.summary}>
            <div>
              <dt className={styles.label}>Posti</dt>
              <dd className={count > 0 ? styles.seatsValue : undefined}>
                {count > 0 ? seatLabels.map(shortSeat).join(' · ') : '—'}
              </dd>
            </div>
            <div>
              {/* I biglietti sono gratuiti: parlare di "totale" in euro
                  faceva aspettare all'utente una richiesta di pagamento. */}
              <dt className={styles.label}>Costo</dt>
              <dd>Gratuito</dd>
            </div>
          </dl>
          <button type="button" className={styles.proceed} disabled={count === 0} onClick={onProceed}>
            {count === 0 ? 'Scegli i posti' : `Prenota ${count} ${count === 1 ? 'posto' : 'posti'} →`}
          </button>
          {count === 0 && <p className={styles.hint}>Seleziona almeno un posto per continuare</p>}
          <p className={styles.cutoff}>La vendita chiude 2 minuti prima dell&apos;inizio.</p>
        </>
      )}
    </footer>
  );
}
