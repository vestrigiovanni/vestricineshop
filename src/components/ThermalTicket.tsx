'use client';

import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import styles from './ThermalTicket.module.css';
import { getTMDBImageUrl } from '@/services/tmdb';

interface ThermalTicketProps {
  data: {
    movieTitle: string;
    date: string;
    roomName: string;
    seatName: string;
    orderCode: string;
    qrSecret: string;
    price?: number;
    logoPath?: string;
    duration?: number;
  };
}

const ThermalTicket: React.FC<ThermalTicketProps> = ({ data }) => {
  const startDate = new Date(data.date);
  const duration = data.duration || 120;
  const endDate = new Date(startDate.getTime() + duration * 60000);

  const timeStr = (d: Date) => d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const dateStr = startDate.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className={styles.thermalTicket}>
      {/* 1. MOVIE LOGO (TOP) */}
      {data.logoPath && (
        <div className={styles.movieLogoWrapper}>
          <img 
            src={getTMDBImageUrl(data.logoPath, 'w500')!} 
            alt={data.movieTitle} 
            className={styles.movieLogoImg}
            crossOrigin="anonymous"
          />
        </div>
      )}

      {/* 2. QR CODE (BIG) */}
      <div className={styles.qrContainerBig}>
        <QRCodeSVG
          value={data.qrSecret}
          size={200}
          bgColor="#ffffff"
          fgColor="#000000"
          level="H"
          includeMargin={false}
        />
        <div className={styles.orderIdSmall}>{data.orderCode}</div>
      </div>

      {/* 3. MOVIE INFO */}
      <div className={styles.movieInfoSection}>
        <div className={styles.movieTitle}>{data.movieTitle.toUpperCase()}</div>
        
        <div className={styles.screeningTimes}>
          {dateStr} &nbsp;|&nbsp; {timeStr(startDate)} - {timeStr(endDate)}
        </div>
      </div>

      <div className={styles.divider} />

      {/* 4. ROOM & SEAT */}
      <div className={styles.seatInfoSection}>
        <div className={styles.roomName}>{data.roomName.toUpperCase()}</div>
        <div className={styles.seatLabel}>POSTO</div>
        <div className={styles.seatValue}>{data.seatName}</div>
      </div>

      <div className={styles.brandFooter}>
        VESTRICINEMA.IT
      </div>
    </div>
  );
};

export default ThermalTicket;
