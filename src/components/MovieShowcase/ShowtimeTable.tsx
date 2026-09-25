import type { HeroShowtimeDay } from './heroData';
import styles from './ShowtimeTable.module.css';

// Quanti giorni stanno nell'hero prima di "Tutti gli orari ↓". Oltre, l'hero
// diventerebbe più lungo dello schermo: il resto lo mostra il calendario.
const DESK_DAYS = 5;
const PHONE_DAYS = 3;

interface ShowtimeTableProps {
  days: HeroShowtimeDay[];
  title: string;
  onPick: (subeventId: number) => void;
}

export default function ShowtimeTable({ days, title, onPick }: ShowtimeTableProps) {
  if (days.length === 0) {
    return <p className={styles.empty}>Nessuno spettacolo in programma</p>;
  }

  return (
    <div className={styles.wrap}>
      <dl className={styles.table}>
        {days.map((day, i) => (
          <div
            key={`${day.dayLabel}-${i}`}
            className={[
              styles.row,
              i >= PHONE_DAYS ? styles.extraPhone : '',
              i >= DESK_DAYS ? styles.extraDesk : '',
            ].filter(Boolean).join(' ')}
          >
            <dt className={styles.day}>{day.dayLabel}</dt>
            <dd className={styles.shows}>
              {day.shows.map(show => (
                <button
                  key={show.id}
                  type="button"
                  className={[
                    styles.time,
                    show.isNext ? styles.next : '',
                    show.isSoldOut ? styles.soldOut : '',
                  ].filter(Boolean).join(' ')}
                  disabled={show.isSoldOut}
                  onClick={() => onPick(show.id)}
                  aria-label={show.isSoldOut
                    ? `${title}, ${day.dayLabel} alle ${show.time}: esaurito`
                    : `Prenota ${title}, ${day.dayLabel} alle ${show.time}`}
                >
                  <span className={styles.clock}>{show.time}</span>
                  {show.tags.length > 0 && <span className={styles.tags}>{show.tags.join(' · ')}</span>}
                </button>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      {days.length > PHONE_DAYS && (
        <a
          href="#programma"
          className={days.length > DESK_DAYS ? styles.all : `${styles.all} ${styles.phoneOnly}`}
        >
          Tutti gli orari ↓
        </a>
      )}
    </div>
  );
}
