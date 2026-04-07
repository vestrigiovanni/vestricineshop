'use client';

import React, { forwardRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import styles from './ThermalTicket.module.css';

export interface ThermalTicketData {
  movieTitle: string;
  screening: string;      // e.g. "Lun 6 Apr 2026 • 21:00"
  roomName: string;
  rowLabel: string;       // e.g. "1"
  seatLabel: string;      // e.g. "5"
  seatName: string;       // full name e.g. "Row 1, Seat 5"
  orderCode: string;
  qrValue: string;        // URL or code for QR
  price: string;          // display price (operatore può modificarla)
  printDate: string;      // e.g. "06/04/2026 21:14"
}

interface ThermalTicketProps {
  data: ThermalTicketData;
  id?: string;
}

/**
 * ThermalTicket — 80mm thermal receipt layout.
 * Uses forwardRef so the parent can grab the DOM node for html2canvas capture.
 */
const ThermalTicket = forwardRef<HTMLDivElement, ThermalTicketProps>(
  ({ data, id }, ref) => {
    return (
      <div
        id={id}
        ref={ref}
        className={styles.thermalWrapper}
      >
        {/* HEADER */}
        <div className={styles.logoAndTitle}>
          <div className={styles.logo}>VESTRI CINEMA</div>
          <div className={styles.movieTitle}>{data.movieTitle.toUpperCase()}</div>
        </div>

        <hr className={styles.doubleDivider} />

        {/* DETTAGLI PROIEZIONE */}
        <div className={styles.detailsBox}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>DATA E ORA</span>
            <span className={styles.detailValue}>{data.screening}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>SALA</span>
            <span className={styles.detailValue}>{data.roomName.toUpperCase()}</span>
          </div>
        </div>

        <hr className={styles.divider} />

        {/* FILA E POSTO — EXTRA LARGE (40pt equiv in CSS) */}
        <div className={styles.seatSectionHuge}>
          <div className={styles.seatRowLabel}>FILA</div>
          <div className={styles.seatRowValue}>{data.rowLabel}</div>
          <div className={styles.seatPostoLabel}>POSTO</div>
          <div className={styles.seatPostoValue}>{data.seatLabel}</div>
        </div>

        <hr className={styles.divider} />

        {/* QR CODE - HIGH CONTRAST */}
        <div className={styles.qrSection}>
          <div className={styles.qrContainer}>
            <QRCodeSVG
              value={data.qrValue}
              size={120}
              bgColor="#ffffff"
              fgColor="#000000"
              level="H"
              includeMargin={false}
            />
          </div>
          <div className={styles.orderCode}>{data.orderCode}</div>
        </div>

        <hr className={styles.divider} />

        {/* FOOTER - PREZZO E LEGAL */}
        <div className={styles.footerSection}>
          <div className={styles.priceRow}>
            <span>PREZZO €</span>
            <span className={styles.priceValue}>{parseFloat(data.price || '0').toFixed(2)}</span>
          </div>
          
          <div className={styles.courtesyText}>
            SCONTRINO DI CORTESIA<br />
            TITOLO DI ACCESSO VALIDO
          </div>

          <div className={styles.legalInfo}>
            VESTRICINEMASHOP • cassa@vestricinema.it<br />
            {data.printDate}
          </div>
        </div>

        {/* Bottom padding for tear-off is handled in CSS */}
      </div>
    );
  }
);

ThermalTicket.displayName = 'ThermalTicket';

export default ThermalTicket;

// ─────────────────────────────────────────────────────────────────
// Helper: extract Row / Seat from Pretix seat name
// ─────────────────────────────────────────────────────────────────
export function parseSeatName(seatName: string): { row: string; seat: string } {
  // 1. Try classic "Fila 1, Posto 5"
  const rowMatch = seatName.match(/(?:Row|Fila)\s*(\w+)/i);
  const seatMatch = seatName.match(/(?:Seat|Posto)\s*(\w+)/i);
  
  if (rowMatch && seatMatch) {
    return {
      row: rowMatch?.[1] || '-',
      seat: seatMatch?.[1] || seatName,
    };
  }

  // 2. Try hyphenated format "Section-Row-Seat" (e.g. "Zona Parterre-1-4")
  // We assume the last part is Seat and the second to last is Row
  const parts = seatName.split('-');
  if (parts.length >= 3) {
    return {
      row: parts[parts.length - 2].trim(),
      seat: parts[parts.length - 1].trim(),
    };
  }

  // 3. Simple comma split "Row 1, Seat 5"
  if (seatName.includes(',')) {
    const commaParts = seatName.split(',').map(s => s.trim());
    const r = commaParts[0].replace(/[^0-9]/g, '') || commaParts[0];
    const s = commaParts[1].replace(/[^0-9]/g, '') || commaParts[1];
    return { row: r, seat: s };
  }

  // Fallback: entire string as seat
  return {
    row: '-',
    seat: seatName,
  };
}
