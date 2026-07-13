'use client';

import { useRef, ComponentProps } from 'react';
import Image from 'next/image';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import type { GroupedMovie } from '../MovieShowcase/MovieShowcase';
import WeeklyCinemaCalendar from '../WeeklyCinemaCalendar/WeeklyCinemaCalendar';
import { buildStory } from './storyBuilder';
import styles from './CinematicStory.module.css';

interface CinematicStoryProps {
  movies: GroupedMovie[];
  subEvents: ComponentProps<typeof WeeklyCinemaCalendar>['subEvents'];
}

const easeApple: [number, number, number, number] = [0.22, 1, 0.36, 1];

// Riporta l'utente alla hero con il film selezionato: MovieShowcase ascolta
// questo evento e invoca la stessa logica del click sui poster in galleria.
function selectMovie(movieId: number) {
  window.dispatchEvent(new CustomEvent('vestri:select-movie', { detail: { movieId } }));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function TaglineChapter({ movie, reduced }: { movie: GroupedMovie; reduced: boolean }) {
  return (
    <section className={styles.taglineChapter}>
      <motion.blockquote
        className={styles.taglineText}
        onClick={() => selectMovie(movie.id)}
        initial={reduced ? false : { opacity: 0, y: 50, filter: 'blur(10px)' }}
        whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 1, ease: easeApple }}
      >
        {movie.tagline}
      </motion.blockquote>
      <motion.p
        className={styles.taglineMovie}
        initial={reduced ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.8, delay: 0.35 }}
      >
        {movie.title}
      </motion.p>
    </section>
  );
}

function Stripe({ movie, flip, reduced }: { movie: GroupedMovie; flip: boolean; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['-8%', '8%']);

  const backdrop = (movie.extraBackdrops && movie.extraBackdrops[0]) || movie.backdrop_path;
  if (!backdrop) return null;

  return (
    <div ref={ref} className={styles.stripe} onClick={() => selectMovie(movie.id)}>
      <motion.div className={styles.stripeBg} style={reduced ? undefined : { y }}>
        <Image
          src={getTMDBImageUrl(backdrop, 'w1280')!}
          alt={movie.title}
          fill
          sizes="100vw"
          style={{ objectFit: 'cover' }}
        />
      </motion.div>
      <div className={styles.stripeShade} />
      <motion.div
        className={`${styles.stripeContent} ${flip ? styles.stripeFlip : ''}`}
        initial={reduced ? false : { opacity: 0, x: flip ? 60 : -60 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.8, ease: easeApple }}
      >
        {movie.logo_path ? (
          <Image
            src={getTMDBImageUrl(movie.logo_path, 'w500')!}
            alt={movie.title}
            width={340}
            height={140}
            className={styles.stripeLogo}
          />
        ) : (
          <span className={styles.stripeTitle}>{movie.title}</span>
        )}
      </motion.div>
    </div>
  );
}

function MosaicChapter({ movies, reduced }: { movies: GroupedMovie[]; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const ySlow = useTransform(scrollYProgress, [0, 1], [40, -40]);
  const yFast = useTransform(scrollYProgress, [0, 1], [120, -120]);
  const yMid = useTransform(scrollYProgress, [0, 1], [70, -70]);
  const speeds = [ySlow, yFast, yMid];

  const columns: GroupedMovie[][] = [[], [], []];
  movies.forEach((m, i) => columns[i % 3].push(m));

  return (
    <section ref={ref} className={styles.mosaic}>
      {columns.map((col, i) => (
        <motion.div key={i} className={styles.mosaicColumn} style={reduced ? undefined : { y: speeds[i] }}>
          {col.map(m => (
            <button
              key={m.id}
              className={styles.mosaicPoster}
              onClick={() => selectMovie(m.id)}
              aria-label={`Vai a ${m.title}`}
            >
              <Image
                src={getTMDBImageUrl(m.poster_path, 'w342')!}
                alt={m.title}
                fill
                sizes="(max-width: 768px) 33vw, 260px"
                style={{ objectFit: 'cover' }}
              />
            </button>
          ))}
        </motion.div>
      ))}
    </section>
  );
}

function OutroChapter({ reduced }: { reduced: boolean }) {
  return (
    <section className={styles.outro}>
      <motion.p
        className={styles.outroText}
        initial={reduced ? false : { opacity: 0, scale: 0.92 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 1.1, ease: easeApple }}
      >
        Ti aspettiamo al cinema.
      </motion.p>
    </section>
  );
}

export default function CinematicStory({ movies, subEvents }: CinematicStoryProps) {
  const reduced = useReducedMotion() ?? false;
  const chapters = buildStory(movies);

  if (chapters.length === 0) {
    // Nessun film: mostriamo comunque il calendario, come faceva la home prima.
    return <WeeklyCinemaCalendar subEvents={subEvents} />;
  }

  return (
    <div className={styles.story}>
      {chapters.map((chapter, i) => {
        switch (chapter.kind) {
          case 'tagline':
            return <TaglineChapter key={i} movie={chapter.movie} reduced={reduced} />;
          case 'stripes':
            return (
              <section key={i} className={styles.stripes}>
                {chapter.movies.map((m, j) => (
                  <Stripe key={m.id} movie={m} flip={j % 2 === 1} reduced={reduced} />
                ))}
              </section>
            );
          case 'calendar':
            return (
              <motion.section
                key={i}
                className={styles.calendarChapter}
                initial={reduced ? false : { opacity: 0, y: 60 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.9, ease: easeApple }}
              >
                <WeeklyCinemaCalendar subEvents={subEvents} />
              </motion.section>
            );
          case 'mosaic':
            return <MosaicChapter key={i} movies={chapter.movies} reduced={reduced} />;
          case 'outro':
            return <OutroChapter key={i} reduced={reduced} />;
        }
      })}
    </div>
  );
}
