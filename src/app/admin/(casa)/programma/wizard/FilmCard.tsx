'use client';

/**
 * La locandina cliccabile di un film, uguale ovunque compaia nel wizard —
 * nelle corsie del catalogo, nella griglia, nella scelta del film quando si
 * programma al contrario.
 */

import React from 'react';
import { Award, Check, Clapperboard, Star } from 'lucide-react';
import styles from './Programmazione.module.css';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import { runtimeOf, type CatalogItem } from './types';

interface Props {
  film: CatalogItem;
  selected: boolean;
  onClick: () => void;
  compact?: boolean;
}

export default function FilmCard({ film, selected, onClick, compact = false }: Props) {
  const poster = getTMDBImageUrl(film.posterPath, 'w342');
  const rt = runtimeOf(film);
  return (
    <button
      type="button"
      className={`${styles.filmCard} ${compact ? styles.filmCardCompact : ''} ${selected ? styles.filmCardSelected : ''}`}
      onClick={onClick}
      title={`${film.title}${film.director ? ` — ${film.director}` : ''}`}
    >
      <span className={styles.posterFrame}>
        {poster
          ? <img src={poster} alt="" loading="lazy" />
          : <span className={styles.posterFallback}><Clapperboard size={26} /></span>}
        {selected && <span className={styles.cardCheck}><Check size={26} strokeWidth={3} /></span>}
        {film.scheduledCount > 0 && <span className={styles.cardBadge}>in sala ×{film.scheduledCount}</span>}
        {film.awardLabels.length > 0 && (
          <span className={styles.cardAward} title={film.awardLabels.slice(0, 4).join(' · ')}>
            <Award size={11} /> {film.awardLabels.length}
          </span>
        )}
      </span>
      <span className={styles.cardTitle}>{film.title}</span>
      <span className={styles.cardMeta}>
        {film.year || '—'}{rt ? ` · ${rt}′` : ''}
        {film.voteAverage ? <> · <Star size={9} /> {film.voteAverage.toFixed(1)}</> : null}
      </span>
    </button>
  );
}
