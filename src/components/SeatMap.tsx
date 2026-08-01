'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Loader2, Info, AlertTriangle, RefreshCw } from 'lucide-react';
import { getSubEventSeats } from '@/services/pretix';
import styles from './SeatMap.module.css';

/**
 * Ogni quanto rileggere i posti da Pretix mentre l'utente sceglie. La mappa
 * veniva caricata una volta sola: chi restava qualche minuto sulla pagina
 * sceglieva un posto che nel frattempo qualcun altro aveva preso, e lo
 * scopriva soltanto al momento della conferma.
 */
const SEAT_REFRESH_MS = 20_000;

interface SeatMapProps {
  selectedSeats: Set<string>;
  onSeatToggle: (seatId: string, label: string) => void;
  subeventId?: number | null;
  /** Posti scelti dall'utente che nel frattempo sono stati occupati. */
  onSeatsTaken?: (seats: { id: string; label: string }[]) => void;
}

interface Seat {
  id: string;
  name: string;
  row: string;
  seat: string;
  isOccupied: boolean;
  isVip: boolean;
}

export default function SeatMap({ selectedSeats, onSeatToggle, subeventId, onSeatsTaken }: SeatMapProps) {
  const [seats, setSeats] = useState<Seat[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Gli handler cambiano a ogni render del genitore: teniamoli in un ref per
  // non far ripartire il polling ogni volta.
  const selectedSeatsRef = useRef(selectedSeats);
  const onSeatsTakenRef = useRef(onSeatsTaken);
  useEffect(() => { selectedSeatsRef.current = selectedSeats; }, [selectedSeats]);
  useEffect(() => { onSeatsTakenRef.current = onSeatsTaken; }, [onSeatsTaken]);

  // ── Data loading ─────────────────────────────────────────────
  const loadSeats = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!subeventId) return;

    if (!silent) {
      setLoading(true);
      setLoadError(false);
    }

    try {
      // 1. Fetch Seats directly from Seats API
      const statusData = await getSubEventSeats(subeventId);

      if (!statusData || !Array.isArray(statusData)) {
        throw new Error('Dati posti non disponibili');
      }

      // 2. Process into a simple list
      const extractedSeats: Seat[] = statusData.map((s: any) => {
        const isVip =
          (typeof s.seat_guid === 'string' && s.seat_guid.toUpperCase().includes('VIP')) ||
          (typeof s.category === 'string' && (s.category.toUpperCase().includes('VIP') || s.category.toUpperCase().includes('POLTRONA')));

        return {
          id: s.seat_guid || s.id.toString(),
          name: s.name || `Posto ${s.seat_number}`,
          row: s.row_name || '',
          seat: s.seat_number || '',
          isOccupied: s.available === false || !!s.blocked || s.orderposition !== null || s.cartposition !== null,
          isVip
        };
      });

      // Ordina i posti per fila e numero per una visualizzazione coerente
      extractedSeats.sort((a, b) => {
        if (a.row !== b.row) return a.row.localeCompare(b.row, undefined, { numeric: true });
        return a.seat.localeCompare(b.seat, undefined, { numeric: true });
      });

      // Qualcuno ha preso un posto che l'utente aveva già scelto? Avvisiamo il
      // flusso di prenotazione, che lo toglie dalla selezione e lo dice.
      const taken = extractedSeats
        .filter(s => s.isOccupied && selectedSeatsRef.current.has(s.id))
        .map(s => ({ id: s.id, label: s.row ? `Fila ${s.row} - Posto ${s.seat}` : s.name }));
      if (taken.length > 0) onSeatsTakenRef.current?.(taken);

      setSeats(extractedSeats);
      setLoadError(false);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[SeatMap] ❌ LOAD ERROR:', error);
      }
      // Un aggiornamento in background che fallisce non deve cancellare la
      // mappa che l'utente sta usando: l'errore si mostra solo se non
      // abbiamo nulla da mostrare.
      if (!silent) {
        setSeats([]);
        setLoadError(true);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [subeventId]);

  useEffect(() => {
    loadSeats();
  }, [loadSeats]);

  // Aggiornamento periodico finché la scheda è in primo piano.
  useEffect(() => {
    if (!subeventId) return;

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      loadSeats({ silent: true });
    }, SEAT_REFRESH_MS);

    return () => clearInterval(interval);
  }, [subeventId, loadSeats]);

  // ── Raggruppa i posti per fila (i posti sono già ordinati) ────
  const rows = useMemo(() => {
    const grouped: { row: string; seats: Seat[] }[] = [];
    for (const seat of seats) {
      const last = grouped[grouped.length - 1];
      if (last && last.row === seat.row) last.seats.push(seat);
      else grouped.push({ row: seat.row, seats: [seat] });
    }
    return grouped;
  }, [seats]);

  const hasRowLabels = rows.some(r => r.row !== '');

  if (loading) return (
    <div className={styles.loadingContainer}>
      <Loader2 className={styles.spinner} size={36} />
      <span>Caricamento posti…</span>
    </div>
  );

  // "Non siamo riusciti a leggere i posti" e "i posti sono finiti" sono due
  // cose diverse: prima si vedeva lo stesso messaggio in entrambi i casi.
  if (loadError) return (
    <div className={styles.loadErrorBox} role="alert">
      <AlertTriangle size={30} className={styles.loadErrorIcon} />
      <p className={styles.errorTitle}>Posti non disponibili al momento</p>
      <span>Non riusciamo a leggere la mappa della sala. Controlla la connessione e riprova.</span>
      <button type="button" className={styles.retryBtn} onClick={() => loadSeats()}>
        <RefreshCw size={15} />
        Riprova
      </button>
    </div>
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.stageArea}>
        <div className={styles.screenWrapper}>
          <div className={styles.screenCurve} />
          <span className={styles.screenLabel}>Schermo</span>
        </div>
      </div>

      <div className={styles.container}>
        {seats.length > 0 ? (
          <div className={styles.rows}>
            {rows.map(({ row, seats: rowSeats }) => (
              <div className={styles.row} key={row || 'sala'}>
                {hasRowLabels && <span className={styles.rowLabel} aria-hidden="true">{row}</span>}
                <div className={styles.rowSeats}>
                  {rowSeats.map(seat => {
                    const isSelected = selectedSeats.has(seat.id);
                    // I posti "poltrona" non sono acquistabili online (bloccati lato server):
                    // li mostriamo come non disponibili invece di far fallire il checkout.
                    const isDisabled = seat.isOccupied || seat.isVip;
                    const label = seat.row ? `Fila ${seat.row} - Posto ${seat.seat}` : seat.name;

                    return (
                      <button
                        key={seat.id}
                        disabled={isDisabled}
                        type="button"
                        aria-label={label}
                        aria-pressed={isSelected}
                        onClick={() => onSeatToggle(seat.id, label)}
                        className={[
                          styles.seat,
                          isDisabled ? styles.occupied : isSelected ? styles.selected : styles.available
                        ].join(' ')}
                        title={isDisabled ? `${label} — non disponibile` : label}
                      >
                        <span className={styles.seatLabel}>
                          {seat.seat || seat.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {hasRowLabels && <span className={styles.rowLabel} aria-hidden="true">{row}</span>}
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.noSeats}>
            <Info size={32} className={styles.noSeatsIcon} />
            <p className={styles.errorTitle}>Nessun posto disponibile</p>
            <span>Non ci sono posti da mostrare per questa proiezione.</span>
          </div>
        )}
      </div>

      <div className={styles.legend}>
        <div className={styles.legendItem}><span className={[styles.dot, styles.dotAvailable].join(' ')} /><span>Libero</span></div>
        <div className={styles.legendItem}><span className={[styles.dot, styles.dotSelected].join(' ')} /><span>Selezionato</span></div>
        <div className={styles.legendItem}><span className={[styles.dot, styles.dotOccupied].join(' ')} /><span>Non disponibile</span></div>
      </div>
    </div>
  );
}
