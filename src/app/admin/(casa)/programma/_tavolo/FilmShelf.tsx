'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Info, Plus } from 'lucide-react';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import { type BrowserFilm, is4K, isNew, loadFilmCard, metaLine } from './filmCard';
import styles from './FilmBrowser.module.css';

interface CardProps {
  film: BrowserFilm;
  on: boolean;
  onToggle: (film: BrowserFilm) => void;
  onInfo: (film: BrowserFilm) => void;
}

/**
 * Un poster. Il clic sul poster lo sceglie al volo; la "i" apre la scheda.
 * Al passaggio del mouse il poster si alza e mostra cosa sa di sé.
 */
export function PosterCard({ film, on, onToggle, onInfo }: CardProps) {
  const poster = getTMDBImageUrl(film.posterPath, 'w342');
  const prefetch = () => {
    if (film.tmdbId) void loadFilmCard(film.tmdbId);
  };
  return (
    <div className={styles.card} data-on={on || undefined}>
      <button
        type="button"
        className={styles.cardPoster}
        aria-pressed={on}
        onClick={() => onToggle(film)}
        aria-label={`${on ? 'Togli' : 'Scegli'} ${film.title}`}
      >
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt="" loading="lazy" draggable={false} />
        ) : (
          <span className={styles.noPoster}>{film.title}</span>
        )}
        <span className={styles.badges}>
          {isNew(film) && <span className={styles.badgeNew}>Nuovo</span>}
          {is4K(film) && <span className={styles.badge}>4K</span>}
        </span>
        {on && (
          <span className={styles.check}>
            <Check size={15} strokeWidth={3} />
          </span>
        )}
        <span className={styles.cardHover}>
          <span className={styles.cardTitle}>{film.title}</span>
          <span className={styles.cardMeta}>{metaLine(film)}</span>
          {film.director && <span className={styles.cardMeta}>{film.director}</span>}
          {film.tasteNote && <span className={styles.cardNote}>{film.tasteNote}</span>}
          <span className={styles.cardMeta}>
            {film.scheduledCount ? `In sala ${film.scheduledCount} ${film.scheduledCount === 1 ? 'volta' : 'volte'}` : 'Mai programmato'}
          </span>
          <span className={styles.cardAdd}>{on ? <><Check size={13} /> Scelto</> : <><Plus size={13} /> Scegli</>}</span>
        </span>
      </button>
      <button
        type="button"
        className={styles.infoBtn}
        onClick={() => onInfo(film)}
        onPointerEnter={prefetch}
        onFocus={prefetch}
        aria-label={`Scheda di ${film.title}`}
        title="Trama, cast, trailer"
      >
        <Info size={15} />
      </button>
    </div>
  );
}

interface ShelfProps {
  title: string;
  hint?: string;
  films: BrowserFilm[];
  selected: Set<string>;
  onToggle: (film: BrowserFilm) => void;
  onInfo: (film: BrowserFilm) => void;
  action?: React.ReactNode;
}

/** Una riga di poster che scorre di lato, con le frecce ai bordi. */
export default function FilmShelf({ title, hint, films, selected, onToggle, onInfo, action }: ShelfProps) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = () =>
      setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      ro.disconnect();
    };
  }, [films.length]);

  const page = (dir: 1 | -1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
  };
  const picked = films.filter((f) => f.tmdbId && selected.has(f.tmdbId)).length;

  return (
    <section className={styles.shelf} aria-label={title}>
      <header className={styles.shelfHead}>
        <h3>{title}</h3>
        {hint && <span className={styles.shelfHint}>{hint}</span>}
        {picked > 0 && <span className={styles.shelfPicked}>{picked} scelti</span>}
        {action}
      </header>
      <div className={styles.shelfBody}>
        {!edges.start && (
          <button type="button" className={`${styles.arrow} ${styles.arrowLeft}`} onClick={() => page(-1)} aria-label="Indietro">
            <ChevronLeft size={26} />
          </button>
        )}
        <div ref={track} className={styles.track}>
          {films.map((f) => (
            <PosterCard key={f.tmdbId ?? f.id} film={f} on={Boolean(f.tmdbId && selected.has(f.tmdbId))} onToggle={onToggle} onInfo={onInfo} />
          ))}
        </div>
        {!edges.end && (
          <button type="button" className={`${styles.arrow} ${styles.arrowRight}`} onClick={() => page(1)} aria-label="Avanti">
            <ChevronRight size={26} />
          </button>
        )}
      </div>
    </section>
  );
}
