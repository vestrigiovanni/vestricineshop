import { useState, useEffect, useMemo } from 'react';
import { RotateCcw, X, Loader2, Info } from 'lucide-react';
import { getSubEventSeats } from '@/services/pretix';
import styles from './SeatMap.module.css';

interface SeatMapProps {
  selectedSeats: Set<string>;
  onSeatToggle: (seatId: string, label: string) => void;
  subeventId?: number | null;
  onClose?: () => void;
}

interface Seat {
  id: string;
  name: string;
  row: string;
  seat: string;
  isOccupied: boolean;
  isVip: boolean;
}

export default function SeatMap({ selectedSeats, onSeatToggle, subeventId, onClose }: SeatMapProps) {
  const [seats, setSeats] = useState<Seat[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Data loading ─────────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      if (!subeventId) return;

      console.log(`[SeatMap] 🚀 Loading sub-event ${subeventId} (Simplified Mode)`);
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
        console.error('[SeatMap] ❌ LOAD ERROR:', error);
        setSeats([]);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [subeventId]);

  if (loading) return (
    <div className={styles.loadingContainer}>
      <Loader2 className={styles.spinner} size={48} />
      <span>Sincronizzazione posti in tempo reale...</span>
    </div>
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.stageArea}>
        <div className={styles.screenWrapper}>
          <div className={styles.screenCurve} />
          <span className={styles.screenLabel}>SCHERMO / PALCO</span>
        </div>
      </div>

      <div className={styles.container}>
        {seats.length > 0 ? (
          <div className={styles.simplifiedRow}>
            {seats.map(seat => {
              const isSelected = selectedSeats.has(seat.id);
              const label = seat.row ? `Fila ${seat.row} - Posto ${seat.seat}` : seat.name;

              return (
                <button
                  key={seat.id}
                  disabled={seat.isOccupied}
                  type="button"
                  onClick={() => onSeatToggle(seat.id, label)}
                  className={[
                    styles.seat,
                    seat.isOccupied ? styles.occupied : isSelected ? styles.selected : styles.available,
                    seat.isVip ? styles.vip : '',
                    styles.simplifiedSeat
                  ].join(' ')}
                  title={label + (seat.isOccupied ? ' (Occupato)' : '')}
                >
                  <span className={styles.seatLabel}>
                    {seat.seat || seat.name}
                  </span>
                  {seat.row && <span className={styles.rowSubLabel}>{seat.row}</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <div className={styles.noSeats}>
            <Info size={48} className={styles.noSeatsIcon} />
            <p className={styles.errorTitle}>NESSUN POSTO DISPONIBILE</p>
            <span>Pretix non ha restituito posti per questo evento ({subeventId}).</span>
          </div>
        )}
      </div>

      <div className={styles.bottomActions}>
        {onClose && (
          <button onClick={onClose} className={styles.closeBtn} title="Chiudi">
            <X size={20} />
            <span>Chiudi Mappa</span>
          </button>
        )}
      </div>

      <div className={styles.legend}>
        <div className={styles.legendItem}><div className={[styles.dot, styles.dotAvailable].join(' ')} /><span>Libero</span></div>
        <div className={styles.legendItem}><div className={[styles.dot, styles.dotSelected].join(' ')} /><span>Selezionato</span></div>
        <div className={styles.legendItem}><div className={[styles.dot, styles.dotOccupied].join(' ')} /><span>Occupato</span></div>
        <div className={styles.legendItem}><div className={[styles.dot, styles.dotVip].join(' ')} /><span>⭐ VIP</span></div>
      </div>
    </div>
  );
}
