'use client';

import React, { forwardRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import styles from './ThermalTicket.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// ThermalTicket — Layout ottimizzato per carta termica 57mm
//
// Ordine: Logo TMDB (o titolo grande) → QR Code (grande) → Info
// ─────────────────────────────────────────────────────────────────────────────

export interface ThermalTicketData {
  movieTitle: string;
  screening: string;      // etichetta display (es. "Lun 6 Apr • 21:00")
  roomName: string;
  rowLabel: string;
  seatLabel: string;
  seatName: string;
  orderCode: string;
  qrValue: string;
  price: string;
  printDate: string;
  // Campi aggiuntivi per il layout avanzato
  logoPath?: string;      // path TMDB logo (es. "/abc123.png")
  duration?: number;      // durata in minuti
  dateFrom?: string;      // ISO date string (es. "2026-04-20T18:30:00")
  rating?: string;        // classificazione (es. "14+", "18+")
}

interface ThermalTicketProps {
  data: ThermalTicketData;
  id?: string;
}

function getTmdbLogoUrl(path: string): string {
  return `https://image.tmdb.org/t/p/w500${path.startsWith('/') ? path : '/' + path}`;
}

const ThermalTicket = forwardRef<HTMLDivElement, ThermalTicketProps>(
  ({ data, id }, ref) => {

    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => {
      setMounted(true);
    }, []);

    // Calcola orario inizio e fine
    const startDate = data.dateFrom ? new Date(data.dateFrom) : null;
    const endDate =
      startDate && data.duration
        ? new Date(startDate.getTime() + data.duration * 60_000)
        : null;

    const fmtTime = (d: Date) =>
      d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const fmtDate = (d: Date) =>
      d.toLocaleDateString('it-IT', {
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
      });

    const timeLabel = startDate
      ? `${fmtTime(startDate)}${endDate ? ` → ${fmtTime(endDate)}` : ''}`
      : '';
    const dateLabel = startDate ? fmtDate(startDate) : data.screening;

    if (!mounted) {
      return (
        <div id={id} ref={ref} className={styles.thermalWrapper} style={{ visibility: 'hidden' }}>
          {/* Skeleton or empty space during hydration to avoid mismatch */}
        </div>
      );
    }

    return (
      <div id={id} ref={ref} className={styles.thermalWrapper}>

        {/* ══ 1. LOGO TMDB o TITOLO GRANDE ═══════════════════ */}
        <div className={styles.logoSection}>
          {data.logoPath ? (
            <img
              src={getTmdbLogoUrl(data.logoPath)}
              alt={data.movieTitle}
              className={styles.movieLogo}
              crossOrigin="anonymous"
            />
          ) : (
            <div className={styles.movieTitleBig}>
              {data.movieTitle.toUpperCase()}
            </div>
          )}
        </div>

        <div className={styles.hr} />

        {/* ══ 2. QR CODE (GRANDE) ════════════════════════════ */}
        <div className={styles.qrSection}>
          <QRCodeSVG
            value={data.qrValue || data.orderCode}
            size={200}
            bgColor="#ffffff"
            fgColor="#000000"
            level="H"
            includeMargin={false}
          />
          <div className={styles.orderCode}>{data.orderCode}</div>
        </div>

        <div className={styles.hr} />

        {/* ══ 3. INFO ════════════════════════════════════════ */}
        <div className={styles.infoSection}>

          {/* Titolo se il logo è mostrato sopra */}
          {data.logoPath && (
            <div className={styles.infoTitle}>
              {data.movieTitle.toUpperCase()}
            </div>
          )}

          {/* Data */}
          <div className={styles.infoDate}>{dateLabel}</div>

          {/* Orario inizio → fine */}
          {timeLabel && (
            <div className={styles.infoTime}>{timeLabel}</div>
          )}

          <div className={styles.infoHr} />

          {/* Sala */}
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>SALA</span>
            <span className={styles.infoValue}>{data.roomName.toUpperCase()}</span>
          </div>

          {/* Fila e Posto */}
          <div className={styles.infoRowDouble}>
            <div className={styles.infoCell}>
              <span className={styles.infoLabel}>FILA</span>
              <span className={styles.infoBig}>{data.rowLabel}</span>
            </div>
            <div className={styles.infoDividerV} />
            <div className={styles.infoCell}>
              <span className={styles.infoLabel}>POSTO</span>
              <span className={styles.infoBig}>{data.seatLabel}</span>
            </div>
          </div>

          <div className={styles.infoHr} />

          {/* Prezzo */}
          <div className={styles.priceRow}>
            <span className={styles.priceValue}>
              € {parseFloat(data.price || '0').toFixed(2)}
            </span>
          </div>
        </div>

        {/* ══ FOOTER ═════════════════════════════════════════ */}
        <div className={styles.footer}>
          <span>VESTRICINEMA.IT</span>
          <span className={styles.footerDate}>{data.printDate}</span>
        </div>

        {/* ══ LEGAL WARNING (IF RATED) ════════════════════════ */}
        {data.rating && (data.rating === '14+' || data.rating === '18+') && (
          <div className={styles.legalWarning}>
            ⚠️ ATTENZIONE: Ingresso vietato ai minori di {data.rating.replace('+', '')} anni
            <br />
            Ingresso previa esibizione documento d&apos;identità
          </div>
        )}

      </div>
    );
  }
);

ThermalTicket.displayName = 'ThermalTicket';
export default ThermalTicket;

// ─────────────────────────────────────────────────────────────────────────────
// Helper: estrae Fila / Posto dal nome posto Pretix
// ─────────────────────────────────────────────────────────────────────────────
export function parseSeatName(seatName: string): { row: string; seat: string } {
  const rowMatch = seatName.match(/(?:Row|Fila)\s*(\w+)/i);
  const seatMatch = seatName.match(/(?:Seat|Posto)\s*(\w+)/i);
  if (rowMatch && seatMatch) {
    return { row: rowMatch[1] || '-', seat: seatMatch[1] || seatName };
  }
  const parts = seatName.split('-');
  if (parts.length >= 3) {
    return { row: parts[parts.length - 2].trim(), seat: parts[parts.length - 1].trim() };
  }
  if (seatName.includes(',')) {
    const cp = seatName.split(',').map(s => s.trim());
    return {
      row: cp[0].replace(/[^0-9]/g, '') || cp[0],
      seat: cp[1].replace(/[^0-9]/g, '') || cp[1],
    };
  }
  return { row: '-', seat: seatName };
}
