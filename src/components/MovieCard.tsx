import Image from 'next/image';
import Link from 'next/link';
import { MovieItem, getTMDBImageUrl } from '@/services/tmdb';
import { Calendar, Clock } from 'lucide-react';
import styles from './MovieCard.module.css';


interface MovieCardProps {
  movie: any; // Allow for extended movie object with isSoldOut
}

export default function MovieCard({ movie }: MovieCardProps) {
  const imageUrl = getTMDBImageUrl(movie.poster_path, 'w500');
  const isSoldOut = movie.isSoldOut;

  return (
    <div className={`${styles.card} ${isSoldOut ? styles.soldOut : ''}`}>
      <Link 
        href={isSoldOut ? '#' : `/movie/${movie.id}`} 
        className={styles.link}
        onClick={(e) => isSoldOut && e.preventDefault()}
      >
        <div className={styles.imageContainer}>
          {movie.poster_path ? (
            <Image 
              src={imageUrl} 
              alt={`Locandina di ${movie.title}`} 
              fill
              className={styles.image}
              sizes="(max-width: 768px) 100vw, 300px"
            />
          ) : (
            <div className={styles.placeholder}>
              <span>{movie.title}</span>
            </div>
          )}

          {isSoldOut && (
            <>
              <div className={styles.soldOutBanner}>SOLD OUT</div>
              <div className={styles.soldOutLabel}>SOLDOUT</div>
            </>
          )}
        </div>
        <div className={styles.content}>
          <h3 className={styles.title}>{movie.title}</h3>
          <div className={styles.meta}>
            <span className={styles.metaItem}>
              <Calendar size={14} className={styles.icon} />
              {movie.release_date?.split('-')[0]}
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
