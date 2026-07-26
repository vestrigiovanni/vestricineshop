import { useState, useEffect, useMemo } from 'react';
import { Loader2, Info } from 'lucide-react';
import { getSubEventSeats } from '@/services/pretix';
import styles from './SeatMap.module.css';

interface SeatMapProps {
  selectedSeats: Set<string>;
  onSeatToggle: (seatId: string, label: string) => void;
  subeventId?: number | null;
}

interface Seat {
  id: string;
  name: string;
  row: string;
  seat: string;
  isOccupied: boolean;
  isVip: boolean;
}

export default function SeatMap({ selectedSeats, onSeatToggle, subeventId }: SeatMapProps) {
  const [seats, setSeats] = useState<Seat[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Data loading ─────────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      if (!subeventId) return;

      if (process.env.NODE_ENV !== 'production') {
        console.log(`[SeatMap] 🚀 Loading sub-event ${subeventId} (Simplified Mode)`);
      }
      setLoading(true);
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

        setSeats(extractedSeats);
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[SeatMap] ❌ LOAD ERROR:', error);
        }
        setSeats([]);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [subeventId]);

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
