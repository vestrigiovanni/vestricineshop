import Image from 'next/image';
import Link from 'next/link';
import { MovieItem, getTMDBImageUrl } from '@/services/tmdb.utils';
import { Calendar, Clock } from 'lucide-react';
import styles from './MovieCard.module.css';
import LanguageBadge from './LanguageBadge';
import RatingBadge from './RatingBadge';

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
              src={imageUrl!} 
              alt={`Locandina di ${movie.title}`} 
              fill
              className={styles.image}
              sizes="(max-width: 768px) 50vw, 300px"
              loading="lazy"
            />
          ) : (
            <div className={styles.placeholder}>
              <span>{movie.title}</span>
            </div>
          )}

          {isSoldOut && (
            <div className={styles.soldOutOverlay}>
              <div className={styles.soldOutLabel}>ESAURITO</div>
            </div>
          )}
        </div>

        {/* 🍱 Bento Box Content for Mobile, standard for desktop */}
        <div className={styles.content}>
          <div className={styles.bentoGrid}>
            <div className={styles.bentoTitle}>
              <h3 className={styles.title}>{movie.title}</h3>
            </div>
            
            <div className={styles.bentoMeta}>
              {movie.date && (
                <div className={styles.metaItem}>
                  <Clock size={14} className={styles.icon} />
                  <span>{new Date(movie.date).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}
              {!movie.date && movie.runtime && (
                <div className={styles.metaItem}>
                  <Clock size={14} className={styles.icon} />
                  <span>{movie.runtime} min</span>
                </div>
              )}
              <div className={styles.metaItem}>
                <Calendar size={14} className={styles.icon} />
                <span>{movie.release_date?.split('-')[0]}</span>
              </div>
            </div>

            <div className={styles.bentoBadges}>
              <div className={styles.badgeWrapper}>
                <RatingBadge rating={movie.rating || 'T'} size="xs" />
                <LanguageBadge 
                  language={movie.versionLanguage || 'ITA'} 
                  subtitles={movie.subtitles || 'NESSUNO'} 
                  size="xs"
                />
              </div>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
