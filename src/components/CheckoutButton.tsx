'use client';

import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, CheckCircle2 } from 'lucide-react';
import { finalizeBooking, getSubEvent } from '@/services/pretix';
import { ROOM_NAMES } from '@/constants/pretix';
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
}

export default function CheckoutButton({ subeventId, selectedSeats, onSuccess }: CheckoutButtonProps) {
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

        const newSubeventData = {
          movieTitle: se.name?.it || se.name || 'Film',
          posterPath: meta.posterPath || '',
          duration: meta.runtime || 120,
          director: meta.director || '',
          cast: meta.cast || '',
          roomName: ROOM_NAMES[Number(se.seating_plan)] || se.seating_plan_name || 'Sala Cinema',
          date: se.date_from,
          backdropPath: meta.backdropPath || '',
          logoPath: meta.logoPath || '',
          tagline: meta.tagline || '',
          genres: meta.genres || '',
          year: meta.year || '',
          rating: meta.rating || '',
          tmdbId: meta.tmdbId || '',
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

  const handleDownloadPDF = async () => {
    if (!tickets.length || !subeventData) return;
    setLoading(true);
    try {
      const elementIds = tickets.map(t => `full-ticket-${t.secret}`);
      // Naming: Biglietti_[TitoloFilm]_[CodiceOrdine].pdf
      const cleanMovieTitle = subeventData.movieTitle.replace(/[^a-z0-9]/gi, '_');
      const fileName = `biglietto_vestricinema_${orderCode}`;
      await generateTicketPDF(elementIds, fileName);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
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

        <div className={styles.splitLayout}>
        {/* Visible Preview of Souvenir Tickets */}
        <div className={styles.ticketPreviewList}>
          {subeventData && tickets.map((ticket, idx) => (
            <TicketPDF 
              key={ticket.id}
              preview={true}
              compact={true}
              id={`preview-ticket-${ticket.secret}`}
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

        {/* Hidden area for PDF generation rendering (at full scale) */}
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
                    SCARICA IL TUO BIGLIETTO ORA
                </>
            )}
          </button>
          
          {isAnonymous && (
            <div className={styles.anonymousDisclaimer}>
              <p>⚠️ <strong>Nota bene:</strong> Non riceverai una copia via email. Assicurati di scaricare o fare uno screenshot del biglietto ora.</p>
            </div>
          )}
          
          {!isAnonymous && <p className={styles.downloadHint}>Il PDF verrà scaricato direttamente sul tuo dispositivo.</p>}
        </div>
      </div>
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
        Continua senza email (Scarica il biglietto subito)
      </button>

      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
