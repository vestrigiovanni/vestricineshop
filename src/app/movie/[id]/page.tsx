import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMovieDetails, getTMDBImageUrl, getItalianRating } from '@/services/tmdb';
import BookingFlow from '@/components/BookingFlow';
import RatingBadge from '@/components/RatingBadge';
import { Calendar, Clock, MapPin } from 'lucide-react';
import styles from './page.module.css';

export default async function MovieDetail({ 
  params,
  searchParams
}: { 
  params: Promise<{ id: string }>,
  searchParams: Promise<{ subevent?: string }>
}) {
  const { id } = await params;
  const { subevent } = await searchParams;
  const movie = await getMovieDetails(id);

  if (!movie) {
    notFound();
  }

  const subeventId = subevent ? parseInt(subevent, 10) : undefined;

  const backdropUrl = getTMDBImageUrl(movie.backdrop_path, 'original');
  const posterUrl = getTMDBImageUrl(movie.poster_path, 'w500');

  const director = movie.credits?.crew.find(person => person.job === 'Director')?.name;
  const cast = movie.credits?.cast.slice(0, 5).map(person => person.name).join(', ');

  return (
    <main className={styles.main}>
      <div className={styles.backdropContainer}>
        {movie.backdrop_path && (
          <>
            <Image
              src={backdropUrl!}
              alt=""
              fill
              className={styles.backdropImage}
              priority
              sizes="100vw"
            />
            <div className={styles.backdropGradient} />
          </>
        )}
      </div>

      <div className={`container ${styles.content}`}>
        <Link href="/" className={styles.backButton}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.icon}>
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          Indietro
        </Link>

        <div className={styles.grid}>
          <div className={styles.posterWrapper}>
            {movie.poster_path ? (
              <Image
                src={posterUrl!}
                alt={`Locandina di ${movie.title}`}
                fill
                className={styles.posterImage}
                sizes="(max-width: 768px) 100vw, 400px"
              />
            ) : (
              <div className={styles.posterPlaceholder}>
                <span>Nessuna locandina</span>
              </div>
            )}
          </div>

          <div className={styles.infoWrapper}>
            <h1 className={styles.title}>{movie.title}</h1>
            
            <div className={styles.metadata}>
              <div className={styles.tagGroup}>
                <span className={styles.tag}><Calendar size={18} /> {movie.release_date?.split('-')[0]}</span>
                {movie.runtime > 0 && <span className={styles.tag}><Clock size={18} /> {movie.runtime} min</span>}
                <RatingBadge rating={getItalianRating(movie)} size="md" />
                <span className={styles.tag}><MapPin size={18} /> Cinema Vestri</span>
              </div>
              <div className={styles.genres}>
                {movie.genres.map(g => (
                  <span key={g.id} className={styles.genreTag}>{g.name}</span>
                ))}
              </div>
            </div>

            <p className={styles.overview}>{movie.overview || 'Trama non disponibile.'}</p>

            <div className={styles.credits}>
              {director && (
                <div className={styles.creditItem}>
                  <span className={styles.creditLabel}>Regia:</span>
                  <span className={styles.creditValue}>{director}</span>
                </div>
              )}
              {cast && (
                <div className={styles.creditItem}>
                  <span className={styles.creditLabel}>Cast:</span>
                  <span className={styles.creditValue}>{cast}</span>
                </div>
              )}
            </div>

            <div className={styles.checkoutSection}>
              <BookingFlow subeventId={subeventId} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
