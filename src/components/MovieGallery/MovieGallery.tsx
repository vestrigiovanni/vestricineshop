import React from 'react';
import MovieCard from '../MovieCard';
import styles from './MovieGallery.module.css';
import { MovieItem } from '@/services/tmdb.utils';
import { Calendar, Clock } from 'lucide-react';

interface MovieGalleryProps {
  title: string;
  movies: (MovieItem & { subeventId: number; date: string })[];
}

export default function MovieGallery({ title, movies }: MovieGalleryProps) {
  if (movies.length === 0) return null;

  return (
    <section className={styles.section}>
      <h2 className={styles.galleryTitle}>{title}</h2>
      <div className={styles.galleryContainer}>
        <div className={styles.galleryScroll}>
          {movies.map((movie) => (
            <div key={`${movie.id}-${movie.subeventId}`} className={styles.cardWrapper}>
              <MovieCard movie={movie} />
              <div className={styles.dateLabel}>
                <Calendar size={14} className={styles.metaIcon} />
                <span>{new Date(movie.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</span>
                <Clock size={14} className={styles.metaIcon + ' ml-2'} />
                <span>{new Date(movie.date).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
