'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import SeatMap from './SeatMap';
import CheckoutTimer from './CheckoutTimer';
import CheckoutButton from './CheckoutButton';
import { listSubEvents, getItemAvailability, getSubEvent, listQuotas } from '@/services/pretix';
import { ITEM_INTERO_ID } from '@/constants/pretix';
import { getLanguageFull, getSubtitleFull } from '@/utils/languageUtils';
import { Loader2, Calendar, Clock, ChevronLeft, Info, AlertTriangle, Globe, MessageSquare, X } from 'lucide-react';
import styles from './BookingFlow.module.css';

interface BookingFlowProps {
  subeventId?: number;
  onClose?: () => void;
}

function LanguageDetailView({ lingua, sottotitoli }: { lingua?: string; sottotitoli?: string }) {
  if (!lingua) return null;

  const langInfo = getLanguageFull(lingua);
  const subFull = getSubtitleFull(sottotitoli || '');

  // If Italian and no subtitles, show a simplified version
  const isItalian = langInfo.name.toLowerCase() === 'italiano' && !subFull;

  return (
    <div className={styles.languageDetail}>
      {isItalian ? (
        <div className={styles.langItem}>
          <Globe size={18} className={styles.langIcon} />
          <span>Lingua: <span className={styles.langHighlight}>{langInfo.name}</span> {langInfo.flag}</span>
        </div>
      ) : (
        <>
          <div className={styles.langItem}>
            <Globe size={18} className={styles.langIcon} />
            <span>Lingua Originale <span className={styles.langHighlight}>{langInfo.name}</span> {langInfo.flag}</span>
          </div>
          {subFull && (
            <>
              <span className={styles.langSeparator}>—</span>
              <div className={styles.langItem}>
                <MessageSquare size={18} className={styles.langIcon} />
                <span>Sottotitoli in <span className={styles.langHighlight}>{subFull}</span></span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function BookingFlow({ subeventId, onClose }: BookingFlowProps) {
  const [selectedSeats, setSelectedSeats] = useState<Map<string, string>>(new Map());
  const [checkoutStarted, setCheckoutStarted] = useState(false);
  const [subevents, setSubevents] = useState<any[]>([]);
  const [selectedSubeventId, setSelectedSubeventId] = useState<number | null>(subeventId || null);
  const [selectedSubEvent, setSelectedSubEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSoldOut, setIsSoldOut] = useState(false);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const [data, allQuotas] = await Promise.all([
        listSubEvents(true),
        listQuotas()
      ]);

      if (subeventId) {
        const se = data.find((s: any) => s.id === subeventId) || await getSubEvent(subeventId);
        const interoQuota = allQuotas.find((q: any) => q.subevent === subeventId && q.items.includes(ITEM_INTERO_ID));
        
        setIsSoldOut(
          (interoQuota && interoQuota.available_number !== null && interoQuota.available_number <= 0) ||
          se.best_availability_state === 'sold_out' ||
          (se.active && se.presale_is_running === false)
        );
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

  const startCheckout = () => {
    if (selectedSeats.size > 0) setCheckoutStarted(true);
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
            Siamo spiacenti, ma tutti i posti per questa proiezione sono stati prenotati.
          </p>
          {!subeventId && (
            <button 
              className={styles.backBtn}
              onClick={() => {
                setSelectedSubeventId(null);
                setSelectedSubEvent(null);
              }}
            >
              Scegli un altro orario
            </button>
          )}
        </div>
      </div>

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

        <CheckoutButton subeventId={selectedSubeventId!} selectedSeats={seatIds} onSuccess={fetchSchedules} />
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
          {selectedSubeventId && selectedSubEvent && (
            <LanguageDetailView 
              lingua={selectedSubEvent.meta_data?.lingua} 
              sottotitoli={selectedSubEvent.meta_data?.sottotitoli} 
            />
          )}
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
                  onClick={() => !se.isSoldOut && setSelectedSubeventId(se.id)}
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
              selectedSeats={new Set(selectedSeats.keys())}
              onSeatToggle={handleSeatToggle}
              subeventId={selectedSubeventId}
              onClose={onClose}
            />
          </div>

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
