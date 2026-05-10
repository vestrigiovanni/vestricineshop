'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Printer, Download, Eye, Loader2, X, Search,
  ChevronLeft, ChevronRight, Calendar as CalendarIcon,
  Ticket, Receipt, Film, FileDown, ExternalLink,
} from 'lucide-react';
import { getTicketsByDateAction, startBatchPrintingAction } from '@/actions/ticketRecoveryActions';
import TicketPDF, { generateTicketPDF } from '@/components/TicketPDF';
import styles from './TicketRecovery.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────

type PrintMode = 'pretix' | 'souvenir' | 'cassa';

interface TicketPosition {
  id: number;
  positionid: number;
  show_time: string;
  item_name: string;
  order_code: string;
  customer_name: string;
  customer_email: string;
  seat_name: string;
  secret: string;
  subevent_name: string;
  subevent_meta: {
    tmdbId?: string;
    posterPath?: string;
    backdropPath?: string;
    logoPath?: string;
    runtime?: number;
    director?: string;
    cast?: string;
    tagline?: string;
    genres?: string;
    year?: string;
    rating?: string;
    versionLanguage?: string;
    subtitles?: string;
  };
  subevent?: {
    id: number;
    date_from?: string;
    name?: any;
    seating_plan?: number;
  };
  order?: {
    code?: string;
    email?: string;
  };
  downloads: {
    output: string;
    url: string;
  }[];
}

// ─── Helper: format date as YYYY-MM-DD in local (Rome) time ─────────────────
function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Helper: build proxy URL for Pretix PDF downloads ───────────────────────
// Direct Pretix download URLs require Authorization header and may return 409
// while rendering. Our proxy at /api/pretix-pdf handles both transparently.
function pretixPdfProxy(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;
  return `/api/pretix-pdf?url=${encodeURIComponent(rawUrl)}`;
}

// ─── Helper: print via hidden iframe ────────────────────────────────────────
function printViaIframe(url: string) {
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = url;
  document.body.appendChild(iframe);
  iframe.onload = () => {
    if (iframe.contentWindow) {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }
  };
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function TicketRecoveryButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [tickets, setTickets] = useState<TicketPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [printMode, setPrintMode] = useState<PrintMode>('pretix');

  // Default to TODAY in local time (not hardcoded!)
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });

  const [mounted, setMounted] = useState(false);

  // Souvenir/Cassa print state
  const [printingTicket, setPrintingTicket] = useState<TicketPosition | null>(null);

  // Souvenir PDF preview modal
  const [souvenirPreviewTicket, setSouvenirPreviewTicket] = useState<TicketPosition | null>(null);
  const [souvenirPdfLoading, setSouvenirPdfLoading] = useState(false);

  const SOUVENIR_PREVIEW_ID = 'souvenir-ticket-preview-render';

  useEffect(() => { setMounted(true); }, []);

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchTickets = useCallback(async (date: Date) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setTickets([]);

    try {
      const dateStr = toLocalDateStr(date);
      const data = await getTicketsByDateAction(dateStr);
      setTickets(data as TicketPosition[]);
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error('[TicketRecovery]', error);
      alert('Errore nel recupero dei biglietti. Controlla la console per i dettagli.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpen = () => setIsOpen(true);

  useEffect(() => {
    if (isOpen) fetchTickets(selectedDate);
    return () => { abortControllerRef.current?.abort(); };
  }, [selectedDate, isOpen, fetchTickets]);

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
  };

  const formatDateLabel = (date: Date) =>
    date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // ── Print handlers ────────────────────────────────────────────────────────

  const handlePrintPretix = (ticket: TicketPosition) => {
    const rawUrl = ticket.downloads?.find((d) => d.output === 'pdf')?.url;
    const pdfUrl = pretixPdfProxy(rawUrl);
    if (!pdfUrl) { alert('URL PDF non disponibile per questo biglietto.'); return; }
    printViaIframe(pdfUrl);
  };

  const handlePreviewPretix = (ticket: TicketPosition) => {
    const rawUrl = ticket.downloads?.find((d) => d.output === 'pdf')?.url;
    const pdfUrl = pretixPdfProxy(rawUrl);
    if (pdfUrl) window.open(pdfUrl, '_blank');
    else alert('URL PDF non disponibile.');
  };

  const handlePrintSouvenir = async (ticket: TicketPosition) => {
    setPrintingTicket(ticket);
    // Wait for DOM to render, then trigger print
    await new Promise((r) => setTimeout(r, 400));
    window.print();
    setPrintingTicket(null);
  };

  const handlePrintCassa = async (ticket: TicketPosition) => {
    setPrintingTicket(ticket);
    await new Promise((r) => setTimeout(r, 400));
    window.print();
    setPrintingTicket(null);
  };

  const handlePrint = (ticket: TicketPosition) => {
    if (printMode === 'pretix')  return handlePrintPretix(ticket);
    if (printMode === 'souvenir') return handlePrintSouvenir(ticket);
    if (printMode === 'cassa')    return handlePrintCassa(ticket);
  };

  const handlePreviewSouvenir = (ticket: TicketPosition) => {
    setSouvenirPreviewTicket(ticket);
  };

  const handleSouvenirPdf = async (shouldDownload: boolean) => {
    setSouvenirPdfLoading(true);
    try {
      await generateTicketPDF(
        [SOUVENIR_PREVIEW_ID],
        `Souvenir_${souvenirPreviewTicket?.order_code || 'biglietto'}`,
        null,
        shouldDownload
      );
    } catch (e) {
      console.error('[Souvenir PDF]', e);
      alert('Errore durante la generazione del PDF.');
    } finally {
      setSouvenirPdfLoading(false);
    }
  };

  const handlePreview = (ticket: TicketPosition) => {
    if (printMode === 'pretix')  return handlePreviewPretix(ticket);
    if (printMode === 'souvenir') return handlePreviewSouvenir(ticket);
    handlePrint(ticket);
  };

  // ── Batch print (Pretix PDF only) ─────────────────────────────────────────

  const handleBatchPrint = async () => {
    if (tickets.length === 0) return;
    if (printMode !== 'pretix') {
      alert('La stampa batch è disponibile solo per il biglietto Pretix PDF.\nPer Souvenir o Cassa, stampa singolarmente ogni biglietto.');
      return;
    }
    setBatchLoading(true);
    try {
      const ids = tickets.map((t) => t.id.toString());
      const downloadUrl = await startBatchPrintingAction(ids);
      if (downloadUrl) printViaIframe(downloadUrl);
    } catch (error) {
      console.error('[Batch]', error);
      alert('Errore durante la stampa batch.');
    } finally {
      setBatchLoading(false);
    }
  };

  const filteredTickets = tickets.filter((t) => {
    const q = searchTerm.toLowerCase();
    return (
      t.order_code?.toLowerCase().includes(q) ||
      t.item_name?.toLowerCase().includes(q) ||
      t.subevent_name?.toLowerCase().includes(q) ||
      t.customer_name?.toLowerCase().includes(q) ||
      t.customer_email?.toLowerCase().includes(q)
    );
  });

  // Group by show time for visual clarity
  const ticketsByTime = filteredTickets.reduce<Record<string, TicketPosition[]>>((acc, t) => {
    const key = t.show_time || '??:??';
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  const isToday = mounted
    ? toLocalDateStr(selectedDate) === toLocalDateStr(new Date())
    : false;

  return (
    <>
      <button className="pretix-button" onClick={handleOpen}>
        <CalendarIcon size={18} />
        Recupero Biglietti
      </button>

      {/* ── Hidden souvenir/cassa ticket for print ── */}
      {printingTicket && (
        <div className={styles.printOnlyWrapper} aria-hidden="true">
          <SouvenirTicketPrint ticket={printingTicket} mode={printMode} />
        </div>
      )}

      {/* ── Souvenir PDF Preview Modal ── */}
      {souvenirPreviewTicket && (() => {
        const t = souvenirPreviewTicket;
        const meta = t.subevent_meta || {};
        const showDate = t.subevent?.date_from ? new Date(t.subevent.date_from) : null;
        const ticketData = {
          movieTitle:   t.subevent_name || t.item_name,
          posterPath:   meta.posterPath  || '',
          backdropPath: meta.backdropPath,
          logoPath:     meta.logoPath,
          date:         t.subevent?.date_from || new Date().toISOString(),
          duration:     meta.runtime,
          director:     meta.director,
          cast:         meta.cast,
          roomName:     'Sala Cinema',
          seatName:     t.seat_name || '',
          orderCode:    t.order_code || '',
          qrSecret:     t.secret || t.order_code || '',
          purchaseDate: showDate?.toLocaleDateString('it-IT') || '',
          tmdbId:       meta.tmdbId,
          genres:       meta.genres,
          year:         meta.year,
          tagline:      meta.tagline,
          rating:       meta.rating,
        };
        return (
          <div className={styles.souvenirModalOverlay} onClick={(e) => e.target === e.currentTarget && setSouvenirPreviewTicket(null)}>
            <div className={styles.souvenirModalPanel}>

              {/* Header */}
              <div className={styles.souvenirModalHeader}>
                <div className={styles.souvenirModalTitle}>
                  <Film size={18} />
                  Anteprima Souvenir — <em>{t.subevent_name}</em>
                  <span className={styles.souvenirOrderBadge}>{t.order_code}</span>
                </div>
                <div className={styles.souvenirModalActions}>
                  <button
                    onClick={() => handleSouvenirPdf(false)}
                    disabled={souvenirPdfLoading}
                    className={styles.souvenirActionBtn}
                    title="Apri PDF in nuova scheda"
                  >
                    {souvenirPdfLoading ? <Loader2 size={15} className={styles.spin} /> : <ExternalLink size={15} />}
                    Apri PDF
                  </button>
                  <button
                    onClick={() => handleSouvenirPdf(true)}
                    disabled={souvenirPdfLoading}
                    className={`${styles.souvenirActionBtn} ${styles.souvenirActionBtnPrimary}`}
                    title="Scarica come PDF"
                  >
                    {souvenirPdfLoading ? <Loader2 size={15} className={styles.spin} /> : <FileDown size={15} />}
                    Scarica PDF
                  </button>
                  <button onClick={() => setSouvenirPreviewTicket(null)} className={styles.souvenirCloseBtn}>
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Ticket render — this is what gets captured by html2canvas */}
              <div className={styles.souvenirTicketContainer}>
                <TicketPDF
                  id={SOUVENIR_PREVIEW_ID}
                  data={ticketData}
                  preview={true}
                />
              </div>

              {/* Footer hint */}
              <div className={styles.souvenirModalFooter}>
                💡 Usa "Scarica PDF" per salvare il file oppure "Apri PDF" per aprirlo nel browser e stamparlo
              </div>

            </div>
          </div>
        );
      })()}

      {isOpen && (
        <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && setIsOpen(false)}>
          <div className={styles.modalContent}>

            {/* ── Header ── */}
            <div className={styles.modalHeader}>
              <div className={styles.headerLeft}>
                <h2>Recupero Biglietti</h2>
                {isToday && <span className={styles.todayBadge}>OGGI</span>}
              </div>

              <div className={styles.dateNavigation}>
                <button onClick={() => changeDate(-1)} className={styles.navBtn} disabled={loading} title="Giorno precedente">
                  <ChevronLeft size={24} />
                </button>
                <div className={styles.currentDate}>
                  <CalendarIcon size={16} />
                  <span suppressHydrationWarning>
                    {mounted ? formatDateLabel(selectedDate) : ''}
                  </span>
                </div>
                <button onClick={() => changeDate(1)} className={styles.navBtn} disabled={loading} title="Giorno successivo">
                  <ChevronRight size={24} />
                </button>
              </div>

              <button onClick={() => setIsOpen(false)} className={styles.closeBtn} title="Chiudi">
                <X size={24} />
              </button>
            </div>

            {/* ── Toolbar ── */}
            <div className={styles.modalActions}>
              <div className={styles.searchWrapper}>
                <Search size={16} className={styles.searchIcon} />
                <input
                  type="text"
                  placeholder="Cerca ordine, film, nome o email…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={styles.searchInput}
                />
              </div>

              {/* Print mode selector */}
              <div className={styles.printModeSelector}>
                <button
                  className={`${styles.modeBtn} ${printMode === 'pretix' ? styles.modeActive : ''}`}
                  onClick={() => setPrintMode('pretix')}
                  title="Biglietto Pretix (PDF ufficiale)"
                >
                  <Ticket size={15} />
                  Pretix PDF
                </button>
                <button
                  className={`${styles.modeBtn} ${printMode === 'souvenir' ? styles.modeActive : ''}`}
                  onClick={() => setPrintMode('souvenir')}
                  title="Biglietto Souvenir cinematografico"
                >
                  <Film size={15} />
                  Souvenir
                </button>
                <button
                  className={`${styles.modeBtn} ${printMode === 'cassa' ? styles.modeActive : ''}`}
                  onClick={() => setPrintMode('cassa')}
                  title="Scontrino Cassa termica 57mm"
                >
                  <Receipt size={15} />
                  Cassa
                </button>
              </div>

              <button
                onClick={handleBatchPrint}
                disabled={batchLoading || tickets.length === 0 || loading}
                className={styles.batchBtn}
                title={printMode !== 'pretix' ? 'Batch disponibile solo per Pretix PDF' : ''}
              >
                {batchLoading ? <Loader2 className={styles.spin} size={16} /> : <Printer size={16} />}
                Stampa Tutti ({tickets.length})
              </button>
            </div>

            {/* ── Pill info bar ── */}
            <div className={styles.infoBar}>
              {loading ? (
                <span className={styles.infoText}>
                  <Loader2 size={13} className={styles.spin} /> Interrogazione Pretix in corso…
                </span>
              ) : (
                <span className={styles.infoText}>
                  {filteredTickets.length} biglietti trovati
                  {searchTerm && ` per "${searchTerm}"`}
                  {' · '}Modalità: <strong>{printMode === 'pretix' ? 'Pretix PDF' : printMode === 'souvenir' ? 'Souvenir' : 'Cassa Termica'}</strong>
                </span>
              )}
            </div>

            {/* ── Table ── */}
            <div className={styles.tableWrapper}>
              {loading ? (
                <div className={styles.loaderCenter}>
                  <Loader2 className={styles.spin} size={48} />
                  <p suppressHydrationWarning>
                    Interrogazione Pretix per {mounted ? formatDateLabel(selectedDate) : ''}…
                  </p>
                  <p className={styles.loaderSub}>
                    Ricerca spettacoli e biglietti nel fuso orario Europe/Rome
                  </p>
                </div>
              ) : filteredTickets.length === 0 ? (
                <div className={styles.emptyState}>
                  <CalendarIcon size={40} opacity={0.3} />
                  <p>Nessun biglietto trovato{searchTerm ? ` per "${searchTerm}"` : ''}</p>
                  {!searchTerm && (
                    <p className={styles.emptyHint}>
                      Nessuno spettacolo con biglietti venduti il {mounted ? formatDateLabel(selectedDate) : ''}.
                      <br />Prova a navigare ad un altro giorno con le frecce.
                    </p>
                  )}
                </div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Orario</th>
                      <th>Film</th>
                      <th>Posto</th>
                      <th>Cliente</th>
                      <th>Ordine</th>
                      <th style={{ textAlign: 'right' }}>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(ticketsByTime).map(([time, group]) => (
                      <React.Fragment key={time}>
                        <tr className={styles.groupRow}>
                          <td colSpan={6}>
                            <span className={styles.groupLabel}>🎬 {time} — {group[0]?.subevent_name || group[0]?.item_name} ({group.length} biglietti)</span>
                          </td>
                        </tr>
                        {group.map((ticket) => (
                          <tr key={ticket.id} className={styles.ticketRow}>
                            <td className={styles.timeCell}>{ticket.show_time}</td>
                            <td className={styles.movieCell}>
                              <div>{ticket.subevent_name || ticket.item_name}</div>
                              {ticket.subevent_meta?.versionLanguage && (
                                <div className={styles.subLabel}>{ticket.subevent_meta.versionLanguage}</div>
                              )}
                            </td>
                            <td>
                              {ticket.seat_name
                                ? <span className={styles.seatBadge}>{ticket.seat_name}</span>
                                : <span className={styles.noSeat}>–</span>}
                            </td>
                            <td>
                              <div className={styles.customerInfo}>
                                <span className={styles.customerName}>{ticket.customer_name}</span>
                                <span className={styles.customerEmail}>{ticket.customer_email}</span>
                              </div>
                            </td>
                            <td><code className={styles.code}>{ticket.order_code}</code></td>
                            <td style={{ textAlign: 'right' }}>
                              <div className={styles.rowActions}>
                                {(printMode === 'pretix' || printMode === 'souvenir') && (
                                  <button
                                    onClick={() => handlePreview(ticket)}
                                    title={printMode === 'pretix' ? 'Anteprima PDF Pretix' : 'Anteprima Souvenir'}
                                    className={styles.actionBtn}
                                  >
                                    <Eye size={16} />
                                  </button>
                                )}
                                {printMode === 'pretix' && (
                                  <a
                                    href={pretixPdfProxy(ticket.downloads?.find((d) => d.output === 'pdf')?.url)}
                                    download="biglietto.pdf"
                                    title="Scarica PDF Pretix"
                                    className={styles.actionBtn}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <Download size={16} />
                                  </a>
                                )}
                                {printMode === 'souvenir' && (
                                  <button
                                    onClick={() => { setSouvenirPreviewTicket(ticket); setTimeout(() => handleSouvenirPdf(true), 300); }}
                                    title="Scarica PDF Souvenir direttamente"
                                    className={styles.actionBtn}
                                  >
                                    <Download size={16} />
                                  </button>
                                )}
                                <button
                                  onClick={() => handlePrint(ticket)}
                                  title={`Stampa ${printMode === 'pretix' ? 'PDF Pretix' : printMode === 'souvenir' ? 'Souvenir' : 'Cassa'}`}
                                  className={`${styles.actionBtn} ${styles.actionBtnPrint}`}
                                >
                                  <Printer size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

          </div>
        </div>
      )}
    </>
  );
}

// ─── Inline Souvenir/Cassa ticket renderer (for print) ───────────────────────

function SouvenirTicketPrint({ ticket, mode }: { ticket: TicketPosition; mode: PrintMode }) {
  const meta = ticket.subevent_meta || {};
  const orderCode = ticket.order_code || '';
  const secret = ticket.secret || orderCode;
  const seatName = ticket.seat_name || '';

  // Parse seat row/number from "Fila X, Posto Y" format
  const rowMatch = seatName.match(/(?:fila|row)\s*([A-Z0-9]+)/i);
  const seatMatch = seatName.match(/(?:posto|seat)\s*([A-Z0-9]+)/i);
  const rowLabel = rowMatch?.[1] || '';
  const seatLabel = seatMatch?.[1] || seatName;

  const showDate = ticket.subevent?.date_from ? new Date(ticket.subevent.date_from) : null;
  const formatTime = (d: Date) => d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const formatDate = (d: Date) => d.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  if (mode === 'cassa') {
    // ── Cassa Thermal Layout (57mm) ──────────────────────────────────────
    return (
      <div className={styles.thermalPrint}>
        <div className={styles.thermalHeader}>VESTRICINEMA</div>
        <div className={styles.thermalHr} />

        <div className={styles.thermalTitle}>
          {(meta.logoPath
            ? <img src={`https://image.tmdb.org/t/p/w300${meta.logoPath}`} alt={ticket.subevent_name} className={styles.thermalLogo} />
            : <span className={styles.thermalMovieName}>{ticket.subevent_name?.toUpperCase()}</span>
          )}
        </div>

        <div className={styles.thermalHr} />

        {/* QR placeholder — real QR requires qrcode.react, inject via CSS */}
        <div className={styles.thermalQrArea}>
          <div className={styles.thermalQrPlaceholder}>[QR: {secret}]</div>
          <div className={styles.thermalOrderCode}>{orderCode}</div>
        </div>

        <div className={styles.thermalHr} />

        {showDate && (
          <div className={styles.thermalRow}>
            <span className={styles.thermalLabel}>Data</span>
            <span className={styles.thermalValue}>{formatDate(showDate)}</span>
          </div>
        )}
        {showDate && (
          <div className={styles.thermalRow}>
            <span className={styles.thermalLabel}>Ora</span>
            <span className={styles.thermalValue}>{formatTime(showDate)}</span>
          </div>
        )}
        {seatName && (
          <>
            {rowLabel && (
              <div className={styles.thermalRow}>
                <span className={styles.thermalLabel}>Fila</span>
                <span className={styles.thermalValueBig}>{rowLabel}</span>
              </div>
            )}
            <div className={styles.thermalRow}>
              <span className={styles.thermalLabel}>Posto</span>
              <span className={styles.thermalValueBig}>{seatLabel}</span>
            </div>
          </>
        )}

        <div className={styles.thermalHr} />

        <div className={styles.thermalRow}>
          <span className={styles.thermalLabel}>Cliente</span>
          <span className={styles.thermalValue}>{ticket.customer_email}</span>
        </div>

        <div className={styles.thermalHr} />
        <div className={styles.thermalFooter}>
          www.vestricinema.it
          <br />
          <span className={styles.thermalFooterDate}>{new Date().toLocaleString('it-IT')}</span>
        </div>
      </div>
    );
  }

  // ── Souvenir ticket (A5 landscape) ────────────────────────────────────────
  const backdropUrl = meta.backdropPath
    ? `https://image.tmdb.org/t/p/original${meta.backdropPath}`
    : meta.posterPath
      ? `https://image.tmdb.org/t/p/original${meta.posterPath}`
      : null;

  return (
    <div className={styles.souvenirPrint}>
      {backdropUrl && (
        <div className={styles.souvenirBackdrop}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={backdropUrl} alt="" crossOrigin="anonymous" />
          <div className={styles.souvenirGradient} />
        </div>
      )}

      <div className={styles.souvenirContent}>
        <div className={styles.souvenirTop}>
          {meta.director && (
            <div className={styles.souvenirDirector}>A FILM BY {meta.director.toUpperCase()}</div>
          )}
          {meta.logoPath ? (
            <img
              src={`https://image.tmdb.org/t/p/w500${meta.logoPath}`}
              alt={ticket.subevent_name}
              className={styles.souvenirLogo}
              crossOrigin="anonymous"
            />
          ) : (
            <h1 className={styles.souvenirTitle}>{ticket.subevent_name?.toUpperCase()}</h1>
          )}
          {meta.tagline && <div className={styles.souvenirTagline}>"{meta.tagline}"</div>}
        </div>

        <div className={styles.souvenirSeats}>
          <div className={styles.souvenirRoom}>SALA PRINCIPALE</div>
          <div className={styles.souvenirSeatRow}>
            {rowLabel && (
              <div className={styles.souvenirSeatItem}>
                <span className={styles.souvenirSeatLabel}>FILA</span>
                <span className={styles.souvenirSeatValue}>{rowLabel}</span>
              </div>
            )}
            {rowLabel && seatLabel && <div className={styles.souvenirSeatDot}>·</div>}
            {seatLabel && (
              <div className={styles.souvenirSeatItem}>
                <span className={styles.souvenirSeatLabel}>POSTO</span>
                <span className={styles.souvenirSeatValue}>{seatLabel}</span>
              </div>
            )}
          </div>
        </div>

        <div className={styles.souvenirBottom}>
          {showDate && (
            <div className={styles.souvenirDateLine}>
              {formatDate(showDate)} · {formatTime(showDate)}
              {meta.runtime ? ` · ${meta.runtime} MIN` : ''}
            </div>
          )}
          <div className={styles.souvenirOrderCode}>{orderCode}</div>
          <div className={styles.souvenirBrand}>VESTRICINEMA.IT</div>
        </div>
      </div>

      <div className={styles.souvenirQr}>
        <div className={styles.souvenirQrPlaceholder}>[QR]</div>
        <div className={styles.souvenirQrCode}>{orderCode}</div>
      </div>
    </div>
  );
}
