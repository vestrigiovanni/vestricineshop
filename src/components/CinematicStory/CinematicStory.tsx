'use client';

import { useEffect, useRef, ComponentProps } from 'react';
import Image from 'next/image';
import { animate, motion, useInView, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import type { GroupedMovie } from '../MovieShowcase/MovieShowcase';
import WeeklyCinemaCalendar from '../WeeklyCinemaCalendar/WeeklyCinemaCalendar';
import { getFestivalConfig } from '../MovieAwards/MovieAwards';
import RatingBadge from '../RatingBadge';
import { Clock } from 'lucide-react';
import { buildStory, StoryStats, WeekendDay, WeekendShow } from './storyBuilder';
import styles from './CinematicStory.module.css';

interface CinematicStoryProps {
  movies: GroupedMovie[];
  subEvents: ComponentProps<typeof WeeklyCinemaCalendar>['subEvents'];
  /** Cambia a ogni richiesta SSR: fa ruotare i film mostrati nei capitoli. */
  storySeed?: number;
}

const easeApple: [number, number, number, number] = [0.22, 1, 0.36, 1];

// Riporta l'utente alla hero con il film selezionato: MovieShowcase ascolta
// questo evento e invoca la stessa logica del click sui poster in galleria.
function selectMovie(movieId: number) {
  window.dispatchEvent(new CustomEvent('vestri:select-movie', { detail: { movieId } }));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function formatRuntime(min?: number | null): string | null {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Metadati visuali del film: classificazione, anno, durata e chip dei generi.
function MetaRow({ movie, compact = false }: { movie: GroupedMovie; compact?: boolean }) {
  const year = movie.release_date ? movie.release_date.slice(0, 4) : null;
  const runtime = formatRuntime(movie.runtime);
  const genres = (movie.genres || []).slice(0, compact ? 1 : 3);
  return (
    <span className={`${styles.metaRow} ${compact ? styles.metaRowCompact : ''}`}>
      <RatingBadge rating={movie.rating} size="xs" />
      {year && <span className={styles.metaChip}>{year}</span>}
      {runtime && (
        <span className={styles.metaChip}>
          <Clock size={11} strokeWidth={2.4} aria-hidden="true" />
          {runtime}
        </span>
      )}
      {genres.map(g => (
        <span key={g} className={`${styles.metaChip} ${styles.genreChip}`}>{g}</span>
      ))}
    </span>
  );
}

function QuoteChapter({ movie, text, reduced }: { movie: GroupedMovie; text: string; reduced: boolean }) {
  // Terzo backdrop alternativo: mai usato da hero (principale) né dalle strisce ([0] e [1]).
  const extras = movie.extraBackdrops || [];
  const bg = extras[2] || extras[1] || movie.backdrop_path;
  return (
    <section className={styles.quoteChapter}>
      {bg && (
        <motion.div
          className={styles.quoteBg}
          aria-hidden="true"
          initial={reduced ? false : { opacity: 0, scale: 1.07 }}
          whileInView={{ opacity: 0.42, scale: 1 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 1.6, ease: easeApple }}
        >
          <Image
            src={getTMDBImageUrl(bg, 'w1280')!}
            alt=""
            fill
            sizes="100vw"
            style={{ objectFit: 'cover' }}
          />
        </motion.div>
      )}
      <div className={styles.quoteVignette} aria-hidden="true" />
      <motion.blockquote
        className={styles.quoteText}
        onClick={() => selectMovie(movie.id)}
        initial={reduced ? false : { opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 1, delay: 0.35, ease: easeApple }}
      >
        {text}
      </motion.blockquote>
      <motion.p
        className={styles.quoteMovie}
        initial={reduced ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.8, delay: 0.7 }}
      >
        {movie.title}{movie.director ? ` — di ${movie.director}` : ''}
      </motion.p>
    </section>
  );
}

function Stripe({ movie, flip, backdropIndex, reduced }: {
  movie: GroupedMovie;
  flip: boolean;
  backdropIndex: number;
  reduced: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['-8%', '8%']);

  const extras = movie.extraBackdrops || [];
  const backdrop = extras[backdropIndex] || extras[0] || movie.backdrop_path;
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
        <div className={`${styles.stripeInfo} ${flip ? styles.stripeInfoFlip : ''}`}>
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
          {movie.director && <span className={styles.stripeDirector}>un film di {movie.director}</span>}
        </div>
      </motion.div>
    </div>
  );
}

// Contatore animato che parte quando entra nel viewport.
function CountUp({ to, reduced }: { to: number; reduced: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.8 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      el.textContent = String(to);
      return;
    }
    if (!inView) return;
    const controls = animate(0, to, {
      duration: 1.4,
      ease: easeApple,
      onUpdate: v => { el.textContent = String(Math.round(v)); },
    });
    return () => controls.stop();
  }, [inView, to, reduced]);

  return <span ref={ref}>{reduced ? to : 0}</span>;
}

function StatsChapter({ stats, reduced }: { stats: StoryStats; reduced: boolean }) {
  const tiles = [
    { value: stats.filmCount, label: stats.filmCount === 1 ? 'film in sala' : 'film in sala' },
    { value: stats.totalHours, label: 'ore di grande schermo' },
    { value: stats.projectionsCount, label: 'proiezioni in programma' },
    { value: stats.awardsCount, label: 'premi e riconoscimenti' },
    { value: stats.genresCount, label: 'generi diversi' },
  ].filter(t => t.value > 0);

  if (tiles.length === 0) return null;

  return (
    <section className={styles.statsChapter}>
      <motion.span
        className={styles.chapterKicker}
        initial={reduced ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.8 }}
      >
        La programmazione in numeri
      </motion.span>
      <div className={styles.statsGrid}>
        {tiles.map((t, i) => (
          <motion.div
            key={t.label}
            className={styles.statTile}
            initial={reduced ? false : { opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.7, delay: i * 0.1, ease: easeApple }}
          >
            <span className={styles.statValue}><CountUp to={t.value} reduced={reduced} /></span>
            <span className={styles.statLabel}>{t.label}</span>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function LogoWallChapter({ movies, reduced }: { movies: GroupedMovie[]; reduced: boolean }) {
  return (
    <section className={styles.logoWall}>
      {movies.map((m, i) => (
        <motion.button
          key={m.id}
          className={styles.logoCell}
          onClick={() => selectMovie(m.id)}
          aria-label={`Vai a ${m.title}`}
          initial={reduced ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, delay: (i % 4) * 0.08, ease: easeApple }}
        >
          <Image
            src={getTMDBImageUrl(m.logo_path!, 'w300')!}
            alt={m.title}
            width={220}
            height={90}
            className={styles.logoImg}
          />
        </motion.button>
      ))}
    </section>
  );
}

function AwardsChapter({ movies, reduced }: { movies: GroupedMovie[]; reduced: boolean }) {
  return (
    <section className={styles.awardsChapter}>
      <motion.span
        className={styles.chapterKicker}
        initial={reduced ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.8 }}
      >
        Dai festival alla nostra sala
      </motion.span>
      <motion.h2
        className={styles.awardsTitle}
        initial={reduced ? false : { opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.8, delay: 0.1, ease: easeApple }}
      >
        Premiati e riconosciuti.
      </motion.h2>
      <div className={styles.awardsGrid}>
        {movies.map((m, i) => {
          const shown = (m.awards || []).slice(0, 3);
          const extra = (m.awards?.length || 0) - shown.length;
          // Un logo per festival, senza ripetizioni anche con più premi dallo stesso.
          const festivalLogos = Array.from(
            new Map(
              (m.awards || []).map(a => {
                const config = getFestivalConfig(a.type);
                return [config.src, config] as const;
              })
            ).values()
          ).slice(0, 4);
          return (
            <motion.article
              key={m.id}
              className={styles.awardCard}
              onClick={() => selectMovie(m.id)}
              initial={reduced ? false : { opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.7, delay: i * 0.12, ease: easeApple }}
            >
              <div className={styles.awardLogos}>
                {festivalLogos.map(c => (
                  <Image
                    key={c.src}
                    src={c.src}
                    alt=""
                    aria-hidden="true"
                    width={c.width}
                    height={c.height}
                    className={styles.awardLogoImg}
                    unoptimized
                  />
                ))}
              </div>
              <h3 className={styles.awardFilmTitle}>{m.title}</h3>
              <MetaRow movie={m} />
              <ul className={styles.awardList}>
                {shown.map((a, j) => (
                  <li key={j}>
                    <span className={styles.awardItemLabel}>
                      {a.label}{a.year ? ` · ${a.year}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
              {extra > 0 && <span className={styles.awardMore}>e altri {extra} riconoscimenti</span>}
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}

function WeekendStrip({ show, reduced }: { show: WeekendShow; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['-8%', '8%']);

  const movie = show.movie;
  // Quarto backdrop: le strisce narrative usano [0] e [1], le citazioni [2].
  const extras = movie.extraBackdrops || [];
  const backdrop = extras[3] || extras[0] || movie.backdrop_path;
  const runtime = formatRuntime(movie.runtime);

  return (
    <div
      ref={ref}
      className={styles.weekendStrip}
      onClick={() => selectMovie(movie.id)}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectMovie(movie.id);
        }
      }}
    >
      {backdrop && (
        <motion.div className={styles.stripeBg} style={reduced ? undefined : { y }}>
          <Image
            src={getTMDBImageUrl(backdrop, 'w1280')!}
            alt={movie.title}
            fill
            sizes="100vw"
            style={{ objectFit: 'cover' }}
          />
        </motion.div>
      )}
      <div className={styles.weekendStripShade} />
      <motion.div
        className={styles.weekendStripContent}
        initial={reduced ? false : { opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.8, ease: easeApple }}
      >
        {movie.logo_path ? (
          <Image
            src={getTMDBImageUrl(movie.logo_path, 'w500')!}
            alt={movie.title}
            width={340}
            height={140}
            className={styles.weekendLogo}
          />
        ) : (
          <span className={styles.weekendStripTitle}>{movie.title}</span>
        )}
        <div className={styles.weekendMeta}>
          <RatingBadge rating={movie.rating} size="xs" />
          {runtime && (
            <span className={styles.metaChip}>
              <Clock size={11} strokeWidth={2.4} aria-hidden="true" />
              {runtime}
            </span>
          )}
        </div>
        <div className={styles.weekendTimes}>
          {show.times.map(t => (
            <span
              key={t.time}
              className={`${styles.weekendTimeChip} ${t.isSoldOut ? styles.timeChipSoldOut : ''}`}
              title={t.isSoldOut ? 'Sold out' : (t.roomName || undefined)}
            >
              {t.time}
            </span>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function WeekendChapter({ days, reduced }: { days: WeekendDay[]; reduced: boolean }) {
  return (
    <section className={styles.weekendChapter}>
      <div className={styles.weekendIntro}>
        <motion.span
          className={styles.chapterKicker}
          initial={reduced ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.8 }}
        >
          Venerdì, sabato e domenica
        </motion.span>
        <motion.h2
          className={styles.weekendTitle}
          initial={reduced ? false : { opacity: 0, y: 30, filter: 'blur(6px)' }}
          whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.9, delay: 0.1, ease: easeApple }}
        >
          Questo weekend al cinema.
        </motion.h2>
      </div>
      {days.map(day => (
        <div key={day.isoDate} className={styles.weekendDayBlock}>
          <motion.header
            className={styles.weekendDayHeader}
            initial={reduced ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.7, ease: easeApple }}
          >
            <span className={styles.weekendDayDate}>{day.dateLabel}</span>
            <span className={styles.weekendDayName}>{day.label}</span>
          </motion.header>
          <div className={styles.weekendStrips}>
            {day.shows.map(show => (
              <WeekendStrip key={show.movie.id} show={show} reduced={reduced} />
            ))}
          </div>
        </div>
      ))}
    </section>
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
              <span className={styles.posterOverlay} aria-hidden="true">
                <span className={styles.posterOverlayTitle}>{m.title}</span>
                <span className={styles.posterOverlayMeta}>
                  {[m.release_date?.slice(0, 4), (m.genres || [])[0]].filter(Boolean).join(' · ')}
                </span>
              </span>
            </button>
          ))}
        </motion.div>
      ))}
    </section>
  );
}

function MarqueeRow({ movies, reverse, reduced }: { movies: GroupedMovie[]; reverse: boolean; reduced: boolean }) {
  const items = reduced ? movies : [...movies, ...movies];
  return (
    <div className={styles.marqueeViewport}>
      <div
        className={`${styles.marqueeTrack} ${reverse ? styles.marqueeReverse : ''} ${reduced ? styles.marqueeStatic : ''}`}
      >
        {items.map((m, i) => (
          <button
            key={`${m.id}-${i}`}
            className={styles.marqueeItem}
            onClick={() => selectMovie(m.id)}
            aria-label={`Vai a ${m.title}`}
            tabIndex={i >= movies.length ? -1 : 0}
          >
            <Image
              src={getTMDBImageUrl(m.poster_path, 'w342')!}
              alt={i >= movies.length ? '' : m.title}
              fill
              sizes="190px"
              style={{ objectFit: 'cover' }}
            />
            <span className={styles.posterOverlay} aria-hidden="true">
              <span className={styles.posterOverlayTitle}>{m.title}</span>
              <span className={styles.posterOverlayMeta}>
                {[m.release_date?.slice(0, 4), (m.genres || [])[0]].filter(Boolean).join(' · ')}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MarqueeChapter({ movies, reduced }: { movies: GroupedMovie[]; reduced: boolean }) {
  const mid = Math.ceil(movies.length / 2);
  const rowB = [...movies.slice(mid), ...movies.slice(0, mid)];
  return (
    <section className={styles.marqueeChapter}>
      <MarqueeRow movies={movies} reverse={false} reduced={reduced} />
      <MarqueeRow movies={rowB} reverse reduced={reduced} />
    </section>
  );
}

export default function CinematicStory({ movies, subEvents, storySeed }: CinematicStoryProps) {
  const reduced = useReducedMotion() ?? false;
  const chapters = buildStory(movies, new Date(), storySeed);

  if (chapters.length === 0) {
    // Nessun film: mostriamo comunque il calendario, come faceva la home prima.
    return <WeeklyCinemaCalendar subEvents={subEvents} />;
  }

  return (
    <div className={styles.story}>
      {chapters.map((chapter, i) => {
        switch (chapter.kind) {
          case 'quote':
            return <QuoteChapter key={i} movie={chapter.movie} text={chapter.text} reduced={reduced} />;
          case 'stripes':
            return (
              <section key={i} className={styles.stripes}>
                {chapter.movies.map((m, j) => (
                  <Stripe
                    key={m.id}
                    movie={m}
                    flip={j % 2 === 1}
                    backdropIndex={chapter.backdropIndex}
                    reduced={reduced}
                  />
                ))}
              </section>
            );
          case 'stats':
            return <StatsChapter key={i} stats={chapter.stats} reduced={reduced} />;
          case 'logos':
            return <LogoWallChapter key={i} movies={chapter.movies} reduced={reduced} />;
          case 'weekend':
            return <WeekendChapter key={i} days={chapter.days} reduced={reduced} />;
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
          case 'awards':
            return <AwardsChapter key={i} movies={chapter.movies} reduced={reduced} />;
          case 'mosaic':
            return <MosaicChapter key={i} movies={chapter.movies} reduced={reduced} />;
          case 'marquee':
            return <MarqueeChapter key={i} movies={chapter.movies} reduced={reduced} />;
        }
      })}
    </div>
  );
}
