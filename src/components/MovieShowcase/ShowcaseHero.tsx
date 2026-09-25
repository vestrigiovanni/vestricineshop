import Image from 'next/image';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import { normalizeProjectionSpecs, projectionSpec } from '@/constants/projectionSpecs';
import { normalizeRating } from '@/utils/ratingUtils';
import MovieAwards from '../MovieAwards/MovieAwards';
import ShowtimeTable from './ShowtimeTable';
import { bookLabel, heroLanguage, languageLabel, mainAwardLabel, showtimeDays } from './heroData';
import type { GroupedMovie } from './MovieShowcase';
import styles from './ShowcaseHero.module.css';

interface ShowcaseHeroProps {
  movie: GroupedMovie;
  isOverviewExpanded: boolean;
  onToggleOverview: () => void;
  onBook: (subeventId: number) => void;
  onTrailer: () => void;
}

/**
 * Il film nell'hero: premio, logo (o titolo in Fraunces), dati, trama, orari
 * e prenotazione. Si rimonta a ogni cambio di film (`key` in MovieShowcase),
 * ed è la dissolvenza d'entrata a fare da passaggio.
 */
export default function ShowcaseHero({ movie, isOverviewExpanded, onToggleOverview, onBook, onTrailer }: ShowcaseHeroProps) {
  const lang = heroLanguage(movie.subevents, {
    language: movie.versionLanguage || '',
    subtitles: movie.subtitles || '',
  });
  const days = showtimeDays(movie.subevents, lang, movie.specs);
  const book = bookLabel(days);
  const award = mainAwardLabel(movie.awards);
  const rating = normalizeRating(movie.rating);
  const hasTrailer = !!(movie.trailerKey || (movie.trailerKeys && movie.trailerKeys.length > 0));

  // Come si proietta: solo ciò che vale per *tutti* gli spettacoli. Le
  // differenze fra una replica e l'altra stanno accanto al singolo orario.
  const specs = normalizeProjectionSpecs(movie.specs).map(code => projectionSpec(code)!.publicLabel);
  const facts = [
    movie.director || '',
    movie.release_year || '',
    movie.runtime && movie.runtime > 0 ? `${movie.runtime} min` : '',
    languageLabel(lang.language, lang.subtitles, movie.format),
    ...specs,
  ].filter(Boolean);

  return (
    <div className={styles.hero}>
      <div className={styles.main}>
        {award && <p className={styles.award}>● {award}</p>}

        {movie.logo_path ? (
          <h1 className={styles.logo}>
            <Image
              src={getTMDBImageUrl(movie.logo_path, 'w500')!}
              alt={movie.title}
              fill
              className={styles.logoImage}
              sizes="(max-width: 768px) 80vw, 420px"
              priority
            />
          </h1>
        ) : (
          <h1 className={styles.title}>{movie.title}</h1>
        )}

        <p className={styles.facts}>
          {facts.map((fact, i) => <span key={i}>{fact}</span>)}
          {rating !== 'T' && <span className={rating === '18+' ? styles.alarm : undefined}>{rating}</span>}
        </p>

        {movie.overview && (
          <div className={styles.overviewBlock}>
            <p className={isOverviewExpanded ? `${styles.overview} ${styles.expanded}` : styles.overview}>
              {movie.overview}
            </p>
            {isOverviewExpanded && movie.cast && movie.cast.length > 0 && (
              <p className={styles.cast}><span>Con</span>{movie.cast.join(', ')}</p>
            )}
            {movie.overview.length > 150 && (
              <button type="button" className={styles.more} onClick={onToggleOverview} aria-expanded={isOverviewExpanded}>
                {isOverviewExpanded ? 'Meno ↑' : 'Più ↓'}
              </button>
            )}
          </div>
        )}

        <ShowtimeTable days={days} title={movie.title} onPick={onBook} />

        <div className={styles.actions}>
          {book ? (
            <button type="button" className={styles.book} onClick={() => onBook(book.id)}>
              Prenota {book.label} →
            </button>
          ) : (
            <span className={styles.soldOutLabel}>Esaurito</span>
          )}
          {hasTrailer && (
            <button type="button" className={styles.trailer} onClick={onTrailer}>
              ▶ Trailer
            </button>
          )}
        </div>
      </div>

      {movie.awards && movie.awards.length > 0 && (
        <div className={styles.awards}>
          <MovieAwards awards={movie.awards} vertical />
        </div>
      )}
    </div>
  );
}
