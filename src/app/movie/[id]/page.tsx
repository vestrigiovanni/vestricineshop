import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { getTMDBImageUrl } from '@/services/tmdb';
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
  
  const movie = await prisma.movieOverride.findUnique({
    where: { tmdbId: id }
  });

  if (!movie) {
    notFound();
  }

  const subeventId = subevent ? parseInt(subevent, 10) : undefined;

  const backdropUrl = movie.customBackdropPath && movie.customBackdropPath.startsWith('/')
    ? getTMDBImageUrl(movie.customBackdropPath, 'original')
    : movie.customBackdropPath || '';
    
  const posterUrl = movie.customPosterPath && movie.customPosterPath.startsWith('/')
    ? getTMDBImageUrl(movie.customPosterPath, 'w500')
    : movie.customPosterPath || '';

  const director = movie.customDirector || '';
  const cast = movie.customCast || '';
  const title = movie.customTitle || 'Senza Titolo';
  const overview = movie.customOverview || 'Trama non disponibile.';
  const rating = movie.customRating || 'T';

  return (
    <main className={styles.main}>
      <div className={styles.backdropContainer}>
        {backdropUrl && (
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
            {posterUrl ? (
              <Image
                src={posterUrl!}
                alt={`Locandina di ${title}`}
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
            <h1 className={styles.title}>{title}</h1>
            
            <div className={styles.metadata}>
              <div className={styles.tagGroup}>
                <span className={styles.tag}><Calendar size={18} /> {(movie as any).releaseDate ? (movie as any).releaseDate.split('-')[0] : 'N/D'}</span>
                <span className={styles.tag}><Clock size={18} /> {(movie as any).runtime || 'N/D'} min</span>
                <RatingBadge rating={rating} size="md" />
                <span className={styles.tag}><MapPin size={18} /> Cinema Vestri</span>
              </div>
            </div>

            <p className={styles.overview}>{overview}</p>

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
