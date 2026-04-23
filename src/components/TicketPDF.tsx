'use client';

import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Info } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import styles from './TicketPDF.module.css';
import { getTMDBImageUrl } from '@/services/tmdb';
import RatingBadge from './RatingBadge';

interface TicketData {
  movieTitle: string;
  posterPath: string;
  backdropPath?: string;
  logoPath?: string;
  date: string; // ISO string
  duration?: number; // minutes
  director?: string;
  cast?: string;
  roomName: string;
  seatName: string;
  orderCode: string;
  qrSecret: string;
  purchaseDate: string;
  rowLabel?: string;
  seatLabel?: string;
  tmdbId?: string;
  // Rich metadata
  genres?: string;
  year?: string;
  tagline?: string;
  rating?: string;
}

interface TicketPDFProps {
  data: TicketData;
  preview?: boolean;
  compact?: boolean;
  id?: string;
  backdropIndex?: number; // Prop to differentiate backdrops in multiple tickets
}

// Stable hash to ensure randomization is predictable for a given orderCode
function deterministicHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return h;
}

// Parse "Fila X" and "Posto Y" from a seat name string like "Fila 3, Posto 12"
function parseSeatParts(seatName: string): { row: string | null; seat: string | null } {
  const rowMatch = seatName.match(/(?:fila|row)\s*([A-Z0-9]+)/i);
  const seatMatch = seatName.match(/(?:posto|seat)\s*([A-Z0-9]+)/i);
  return {
    row: rowMatch ? rowMatch[1] : null,
    seat: seatMatch ? seatMatch[1] : null,
  };
}

const TicketPDF = React.forwardRef<HTMLDivElement, TicketPDFProps>(function TicketPDF({ data, preview = false, compact = false, id, backdropIndex = 0 }, ref) {
  const internalRef = useRef<HTMLDivElement>(null);
  const containerRef = (ref as React.RefObject<HTMLDivElement>) || internalRef;
  const [scale, setScale] = useState(1);
  const [fetchedLogo, setFetchedLogo] = useState<string | null>(null);
  const [cleanBackdrop, setCleanBackdrop] = useState<string | null>(null);

  const startDate = new Date(data.date);
  const endDate = new Date(startDate.getTime() + (data.duration || 120) * 60000);

  const formatTime = (d: Date) => d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const formatDate = (d: Date) => d.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });

  // Use explicit labels if provided; otherwise parse from seatName
  const parsed = parseSeatParts(data.seatName);
  const rowLabel = (data.rowLabel && data.rowLabel !== '-') ? data.rowLabel : parsed.row;
  const seatLabel = (data.seatLabel && data.seatLabel !== '-') ? data.seatLabel : parsed.seat;

  useEffect(() => {
    if (!data.tmdbId) return;
    fetch(`https://api.themoviedb.org/3/movie/${data.tmdbId}/images?include_image_language=null&api_key=00ea09c7fb5bf89b064f6001a2de3122`)
      .then(res => res.json())
      .then(json => {
        const backdrops = json.backdrops || [];
        if (backdrops.length > 0) {
          // SEEDED RANDOMIZATION:
          // We sort the backdrops based on a hash of (orderCode + filePath).
          // All tickets in the order share the same orderCode, so they see the SAME
          // "randomized" list, and each backdropIndex picks a DIFFERENT image.
          const shuffled = [...backdrops].sort((a, b) => {
            const hA = deterministicHash(data.orderCode + a.file_path);
            const hB = deterministicHash(data.orderCode + b.file_path);
            return hA - hB;
          });

          const selected = shuffled[backdropIndex % shuffled.length];
          setCleanBackdrop(selected.file_path);
        }
      })
      .catch(() => { });
  }, [data.tmdbId, backdropIndex, data.orderCode]);

  const [tmdbTagline, setTmdbTagline] = useState<string | null>(null);

  // Fetch logo and tagline if not provided
  useEffect(() => {
    if (!data.tmdbId) return;

    // We fetch movie details to get the original language and then handle tagline logic
    fetch(`https://api.themoviedb.org/3/movie/${data.tmdbId}?append_to_response=images&include_image_language=it,en,null&api_key=00ea09c7fb5bf89b064f6001a2de3122`)
      .then(res => res.json())
      .then(json => {
        // 1. Logo Handling
        const logos = json.images?.logos || [];
        const itLogo = logos.find((l: any) => l.iso_639_1 === 'it');
        const enLogo = logos.find((l: any) => l.iso_639_1 === 'en');
        const finalLogo = itLogo?.file_path || enLogo?.file_path || logos[0]?.file_path;
        if (finalLogo) setFetchedLogo(finalLogo);

        // 2. Tagline Logic (MANDATORY)
        // Detect original language
        const originalLang = json.original_language;

        if (originalLang === 'it') {
          // Italian movie: Strictly fetch Italian tagline
          fetch(`https://api.themoviedb.org/3/movie/${data.tmdbId}?language=it-IT&api_key=00ea09c7fb5bf89b064f6001a2de3122`)
            .then(res => res.json())
            .then(itJson => {
              if (itJson.tagline) setTmdbTagline(itJson.tagline);
            })
            .catch(() => { });
        } else {
          // International movie: Try Italian, then fallback to English (the default result usually)
          fetch(`https://api.themoviedb.org/3/movie/${data.tmdbId}?language=it-IT&api_key=00ea09c7fb5bf89b064f6001a2de3122`)
            .then(res => res.json())
            .then(itJson => {
              if (itJson.tagline) {
                setTmdbTagline(itJson.tagline);
              } else {
                // Fallback to English if Italian not available
                setTmdbTagline(json.tagline || null);
              }
            })
            .catch(() => {
              setTmdbTagline(json.tagline || null);
            });
        }
      })
      .catch(() => { });
  }, [data.tmdbId]);

  useEffect(() => {
    if (preview && containerRef?.current) {
      const parent = containerRef.current.parentElement;
      if (parent) {
        const parentWidth = parent.clientWidth || 400;
        // Scale to fit the parent container, using the full 840px ticket width as reference
        let newScale = Math.min(1, parentWidth / 840);
        if (compact) newScale = Math.min(newScale, 0.5); // Cap at 50% for miniature previews
        setScale(newScale);
      }
    }
  }, [preview, compact, containerRef]);

  const activeLogo = data.logoPath || fetchedLogo;
  const activeTagline = data.tagline || tmdbTagline;


  const backdropSrc = cleanBackdrop
    ? getTMDBImageUrl(cleanBackdrop, 'original')
    : getTMDBImageUrl(data.backdropPath || data.posterPath, 'original');

  // Cast: EXACTLY max 3 names for cleanliness - separated by middle dot (·)
  const castLine = data.cast
    ? data.cast.split(',').map(s => s.trim()).filter(Boolean).slice(0, 3).join('  ·  ').toUpperCase()
    : null;

  const ticketContent = (
    <div
      ref={containerRef}
      id={id || `ticket-${data.qrSecret}`}
      className={styles.ticketContainer}
      style={{
        transform: preview ? `scale(${scale})` : 'none',
        transformOrigin: 'top center',
      }}
    >
      {/* ── Layer 1: Backdrop Image (USING DIV BACKGROUND FOR STABLE COVER SCALING) ── */}
      <div className={styles.backdropLayer}>
        <img
          src={backdropSrc}
          alt=""
          className={styles.backdropImage}
          crossOrigin="anonymous"
        />
        <div className={styles.gradientBottom} />
        <div className={styles.gradientTop} />
      </div>

      {/* ── Layer 2: Brand Logo (Direct Child for Zero-Margin) ── */}
      <div className={styles.personalLogo}>
        <img
          src="/assets/logo_cliente.png"
          alt="VESTRICINEMA"
          className={styles.personalLogoImg}
          crossOrigin="anonymous"
        />
      </div>

      {/* ── Layer 2.5: Premium Rating Stamp (Top-Left) ── */}
      {data.rating && (
        <div className={styles.premiumRatingStamp}>
          <RatingBadge id={data.rating} size="lg" className={styles.souvenirBadge} />
        </div>
      )}

      {/* ── Layer 3: Content (Absolute Overlays with Safe Margins) ── */}
      <div className={styles.contentWrapper}>
        {/* QR (Top-Right) */}
        <div className={styles.qrBox}>
          <QRCodeSVG
            value={data.qrSecret}
            size={100}
            bgColor="#ffffff"
            fgColor="#000000"
            level="H"
            includeMargin={false}
          />
        </div>

        {/* SIDEBAR: Order Code */}
        <div className={styles.verticalSidebar}>
          {data.orderCode}
        </div>

        {/* CENTER COLUMN: Movie Info -> Seats -> Cast */}
        <div className={styles.topSection}>
          {data.director && (
            <div className={styles.directorCredit}>
              A FILM BY {data.director.toUpperCase()}
            </div>
          )}

          <div className={styles.logoContainer}>
            {activeLogo ? (
              <img
                src={getTMDBImageUrl(activeLogo, 'w500')!}
                alt={data.movieTitle}
                className={styles.movieLogo}
                crossOrigin="anonymous"
              />
            ) : (
              <h1 className={styles.fallbackTitle}>{data.movieTitle}</h1>
            )}
          </div>

          {activeTagline && (
            <div className={styles.tagline}>"{activeTagline}"</div>
          )}
        </div>

        <div className={styles.seatBlock}>
          <div className={styles.salaName}>{data.roomName.toUpperCase()}</div>

          <div className={styles.seatRow}>
            {rowLabel && (
              <div className={styles.seatItem}>
                <span className={styles.seatItemLabel}>FILA</span>
                <span className={styles.seatItemValue}>{rowLabel}</span>
              </div>
            )}
            {rowLabel && seatLabel && <div className={styles.seatDivider}>·</div>}
            {seatLabel && (
              <div className={styles.seatItem}>
                <span className={styles.seatItemLabel}>POSTO</span>
                <span className={styles.seatItemValue}>{seatLabel}</span>
              </div>
            )}
            {!rowLabel && !seatLabel && (
              <div className={styles.seatItem}>
                <span className={styles.seatItemLabel}>POSTO</span>
                <span className={styles.seatItemValue}>{data.seatName}</span>
              </div>
            )}
          </div>

          {/* Cast — Exactly below seats as requested */}
          {castLine && (
            <div className={styles.castLineCentral}>{castLine}</div>
          )}
        </div>

        {/* BOTTOM SECTION: Show Dates & Warning */}
        <div className={styles.bottomSection}>
          <div className={styles.showInfo}>
            <div className={styles.showInfoLeft}>
              <span>{formatDate(startDate)}</span>
            </div>

            <div className={styles.showInfoCenter}>
              <span className={styles.dot}>|</span>
              <span>{formatTime(startDate)}</span>
              <span className={styles.dot}>|</span>
              <span>{formatTime(endDate)}</span>
              <span className={styles.dot}>|</span>
            </div>

            <div className={styles.showInfoRight}>
              <span>{data.duration || 120} MIN</span>
            </div>
          </div>

          <div className={styles.onTimeWarning}>
            <Info size={12} />
            <span>IL FILM COMINCERÀ IN ORARIO</span>
          </div>
        </div>
      </div>

      {/* Decorative Perforations */}
      <div className={styles.perforationLeft} />
      <div className={styles.perforationRight} />
    </div>
  );

  return preview ? (
    <div
      className={styles.previewWrapper}
      style={{
        width: '100%',
        height: `${Math.round(592 * scale)}px`,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {ticketContent}
    </div>
  ) : (
    ticketContent
  );
});

export default TicketPDF;

async function waitForImages(element: HTMLElement) {
  const images = element.querySelectorAll('img');
  const imagePromises: Promise<void>[] = [];

  images.forEach(img => {
    if (!img.complete) {
      imagePromises.push(new Promise((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      }));
    }
  });

  await Promise.all(imagePromises);
  await new Promise(resolve => setTimeout(resolve, 1000));
}

export async function generateTicketPDF(elementIds: string[], fileName: string = 'Biglietti', pdfWindow?: Window | null, shouldDownload: boolean = false) {
  if (!elementIds.length) {
    if (pdfWindow) pdfWindow.close();
    return;
  }

  try {
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [210, 148], // A5 landscape
    });

    const previousScrollX = window.scrollX;
    const previousScrollY = window.scrollY;
    window.scrollTo(0, 0);

    for (let i = 0; i < elementIds.length; i++) {
      const elementId = elementIds[i];
      const element = document.getElementById(elementId);
      if (!element) continue;

      await waitForImages(element);

      const canvas = await html2canvas(element, {
        scale: 3, // High-quality render
        useCORS: true,
        backgroundColor: '#000000',
        logging: false,
        allowTaint: false,
        imageTimeout: 25000,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
        windowWidth: document.documentElement.offsetWidth,
        windowHeight: document.documentElement.offsetHeight,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.98);

      if (i > 0) {
        pdf.addPage([210, 148], 'landscape');
      }

      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 148);
    }

    window.scrollTo(previousScrollX, previousScrollY);

    // Create a blob and open it in the provided window or a new one
    const pdfBlob = pdf.output('blob');
    const url = URL.createObjectURL(pdfBlob);

    if (shouldDownload) {
      pdf.save(`${fileName}.pdf`);
    } else if (pdfWindow) {
      pdfWindow.location.href = url;
    } else {
      window.open(url, '_blank');
    }

  } catch (err) {
    console.error('Error generating PDF:', err);
    if (pdfWindow) pdfWindow.close();
  }
}

