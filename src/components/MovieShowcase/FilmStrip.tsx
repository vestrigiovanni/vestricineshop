import Image from 'next/image';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import type { GroupedMovie } from './MovieShowcase';
import styles from './FilmStrip.module.css';

interface FilmStripProps {
  movies: GroupedMovie[];
  activeId: number;
  onSelect: (movieId: number) => void;
}

/**
 * In fondo all'hero, per passare da un film all'altro. Prende il posto del
 * carosello "In Programmazione". Anche un film esaurito si può aprire: si
 * vede spento, ma trama e orari restano leggibili.
 */
export default function FilmStrip({ movies, activeId, onSelect }: FilmStripProps) {
  if (movies.length < 2) return null;
  const index = movies.findIndex(m => m.id === activeId);

  return (
    <div className={styles.strip}>
      <div className={styles.posters}>
        {movies.map((movie, i) => (
          <button
            key={movie.id}
            type="button"
            className={[
              styles.poster,
              movie.id === activeId ? styles.active : '',
              movie.isSoldOut ? styles.soldOut : '',
            ].filter(Boolean).join(' ')}
            aria-pressed={movie.id === activeId}
            aria-label={movie.isSoldOut ? `${movie.title}, esaurito` : movie.title}
            onClick={() => onSelect(movie.id)}
          >
            {movie.poster_path ? (
              <Image
                src={getTMDBImageUrl(movie.poster_path, 'w185')!}
                alt=""
                fill
                sizes="72px"
                className={styles.image}
                priority={i < 4}
              />
            ) : (
              <span className={styles.noPoster}>{movie.title}</span>
            )}
          </button>
        ))}
      </div>
      <p className={styles.count}>{index + 1} / {movies.length} in sala</p>
    </div>
  );
}
