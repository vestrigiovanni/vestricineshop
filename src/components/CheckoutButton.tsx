'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Download, CheckCircle2, Eye, X, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { finalizeBooking, getSubEvent } from '@/services/pretix';
import { isVM18 } from '@/utils/ratingUtils';
import TicketPDF, { generateTicketPDF } from './TicketPDF';
import styles from './CheckoutButton.module.css';

interface Ticket {
  id: number;
  secret: string;
  item_name?: string;
  seat_name?: string;
}

interface SubeventMetadata {
  movieTitle: string;
  posterPath: string;
  duration: number;
  director: string;
  cast: string;
  roomName: string;
  date: string;
  backdropPath?: string;
  logoPath?: string;
  tagline?: string;
  genres?: string;
  year?: string;
  rating?: string;
  tmdbId?: string;
}

interface CheckoutButtonProps {
  subeventId?: number;
  selectedSeats: string[];
  onSuccess?: () => void;
  movieRating?: string;
}

export default function CheckoutButton({ subeventId, selectedSeats, onSuccess, movieRating }: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [orderCode, setOrderCode] = useState('');
  const [subeventData, setSubeventData] = useState<SubeventMetadata | null>(null);

  // Preview Modal State
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);

  const router = useRouter();

  const handleNextPreview = () => {
    setCurrentPreviewIndex((prev) => (prev + 1) % tickets.length);
  };

  const handlePrevPreview = () => {
    setCurrentPreviewIndex((prev) => (prev - 1 + tickets.length) % tickets.length);
  };
  const handleCheckout = async (targetEmail?: string) => {
    const finalEmail = targetEmail || email;
    if (!finalEmail) {
      setError("Inserisci la tua email per ricevere il biglietto.");
      return;
    }

    // Age verification is now handled by BookingFlow.tsx before seat selection.

    // 0. Reset state & Clear session to prevent stale data restoration
    if (subeventId) sessionStorage.removeItem(`order_${subeventId}`);
    setSuccess(false);
    setTickets([]);
    setOrderCode('');
    setError(null);
    setLoading(true);
    try {
      // 1. Finalize the booking
      const order = await finalizeBooking(finalEmail, selectedSeats, subeventId);
      console.log('Order created successfully:', order);
      const newOrderCode = order.code;
      setOrderCode(newOrderCode);
      
      // 2. Fetch subevent details for metadata
      if (subeventId) {
        const se = await getSubEvent(subeventId);
        let meta: Record<string, any> = {};
        try {
          if (se.comment) meta = JSON.parse(se.comment);
        } catch (e) {
          console.error('Failed to parse metadata', e);
        }

        // Lookup del nome sala reale dal seating plan ID
        // Usiamo la API route /api/seating-plans per NON esporre il token Pretix lato client
        let roomName = 'SALA';
        if (se.seating_plan) {
          try {
            const plansRes = await fetch('/api/seating-plans');
            if (plansRes.ok) {
              const plansMap = await plansRes.json();
              const planName = plansMap[se.seating_plan];
              if (planName) roomName = `SALA ${planName}`;
            }
          } catch (e) {
            console.warn('Could not resolve seating plan name', e);
          }
        }

        // --- TMDB Fallback for legacy subevents without metadata in comment ---
        // If tmdbId is missing from the comment, resolve it from TMDB by title.
        // Then fetch full details to enrich backdropPath and logoPath if not set.
        let resolvedTmdbId = meta.tmdbId || '';
        let resolvedBackdropPath = meta.backdropPath || '';
        let resolvedLogoPath = meta.logoPath || '';

        const movieTitleForSearch = se.name?.it || se.name || '';
        if (!resolvedTmdbId && movieTitleForSearch) {
          try {
            const cleanTitle = movieTitleForSearch
              .replace(/\(.*?\)/g, '')
              .replace(/\[.*?\]/g, '')
              .replace(/Proiezione\s+\d+/gi, '')
              .replace(/ - /g, ' ')
              .trim();
            const searchRes = await fetch(
              `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(cleanTitle)}&language=it-IT&page=1&api_key=00ea09c7fb5bf89b064f6001a2de3122`
            );
            if (searchRes.ok) {
              const searchData = await searchRes.json();
              const firstResult = searchData.results?.[0];
              if (firstResult) {
                resolvedTmdbId = String(firstResult.id);
                console.log(`[CheckoutButton] TMDB fallback: resolved "${cleanTitle}" → ID ${resolvedTmdbId}`);
              }
            }
          } catch (e) {
            console.warn('[CheckoutButton] TMDB title search failed', e);
          }
        }

        // If we have a tmdbId but are missing backdrop or logo, fetch them from TMDB
        if (resolvedTmdbId && (!resolvedBackdropPath || !resolvedLogoPath)) {
          try {
            const detailsRes = await fetch(
              `https://api.themoviedb.org/3/movie/${resolvedTmdbId}?append_to_response=images&include_image_language=it,en,null&api_key=00ea09c7fb5bf89b064f6001a2de3122`
            );
            if (detailsRes.ok) {
              const details = await detailsRes.json();
              if (!resolvedBackdropPath && details.backdrop_path) {
                resolvedBackdropPath = details.backdrop_path;
              }
              if (!resolvedLogoPath) {
                const logos = details.images?.logos || [];
                const itLogo = logos.find((l: any) => l.iso_639_1 === 'it');
                const enLogo = logos.find((l: any) => l.iso_639_1 === 'en');
                const bestLogo = itLogo?.file_path || enLogo?.file_path || logos[0]?.file_path;
                if (bestLogo) resolvedLogoPath = bestLogo;
              }
            }
          } catch (e) {
            console.warn('[CheckoutButton] TMDB details fetch failed', e);
          }
        }

        const newSubeventData = {
          movieTitle: se.name?.it || se.name || 'Film',
          posterPath: meta.posterPath || '',
          duration: meta.runtime || 120,
          director: meta.director || '',
          cast: Array.isArray(meta.cast) ? meta.cast.join(', ') : (meta.cast || ''),
          roomName,
          date: se.date_from,
          backdropPath: resolvedBackdropPath,
          logoPath: resolvedLogoPath,
          tagline: meta.tagline || '',
          genres: meta.genres || '',
          year: meta.year || '',
          rating: meta.rating || '',
          tmdbId: resolvedTmdbId,
        };
        setSubeventData(newSubeventData);
        
        // Save to session for persistence (partial save here, will finalize below)
        const ticketsToSave = (order && order.positions) ? order.positions.map((p: any) => ({
          id: p.id,
          secret: p.secret,
          item_name: p.item_name || 'Biglietto',
          seat_name: p.seat?.name || p.seat?.id || ''
        })) : [];

        sessionStorage.setItem(`order_${subeventId}`, JSON.stringify({
          tickets: ticketsToSave,
          orderCode: newOrderCode,
          subeventData: newSubeventData,
          isAnonymous: targetEmail === 'guest_ANONIMO@vestricinema.it'
        }));
      }

      // 3. Extract ticket secrets
      if (order && order.positions) {
        const extractedTickets = order.positions.map((p: any) => ({
          id: p.id,
          secret: p.secret,
          item_name: p.item_name || 'Biglietto',
          seat_name: p.seat?.name || p.seat?.id || ''
        }));
        setTickets(extractedTickets);
      }
      
      setSuccess(true);
      // Removed router.refresh() to prevent unwanted full page reloads that close the modal
      
      if (onSuccess) {
        console.log('[CHECKOUT] Triggering success callback...');
        onSuccess();
      }
    } catch (err: any) {
      setError(err?.message || "Errore durante la prenotazione. Riprova.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async (shouldDownload: boolean = false) => {
    let pdfWindow: Window | null = null;
    
    if (!shouldDownload) {
      // Open a blank tab IMMEDIATELY to bypass popup blockers
      pdfWindow = window.open('', '_blank');
      if (pdfWindow) {
        pdfWindow.document.write(`
          <html>
            <head>
              <title>Generazione Biglietto...</title>
              <style>
                body { 
                  display: flex; 
                  flex-direction: column;
                  align-items: center; 
                  justify-content: center; 
                  height: 100vh; 
                  margin: 0; 
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                  background-color: #1a1a1a;
                  color: #ffffff;
                }
                .spinner {
                  border: 4px solid rgba(255, 255, 255, 0.1);
                  border-left-color: #ffffff;
                  border-radius: 50%;
                  width: 40px;
                  height: 40px;
                  animation: spin 1s linear infinite;
                  margin-bottom: 20px;
                }
                @keyframes spin {
                  to { transform: rotate(360deg); }
                }
              </style>
            </head>
            <body>
              <div class="spinner"></div>
              <p>Generazione del tuo biglietto in corso...</p>
              <p style="font-size: 0.8em; opacity: 0.7;">Attendere prego, verrai reindirizzato tra pochi istanti.</p>
            </body>
          </html>
        `);
      }
    }

    setLoading(true);
    try {
      const ticketIds = tickets.map(t => `full-ticket-${t.secret}`);
      await generateTicketPDF(ticketIds, `biglietti_${orderCode}`, pdfWindow, shouldDownload);
    } catch (err) {
      console.error('Failed to generate PDF', err);
      if (pdfWindow) pdfWindow.close();
      setError("Errore durante la generazione del PDF.");
    } finally {
      setLoading(false);
    }
  };

  const handleAnonymousCheckout = () => {
    // 0. Reset state & Clear session to prevent stale data restoration
    if (subeventId) sessionStorage.removeItem(`order_${subeventId}`);
    setSuccess(false);
    setTickets([]);
    setOrderCode('');
    setError(null);
    
    setIsAnonymous(true);
    handleCheckout('guest_ANONIMO@vestricinema.it');
  };

  if (success) {
    return (
      <div className={styles.successContainer}>
        <div className={styles.successBox}>
          <div className={styles.iconWrapper}>
            <CheckCircle2 size={28} />
          </div>
          <div>
            <h3 className={styles.successTitle}>Biglietto Prenotato!</h3>
            <p className={styles.successMessage}>La tua prenotazione è confermata. Ecco il tuo biglietto ufficiale:</p>
          </div>
        </div>

        {/* Hidden area for PDF generation rendering (at full scale) — outside visible layout */}
        <div style={{ position: 'fixed', top: 0, left: '-9999px', display: 'block', pointerEvents: 'none', zIndex: -999 }}>
          {subeventData && tickets.map((ticket, idx) => (
            <TicketPDF 
              key={`full-${ticket.id}`}
              preview={false}
              id={`full-ticket-${ticket.secret}`}
              backdropIndex={idx}
              data={{
                movieTitle: subeventData.movieTitle,
                posterPath: subeventData.posterPath,
                date: subeventData.date,
                duration: subeventData.duration,
                director: subeventData.director,
                cast: subeventData.cast,
                roomName: subeventData.roomName,
                seatName: ticket.seat_name || 'Posto Unico',
                orderCode: orderCode,
                qrSecret: ticket.secret,
                purchaseDate: new Date().toLocaleDateString('it-IT'),
                backdropPath: subeventData.backdropPath,
                logoPath: subeventData.logoPath,
                tagline: subeventData.tagline,
                genres: subeventData.genres,
                year: subeventData.year,
                rating: subeventData.rating,
                tmdbId: subeventData.tmdbId,
              }}
            />
          ))}
        </div>

        <div className={styles.actionAreaCenter}>
          <div className={styles.actionArea}>
            <button 
              className={`btn-primary ${styles.giantDownloadBtn}`} 
              onClick={() => handleDownloadPDF(true)}
              disabled={loading}
            >
              {loading ? (
                  <>Generazione PDF...</>
              ) : (
                  <>
                      <Download size={24} />
                      SCARICA IL TUO BIGLIETTO (PDF)
                  </>
              )}
            </button>
            
            {tickets.length > 0 && subeventData && (
              <button 
                className={styles.previewBtn}
                onClick={() => {
                  setCurrentPreviewIndex(0);
                  setIsPreviewOpen(true);
                }}
              >
                <Eye size={20} />
                Visualizza anteprima biglietto
              </button>
            )}
            
            <div className={styles.successActions}>
              <Link 
                href={`/success?subeventId=${subeventId}`}
                className={styles.secondaryActionBtn}
              >
                Vedi riepilogo dettagliato
              </Link>
            </div>

            {isAnonymous && (
              <div className={styles.anonymousDisclaimer}>
                <p>⚠️ <strong>Nota bene:</strong> Non riceverai una copia via email. Assicurati di scaricare o fare uno screenshot del biglietto ora.</p>
              </div>
            )}
          </div>
        </div>

        {isPreviewOpen && tickets.length > 0 && subeventData && (
          <div className={styles.modalOverlay} onClick={() => setIsPreviewOpen(false)}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
              <button className={styles.closeModalBtn} onClick={() => setIsPreviewOpen(false)}>
                <X size={20} />
              </button>
              
              <div className={styles.ticketCarousel}>
                {tickets.length > 1 && (
                  <button 
                    className={styles.carouselBtn} 
                    onClick={handlePrevPreview}
                  >
                    <ChevronLeft size={24} />
                  </button>
                )}
                
                <div className={styles.ticketContainerWrapper}>
                  <TicketPDF 
                    preview={true}
                    id={`preview-ticket-${tickets[currentPreviewIndex].secret}`}
                    backdropIndex={currentPreviewIndex}
                    data={{
                      movieTitle: subeventData.movieTitle,
                      posterPath: subeventData.posterPath,
                      date: subeventData.date,
                      duration: subeventData.duration,
                      director: subeventData.director,
                      cast: subeventData.cast,
                      roomName: subeventData.roomName,
                      seatName: tickets[currentPreviewIndex].seat_name || 'Posto Unico',
                      orderCode: orderCode,
                      qrSecret: tickets[currentPreviewIndex].secret,
                      purchaseDate: new Date().toLocaleDateString('it-IT'),
                      backdropPath: subeventData.backdropPath,
                      logoPath: subeventData.logoPath,
                      tagline: subeventData.tagline,
                      genres: subeventData.genres,
                      year: subeventData.year,
                      rating: subeventData.rating,
                      tmdbId: subeventData.tmdbId,
                    }}
                  />
                </div>
                
                {tickets.length > 1 && (
                  <button 
                    className={styles.carouselBtn} 
                    onClick={handleNextPreview}
                  >
                    <ChevronRight size={24} />
                  </button>
                )}
              </div>
              
              {tickets.length > 1 && (
                <div className={styles.carouselIndicators}>
                  {tickets.map((_, idx) => (
                    <div 
                      key={idx} 
                      className={`${styles.indicator} ${idx === currentPreviewIndex ? styles.indicatorActive : ''}`} 
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.inputWrapper}>
        <input 
          type="email" 
          placeholder="La tua email (opzionale se rapido)" 
          className={styles.emailInput}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button 
          className={`btn-primary ${styles.button}`} 
          onClick={() => handleCheckout()} 
          disabled={loading || !email}
        >
          {loading ? 'Prenotazione in corso...' : 'Conferma con Email'}
        </button>
      </div>

      <div className={styles.divider}>
        <span>oppure</span>
      </div>

      <button 
        className={styles.anonymousBtn}
        onClick={handleAnonymousCheckout}
        disabled={loading}
      >
        Continua senza email
      </button>

      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
