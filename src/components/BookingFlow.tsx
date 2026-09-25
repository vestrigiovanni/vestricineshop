'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import CheckoutButton from './CheckoutButton';
import AgeVerificationModal from './AgeVerificationModal';
import BookingRoom from './BookingRoom';
import { TicketFoot, TicketHead } from './BookingTicket';
import { ageNotice, seatsTakenNotice } from './bookingText';
import { languageLabel } from './MovieShowcase/heroData';
import type { ShowChoice } from './BookingDrawer/showChoices';

import { getTrustedSubeventMetadata, reportSoldOut, verifyQuotaAvailability } from '@/actions/bookingActions';

import { isVM18, normalizeRating } from '@/utils/ratingUtils';
import { listSubEvents, getSubEvent, listQuotas, getSubEventSeats } from '@/services/pretix';
import { ITEM_INTERO_ID, ITEM_VIP_ID } from '@/constants/pretix';
import { formatShowDayLong, formatShowTime } from '@/utils/cinemaDate';
import { Loader2, AlertTriangle, RefreshCw, X } from 'lucide-react';

import styles from './BookingFlow.module.css';

interface BookingFlowProps {
  subeventId?: number;
  onClose?: () => void;
  /** Gli spettacoli dello stesso film, per "cambia orario". */
  choices?: ShowChoice[];
  onChangeShow?: (id: number) => void;
}

/** I metadati scritti da Pretix nel commento dello spettacolo, se ci sono. */
function parseComment(comment?: string | null): any {
  if (!comment) return null;
  try { return JSON.parse(comment); } catch { return null; }
}

/** Caricamento, errore, esaurito: una schermata sola, al centro. */
function Notice({ icon, title, text, action, onClose }: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className={styles.notice}>
      {onClose && (
        <button type="button" className={`${styles.barBtn} ${styles.noticeClose}`} onClick={onClose} aria-label="Chiudi">
          <X size={18} aria-hidden="true" />
        </button>
      )}
      <span className={styles.noticeIcon}>{icon}</span>
      <h2 className={styles.noticeTitle}>{title}</h2>
      {text && <p className={styles.noticeText}>{text}</p>}
      {action}
    </div>
  );
}


export default function BookingFlow({ subeventId, onClose, choices, onChangeShow }: BookingFlowProps) {
  const [selectedSeats, setSelectedSeats] = useState<Map<string, string>>(new Map());
  const [checkoutStarted, setCheckoutStarted] = useState(false);
  const [subevents, setSubevents] = useState<any[]>([]);
  const [selectedSubeventId, setSelectedSubeventId] = useState<number | null>(subeventId || null);
  const [selectedSubEvent, setSelectedSubEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSoldOut, setIsSoldOut] = useState(false);
  const [showAgeVerification, setShowAgeVerification] = useState(false);
  const [isAgeVerified, setIsAgeVerified] = useState(false);
  const [trustedMetadata, setTrustedMetadata] = useState<any>(null);

  const [refreshCounter, setRefreshCounter] = useState(0);
  // Il caricamento è fallito: diverso da "non ci sono proiezioni".
  const [loadError, setLoadError] = useState(false);
  // Avviso quando un posto già scelto viene preso da qualcun altro.
  const [seatNotice, setSeatNotice] = useState<string | null>(null);
  // La prenotazione è fatta: resta la colonna, con il biglietto.
  const [booked, setBooked] = useState(false);

  useEffect(() => {
    sessionStorage.removeItem('age-verified');
    // Reset state whenever the component mounts (Modal opens)
    setCheckoutStarted(false);
    setSelectedSeats(new Map());
    setRefreshCounter(prev => prev + 1);
  }, []);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [data, allQuotas] = await Promise.all([
        listSubEvents(true),
        listQuotas()
      ]);

      if (subeventId) {
        const [se, seQuotas, seSeats] = await Promise.all([
          data.find((s: any) => s.id === subeventId) || await getSubEvent(subeventId),
          listQuotas(subeventId),
          getSubEventSeats(subeventId)
        ]);

        // Resilient Sold Out Logic
        // 1. Quotas (PRIMARY)
        const relevantQuotas = seQuotas.filter((q: any) => 
          Array.isArray(q.items) && (q.items.includes(ITEM_INTERO_ID) || q.items.includes(ITEM_VIP_ID))
        );

        let quotaSoldOut = false;
        if (relevantQuotas.length > 0) {
          const totalQuotaAvailable = relevantQuotas.reduce((sum: number, q: any) => {
            return sum + (q.available_number !== null ? Math.max(0, q.available_number) : 0);
          }, 0);
          const allQuotasUnavailable = relevantQuotas.every((q: any) => q.available === false);
          if (allQuotasUnavailable || totalQuotaAvailable <= 0) {
            quotaSoldOut = true;
          }
        }

        // 2. Seats (SECONDARY / FALLBACK)
        let seatsSoldOut = false;
        if (Array.isArray(seSeats) && seSeats.length > 0) {
          const availableSeatsCount = seSeats.filter((s: any) => 
            s.available !== false && !s.blocked && s.orderposition === null && s.cartposition === null
          ).length;
          if (availableSeatsCount <= 0) {
            seatsSoldOut = true;
          }
        }

        // 3. Overall State
        const pretixStateSoldOut = se.best_availability_state === 'sold_out' || (se.active && se.presale_is_running === false);

        setIsSoldOut(pretixStateSoldOut || quotaSoldOut || seatsSoldOut);
        setSelectedSubEvent(se);
        setLoading(false);
        return;
      }

      const now = new Date();
      const CUTOFF_MINUTES = 2;
      
      const filtered = data.filter((se: any) => {
        if (!se.active) return false;
        const startTime = new Date(se.date_from);
        return (startTime.getTime() - now.getTime() >= CUTOFF_MINUTES * 60 * 1000);
      });

      const subeventsWithStatus = filtered.map((se: any) => {
        const interoQuota = allQuotas.find((q: any) => 
          q.subevent === se.id && 
          q.items.includes(ITEM_INTERO_ID)
        );

        return {
          ...se,
          isSoldOut: 
            (interoQuota && interoQuota.available_number !== null && interoQuota.available_number <= 0) ||
            se.best_availability_state === 'sold_out' ||
            (se.active && se.presale_is_running === false)
        };
      });

      setSubevents(subeventsWithStatus);
    } catch (err) {
      // Senza questo flag un guasto di Pretix veniva presentato all'utente
      // come "nessuna proiezione disponibile".
      console.error('Failed to load subevents', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [subeventId]);

  // ────────────────────────────────────────────────────────────
  // NEW: AUTOMATIC SOLD OUT REPORTING (Fail-Fast Sync)
  // ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isSoldOut && selectedSubeventId) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[BookingFlow] Detecting Sold Out for ${selectedSubeventId}, reporting to backend...`);
      }
      reportSoldOut(selectedSubeventId).catch(err => {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[SYNC] Failed to report sold out:', err);
        }
      });
    }
  }, [isSoldOut, selectedSubeventId]);

  // ────────────────────────────────────────────────────────────
  // NEW: TRUSTED METADATA FETCHING (Source of Truth: Neon DB)
  // ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchTrustedData() {
      if (selectedSubeventId) {
        const metadata = await getTrustedSubeventMetadata(selectedSubeventId);
        if (metadata) {
          setTrustedMetadata(metadata);
          
          // Apply immediate age verification logic based on DB source
          const needsVerification = isVM18(metadata.rating);
          if (needsVerification && !isAgeVerified) {
            setShowAgeVerification(true);
          } else if (!needsVerification) {
            setIsAgeVerified(true);
            setShowAgeVerification(false);
          }
        }
      }
    }
    fetchTrustedData();
  }, [selectedSubeventId, isAgeVerified]);

  // Handle prop-based subeventId age verification (Legacy/Fallback)
  useEffect(() => {
    if (subeventId && selectedSubEvent && !isAgeVerified && !trustedMetadata) {
      try {
        if (selectedSubEvent.comment) {
          const meta = JSON.parse(selectedSubEvent.comment);
          const needsVerification = isVM18(meta.rating);
          if (needsVerification) {
            setIsAgeVerified(false); 
            setShowAgeVerification(true);
          } else {
            setIsAgeVerified(true);
          }
        }
      } catch (e) {}
    }
  }, [subeventId, selectedSubEvent, isAgeVerified, trustedMetadata]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  useEffect(() => {
    if (selectedSubeventId && subevents.length > 0) {
      const se = subevents.find(s => s.id === selectedSubeventId);
      if (se) setSelectedSubEvent(se);
    }
  }, [selectedSubeventId, subevents]);

  const handleSeatToggle = (seatId: string, label: string) => {
    const next = new Map(selectedSeats);
    if (next.has(seatId)) next.delete(seatId);
    else next.set(seatId, label);
    setSelectedSeats(next);
    setSeatNotice(null);
  };

  // La mappa si riaggiorna da sola: se un posto scelto è stato preso nel
  // frattempo lo togliamo dalla selezione e lo diciamo, invece di far
  // fallire la conferma alla fine.
  const handleSeatsTaken = useCallback((taken: { id: string; label: string }[]) => {
    setSelectedSeats(prev => {
      if (!taken.some(t => prev.has(t.id))) return prev;
      const next = new Map(prev);
      taken.forEach(t => next.delete(t.id));
      return next;
    });
    setSeatNotice(seatsTakenNotice(taken.map(t => t.label)));
  }, []);

  const handleBookingSuccess = () => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[BookingFlow] Booking successful, cleaning up technical session data...');
    }
    
    setBooked(true);

    // We no longer redirect automatically to /success. 
    // This allows the CheckoutButton to show its own success UI with download buttons.
    // The user can manually close the drawer when they are done.
    
    sessionStorage.removeItem('age-verified');
    localStorage.removeItem('pretix_cart_id');
    localStorage.removeItem('pretix_session_id');
    
    // We don't call setSelectedSubeventId(null) or setCheckoutStarted(false) here
    // because that would unmount the CheckoutButton and its success UI.
  };

  const handleAgeVerified = () => {
    setShowAgeVerification(false);
    setIsAgeVerified(true);
  };

  const startCheckout = async () => {
    if (selectedSeats.size === 0) return;
    
    setLoading(true);
    try {
      // Real-time verification before opening checkout
      const availability = await verifyQuotaAvailability(selectedSubeventId!);
      if (availability.isSoldOut) {
        setIsSoldOut(true);
        setLoading(false);
        return;
      }
      setCheckoutStarted(true);
    } catch (err) {
      console.error('Availability check failed', err);
      setCheckoutStarted(true); // Fallback to proceed anyway
    } finally {
      setLoading(false);
    }
  };

  // ── Caricamento, errore, esaurito ─────────────────────────
  if (loading) {
    return <Notice icon={<Loader2 size={32} className={styles.spinner} />} title="Un attimo" text="Caricamento orari…" onClose={onClose} />;
  }

  if (loadError) {
    return (
      <Notice
        icon={<AlertTriangle size={32} />}
        title="Orari non disponibili"
        text="Non riusciamo a contattare il sistema di prenotazione. Controlla la connessione e riprova fra qualche istante."
        onClose={onClose}
        action={
          <button type="button" className={styles.noticeAction} onClick={() => fetchSchedules()}>
            <RefreshCw size={14} aria-hidden="true" /> Riprova
          </button>
        }
      />
    );
  }

  if (isSoldOut) {
    return (
      <Notice
        icon={<AlertTriangle size={32} />}
        title="Posti esauriti"
        text="Siamo spiacenti, ma i posti per questa proiezione sono terminati."
        onClose={onClose}
      />
    );
  }

  // La prenotazione si apre sempre su uno spettacolo; se manca, lo diciamo.
  if (!selectedSubeventId) {
    return (
      <Notice
        icon={<AlertTriangle size={32} />}
        title="Nessuno spettacolo scelto"
        text="Torna al programma e scegli un orario."
        onClose={onClose}
      />
    );
  }

  // ── La sala e la colonna ───────────────────────────────────
  const meta = trustedMetadata || parseComment(selectedSubEvent?.comment);
  const seatLabels = Array.from(selectedSeats.values());
  const title = meta?.title
    || (selectedSubEvent ? (typeof selectedSubEvent.name === 'object' ? selectedSubEvent.name.it : selectedSubEvent.name) : '')
    || 'Prenotazione';
  const rating = normalizeRating(meta?.rating);
  const facts = [
    meta?.roomName || '',
    meta ? languageLabel(meta.versionLanguage, meta.subtitles) : '',
  ].filter(Boolean).join(' · ');

  const stageClass = [
    styles.stage,
    booked ? styles.booked : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={stageClass}>
      {showAgeVerification && <AgeVerificationModal onConfirm={handleAgeVerified} />}

      <TicketHead
        title={title}
        logoPath={meta?.logoPath || ''}
        facts={facts}
        rating={rating === 'T' ? null : rating}
        day={selectedSubEvent ? formatShowDayLong(selectedSubEvent.date_from) : null}
        time={selectedSubEvent ? formatShowTime(selectedSubEvent.date_from) : null}
        choices={choices}
        currentId={selectedSubeventId}
        onChangeShow={checkoutStarted ? undefined : onChangeShow}
        onBack={checkoutStarted && !booked ? () => setCheckoutStarted(false) : undefined}
        onClose={onClose}
      />

      <BookingRoom
        subeventId={selectedSubeventId}
        refreshKey={refreshCounter}
        selected={new Set(selectedSeats.keys())}
        onToggle={handleSeatToggle}
        onTaken={handleSeatsTaken}
        notice={seatNotice}
        locked={checkoutStarted}
      />

      <TicketFoot
        seatLabels={seatLabels}
        legal={ageNotice(meta?.rating)}
        onProceed={startCheckout}
        checkout={checkoutStarted ? (
          <CheckoutButton
            subeventId={selectedSubeventId!}
            selectedSeats={Array.from(selectedSeats.keys())}
            onSuccess={handleBookingSuccess}
            movieRating={meta?.rating}
          />
        ) : undefined}
      />
    </div>
  );
}
