'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import SeatMap from './SeatMap';
import CheckoutTimer from './CheckoutTimer';
import CheckoutButton from './CheckoutButton';
import RatingBadge from './RatingBadge';
import LanguageBadge from './LanguageBadge';
import AgeVerificationModal from './AgeVerificationModal';

import type { MovieOverride, PretixSync } from '@prisma/client';
import { getTrustedSubeventMetadata, reportSoldOut, verifyQuotaAvailability } from '@/actions/bookingActions';

import { isVM18, isVM14, normalizeRating } from '@/utils/ratingUtils';
import { listSubEvents, getItemAvailability, getSubEvent, listQuotas, getSubEventSeats, finalizeBooking } from '@/services/pretix';
import { ITEM_INTERO_ID, ITEM_VIP_ID } from '@/constants/pretix';
import { Loader2, Calendar, Clock, ChevronLeft, Info, AlertTriangle, Globe, MessageSquare, X } from 'lucide-react';

import styles from './BookingFlow.module.css';

interface BookingFlowProps {
  subeventId?: number;
  onClose?: () => void;
}



export default function BookingFlow({ subeventId, onClose }: BookingFlowProps) {
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

  useEffect(() => {
    sessionStorage.removeItem('age-verified');
    // Reset state whenever the component mounts (Modal opens)
    setCheckoutStarted(false);
    setSelectedSeats(new Map());
    setRefreshCounter(prev => prev + 1);
  }, []);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
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
      console.error('Failed to load subevents', err);
    } finally {
      setLoading(false);
    }
  }, [subeventId]);

  // ────────────────────────────────────────────────────────────
  // NEW: AUTOMATIC SOLD OUT REPORTING (Fail-Fast Sync)
  // ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isSoldOut && selectedSubeventId) {
      console.log(`[BookingFlow] Detecting Sold Out for ${selectedSubeventId}, reporting to backend...`);
      reportSoldOut(selectedSubeventId).catch(err => console.error('[SYNC] Failed to report sold out:', err));
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
  };

  const handleSubeventSelect = (se: any) => {
    if (se.isSoldOut) return;

    try {
      if (se.comment) {
        const meta = JSON.parse(se.comment);
        const needsVerification = isVM18(meta.rating);
        
        if (needsVerification) {
          // If it's a 18+ movie, we must verify (or re-verify if needed)
          setIsAgeVerified(false); 
          setShowAgeVerification(true);
        } else {
          // If NOT 18+, we automatically clear the verification and show no gate
          setIsAgeVerified(true);
          setShowAgeVerification(false);
          // Optional: clear any session storage to be clean
          sessionStorage.removeItem('age-verified');
        }
      }
    } catch (e) {}

    setSelectedSubeventId(se.id);
  };

  const handleBookingSuccess = () => {
    console.log('[BookingFlow] Booking successful, cleaning up technical session data...');
    
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

  // ── Loading ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Loader2 size={36} className={styles.spinner} />
        <p className={styles.loadingText}>Caricamento orari…</p>
      </div>
    );
  }

  // ── Sold Out State ────────────────────────────────────────────
  if (isSoldOut) {
    return (
      <div className={styles.container}>
        <div className={styles.soldOutContainer}>
          {onClose && (
            <button className={styles.closeBtnOverlay} onClick={onClose} aria-label="Chiudi">
              <X size={20} />
            </button>
          )}
          <AlertTriangle size={48} className={styles.soldOutIcon} />
          <h2 className={styles.soldOutTitle}>Posti Esauriti</h2>
          <p className={styles.soldOutDesc}>
            Siamo spiacenti, ma i posti per questa proiezione sono terminati.
          </p>
          {!subeventId && (
            <button 
              className={styles.backBtn}
              onClick={() => {
                setSelectedSubeventId(null);
                setSelectedSubEvent(null);
                setIsSoldOut(false);
              }}
            >
              Scegli un altro orario
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Checkout ─────────────────────────────────────────────────
  if (checkoutStarted) {
    const seatIds = Array.from(selectedSeats.keys());
    const seatLabels = Array.from(selectedSeats.values());
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.titleBlock}>
            <h2 className={styles.title}>Completa la prenotazione</h2>
          </div>
          <div className={styles.headerActions}>
            <CheckoutTimer maxTimeSeconds={600} onExpire={() => setCheckoutStarted(false)} />
            {onClose && (
              <button className={styles.closeButtonMinimal} onClick={onClose} aria-label="Chiudi">
                <X size={20} />
              </button>
            )}
          </div>
        </div>

        <div className={styles.seatsSummary}>
          <div className={styles.seatsSummaryLabel}>Posti selezionati</div>
          <div className={styles.seatsList}>{seatLabels.join(' · ')}</div>
        </div>

        {/* Pass rating extracted from metadata if available */}
        <CheckoutButton 
          subeventId={selectedSubeventId!} 
          selectedSeats={seatIds} 
          onSuccess={handleBookingSuccess}
          movieRating={trustedMetadata?.rating || (() => {
            try {
              if (selectedSubEvent?.comment) {
                const meta = JSON.parse(selectedSubEvent.comment);
                return meta.rating;
              }
            } catch (e) {}
            return undefined;
          })()}
        />
      </div>
    );
  }

  // ── Main UI ───────────────────────────────────────────────────
  const count = selectedSeats.size;
  const totalPrice = (count * 0).toFixed(2).replace('.', ','); 

  const subeventDate = selectedSubEvent ? new Date(selectedSubEvent.date_from) : null;
  const timeStr = subeventDate ? subeventDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
  const dateStr = subeventDate ? subeventDate.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  const movieTitle = selectedSubEvent ? (typeof selectedSubEvent.name === 'object' ? selectedSubEvent.name.it : selectedSubEvent.name) : '';

  return (
    <div className={styles.container}>
      {/* 18+ Age Verification Modal - rendered at the root to ensure it covers everything */}
      {showAgeVerification && (
        <AgeVerificationModal onConfirm={handleAgeVerified} />
      )}

      {/* Top-Right prominent rating badge for better readability */}
      {(() => {
          // Use trusted metadata from DB if available, otherwise fallback to Pretix comment
          const metaSource = trustedMetadata || (() => {
            try {
              return selectedSubEvent?.comment ? JSON.parse(selectedSubEvent.comment) : null;
            } catch { return null; }
          })();

          if (!metaSource) return null;

          return (
            <div className={styles.topRightRating}>
              {metaSource.rating && <RatingBadge id={metaSource.rating} size="md" />}
              <LanguageBadge 
                language={metaSource.versionLanguage || 'ITA'} 
                subtitles={metaSource.subtitles || 'NESSUNO'} 
                size="md" 
                showLabel={true}
              />
            </div>
          );
      })()}

      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <div className={styles.titleRow}>
            <h2 className={styles.title}>
              {selectedSubeventId ? `${movieTitle} — ${timeStr}` : 'Scegli la proiezione'}
            </h2>
            {onClose && (
              <button className={styles.closeButtonMinimal} onClick={onClose} aria-label="Chiudi">
                <X size={20} />
              </button>
            )}
          </div>
          {/* Removing redundant badge below title - it's already in the top-right next to the rating */}


          <p className={styles.desc}>
            {selectedSubeventId ? `${dateStr}` : 'Seleziona un orario per procedere alla scelta dei posti.'}
          </p>
        </div>
        {selectedSubeventId && !subeventId && (
          <button
            className={styles.changeTimeBtn}
            onClick={() => {
              setSelectedSubeventId(null);
              setSelectedSeats(new Map());
              setSelectedSubEvent(null);
            }}
          >
            <ChevronLeft size={14} />
            <span>Cambia orario</span>
          </button>
        )}
      </div>

      {!selectedSubeventId ? (
        <div className={styles.subeventList}>
          {subevents.length > 0 ? (
            subevents.map(se => {
              const date = new Date(se.date_from);
              return (
                <button
                  key={se.id}
                  className={`${styles.subeventBtn} ${se.isSoldOut ? styles.subeventBtnSoldOut : ''}`}
                  onClick={() => handleSubeventSelect(se)}
                  disabled={se.isSoldOut}
                >
                  <div className={styles.subeventInfo}>
                    <Clock size={14} className={styles.metaIcon} />
                    <span className={styles.subeventTime}>
                      {date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {se.isSoldOut && <span className={styles.soldOutBadge}>ESAURITO</span>}
                  </div>
                  <div className={styles.subeventInfo}>
                    <Calendar size={13} className={styles.metaIcon} />
                    <span className={styles.subeventDate}>
                      {date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </span>
                  </div>
                </button>
              );
            })
          ) : (
            <p className={styles.desc}>Nessuna proiezione disponibile al momento.</p>
          )}
          
          <div className={styles.infoNote} style={{ marginTop: '2rem' }}>
            <Info size={14} style={{ flexShrink: 0 }} />
            <span>La vendita dei biglietti termina 2 minuti prima dell&apos;inizio della proiezione.</span>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.seatMapWrapper}>
              <SeatMap
                key={`${selectedSubeventId}-${refreshCounter}`}
                selectedSeats={new Set(selectedSeats.keys())}
                onSeatToggle={handleSeatToggle}
                subeventId={selectedSubeventId}
                onClose={onClose}
              />
            </div>

            {(() => {
                // AGE WARNING LOGIC: TRUSTED DB FIRST
                const metaSource = trustedMetadata || (() => {
                  try {
                    return selectedSubEvent?.comment ? JSON.parse(selectedSubEvent.comment) : null;
                  } catch { return null; }
                })();

                if (!metaSource) return null;

                const r = String(metaSource.rating || '');
                const norm = normalizeRating(r);
                
                if (norm === '18+' || norm === '14+' || norm === '10+' || norm === '6+') {
                  const age = norm === '18+' ? '18' : (norm === '14+' ? '14' : (norm === '10+' ? '10' : '6'));
                  const isRestriction = norm === '18+'; // Only 18+ gets the RED legal warning
                  
                  return (
                    <div className={isRestriction ? styles.legalInfo : `${styles.legalInfo} ${styles.infoOnly}`}>
                      {isRestriction ? <AlertTriangle size={14} /> : <Info size={14} />}
                      <span>
                        {isRestriction 
                          ? `L'accesso a questa proiezione è limitato ai maggiori di ${age} anni.`
                          : (norm === '14+' 
                              ? `L'accesso a questa proiezione è limitato ai maggiori di 14 anni.`
                              : `La visione di questo film è consigliata dai ${age} anni in su.`)}
                      </span>
                    </div>
                  );
                }
                return null;
            })()}

          <div className={styles.footer}>
            <div className={styles.summaryInfo}>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Posti selezionati</span>
                <span className={styles.summaryValue}>{count}</span>
              </div>
              <div className={styles.summaryDivider} />
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Totale</span>
                <span className={styles.summaryValue}>{totalPrice} €</span>
              </div>
            </div>

            <div className={styles.actionBlock}>
              <button
                className={`${styles.proceedBtn} ${count > 0 ? styles.visible : ''}`}
                disabled={count === 0}
                onClick={startCheckout}
              >
                PROCEDI ALL&apos;ACQUISTO
              </button>
              {count === 0 && (
                <p className={styles.hintText}>Seleziona almeno un posto per continuare</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
