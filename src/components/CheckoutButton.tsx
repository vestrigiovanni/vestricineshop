'use client';

import { useState, useEffect, useRef } from 'react';
import { Download, CheckCircle2 } from 'lucide-react';
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

  // Persistence: Restore state on mount
  useEffect(() => {
    const savedOrder = sessionStorage.getItem(`order_${subeventId}`);
    if (savedOrder) {
      try {
        const { tickets, orderCode, subeventData, isAnonymous } = JSON.parse(savedOrder);
        setTickets(tickets);
        setOrderCode(orderCode);
        setSubeventData(subeventData);
        setIsAnonymous(isAnonymous);
        setSuccess(true);
      } catch (e) {
        console.error('Failed to restore order from session', e);
      }
    }
  }, [subeventId]);



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

      if (onSuccess) {
        console.log('[CHECKOUT] Triggering refresh callback...');
        onSuccess();
      }
    } catch (err: any) {
      setError(err?.message || "Errore durante la prenotazione. Riprova.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    setLoading(true);
    try {
      const ticketIds = tickets.map(t => `full-ticket-${t.secret}`);
      await generateTicketPDF(ticketIds, `biglietti_${orderCode}`);
    } catch (err) {
      console.error('Failed to generate PDF', err);
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

        {/* Biglietto Souvenir Preview + Action Area — side by side on wide screens */}
        <div className={styles.splitLayout}>
          <div className={styles.ticketPreviewList}>
            {subeventData && tickets.map((ticket, idx) => (
              <TicketPDF 
                key={ticket.id}
                preview={true}
                compact={true}
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

          <div className={styles.actionArea}>
            <button 
              className={`btn-primary ${styles.giantDownloadBtn}`} 
              onClick={handleDownloadPDF}
              disabled={loading}
            >
              {loading ? (
                  <>Generazione PDF...</>
              ) : (
                  <>
                      <Download size={24} />
                      APRI IL TUO BIGLIETTO ORA
                  </>
              )}
            </button>
            
            {isAnonymous && (
              <div className={styles.anonymousDisclaimer}>
                <p>⚠️ <strong>Nota bene:</strong> Non riceverai una copia via email. Assicurati di scaricare o fare uno screenshot del biglietto ora.</p>
              </div>
            )}
            
            {!isAnonymous && <p className={styles.downloadHint}>Il PDF si aprirà in una nuova scheda.</p>}
          </div>
        </div> {/* end splitLayout */}
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
        Continua senza email (Apri il biglietto subito)
      </button>

      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
