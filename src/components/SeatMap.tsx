'use client';

import { useState, useEffect } from 'react';
import { RotateCcw, X, Loader2 } from 'lucide-react';
import { getSeatingPlan, getAvailability } from '@/services/pretix';
import styles from './SeatMap.module.css';

interface SeatMapProps {
  selectedSeats: Set<string>;
  onSeatToggle: (seatId: string, label: string) => void;
  subeventId?: number | null;
  onClose?: () => void;
}

interface Seat {
  id: string;
  row: number;
  col: number;
  isOccupied: boolean;
  isVip?: boolean;
  rowName?: string;
  seatName?: string;
}

export default function SeatMap({ selectedSeats, onSeatToggle, subeventId, onClose }: SeatMapProps) {
  const [seats, setSeats] = useState<Seat[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Data loading ─────────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      if (!subeventId) return;

      console.log(`[SeatMap] 🚀 Loading sub-event ${subeventId}`);
      setLoading(true);
      try {
        const [planData, availabilityData] = await Promise.all([
          getSeatingPlan(subeventId),
          getAvailability(subeventId)
        ]);
        
        void availabilityData;

        if (planData && Array.isArray(planData) && planData.length > 0) {
          const VIP_PRODUCT_ID = 344653;

          const transformedSeats: Seat[] = planData
            .filter((s: any) => s && (s.seat_guid || s.id))
            .map((s: any) => {
              const isVip =
                s.product === VIP_PRODUCT_ID ||
                (typeof s.zone_name === 'string' && (
                  s.zone_name.toLowerCase().includes('vip') ||
                  s.zone_name.toLowerCase().includes('poltrona')
                ));

              let rowIdx = 0, colIdx = 0;
              if (s.row_name) rowIdx = parseInt(s.row_name) || (s.row_name.charCodeAt(0) - 64);
              if (s.seat_number) colIdx = parseInt(s.seat_number) || (s.seat_number.charCodeAt(0) - 64);

              return {
                id: s.seat_guid || s.id.toString(),
                row: rowIdx,
                col: colIdx,
                isOccupied: s.available === false || !!s.blocked || s.orderposition !== null || s.cartposition !== null,
                isVip,
                rowName: s.row_name || String.fromCharCode(64 + Math.max(1, rowIdx)),
                seatName: s.seat_number || colIdx.toString(),
              };
            });

          // Sort numerically by seat number (1, 2, 3...)
          const sortedSeats = [...transformedSeats].sort((a, b) => {
            const numA = parseInt(a.seatName || '0', 10);
            const numB = parseInt(b.seatName || '0', 10);
            return numA - numB;
          });

          setSeats(sortedSeats);
        } else {
          setSeats([]);
        }
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
      <span>Sincronizzazione planimetria...</span>
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
          <div className={styles.seatsRow}>
            {seats.map(seat => {
              const isSelected = selectedSeats.has(seat.id);
              return (
                <button
                  key={seat.id}
                  disabled={seat.isOccupied}
                  type="button"
                  onClick={() => onSeatToggle(seat.id, `Fila ${seat.rowName} - Posto ${seat.seatName}`)}
                  className={[
                    styles.seat,
                    seat.isOccupied ? styles.occupied : isSelected ? styles.selected : styles.available,
                    seat.isVip ? styles.vip : ''
                  ].join(' ')}
                >
                  <span className={styles.seatLabel}>{seat.seatName}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className={styles.noSeats}>
            <RotateCcw size={48} className={styles.noSeatsIcon} />
            <p className={styles.errorTitle}>ERRORE DATI: NESSUN POSTO</p>
            <span>Pretix non ha restituito posti per questo evento ({subeventId}).</span>
            <span className={styles.errorHint}>Verificare che l&apos;evento su Pretix abbia una planimetria e posti numerati.</span>
          </div>
        )}
      </div>

      <div className={styles.bottomActions}>
        {onClose && (
          <button onClick={onClose} className={styles.closeBtn} title="Chiudi">
            <X size={20} />
            <span>Chiudi Selezionatore</span>
          </button>
        )}
      </div>

      <div className={styles.legend}>
        <div className={styles.legendItem}><div className={[styles.dot, styles.dotAvailable].join(' ')} /><span>Libero</span></div>
        <div className={styles.legendItem}><div className={[styles.dot, styles.dotSelected].join(' ')} /><span>Selezionato</span></div>
        <div className={styles.legendItem}><div className={[styles.dot, styles.dotOccupied].join(' ')} /><span>Occupato</span></div>
      </div>
    </div>
  );
}
