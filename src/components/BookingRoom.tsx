import { AlertTriangle } from 'lucide-react';
import SeatMap from './SeatMap';
import styles from './BookingFlow.module.css';

interface BookingRoomProps {
  subeventId: number;
  /** Cambia per forzare una nuova lettura della mappa. */
  refreshKey: number;
  selected: Set<string>;
  onToggle: (seatId: string, label: string) => void;
  onTaken: (seats: { id: string; label: string }[]) => void;
  notice: string | null;
  /** Durante la conferma i posti restano visibili ma non si toccano. */
  locked: boolean;
}

/** La sala: lo schermo, le poltrone e l'avviso quando qualcuno ci ruba un posto. */
export default function BookingRoom({ subeventId, refreshKey, selected, onToggle, onTaken, notice, locked }: BookingRoomProps) {
  return (
    <section className={locked ? `${styles.room} ${styles.roomLocked}` : styles.room} aria-label="La sala">
      {notice && (
        <p className={styles.seatNotice} role="status">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{notice}</span>
        </p>
      )}
      <div className={styles.map} inert={locked}>
        <SeatMap
          key={`${subeventId}-${refreshKey}`}
          selectedSeats={selected}
          onSeatToggle={onToggle}
          onSeatsTaken={onTaken}
          subeventId={subeventId}
        />
      </div>
    </section>
  );
}
