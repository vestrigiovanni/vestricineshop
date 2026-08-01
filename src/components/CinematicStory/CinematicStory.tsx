'use client';

import { useEffect, useMemo, useRef, useState, ComponentProps, CSSProperties } from 'react';
import Image from 'next/image';
import { animate, motion, MotionValue, useInView, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import type { GroupedMovie } from '../MovieShowcase/MovieShowcase';
import WeeklyCinemaCalendar from '../WeeklyCinemaCalendar/WeeklyCinemaCalendar';
import RatingBadge from '../RatingBadge';
import { Clock } from 'lucide-react';
import { buildMood, buildStory, trimChaptersForPhone, FestivalGroup, SoireeItem, StoryStats, WeekendDay } from './storyBuilder';
import styles from './CinematicStory.module.css';

interface CinematicStoryProps {
  movies: GroupedMovie[];
  subEvents: ComponentProps<typeof WeeklyCinemaCalendar>['subEvents'];
  /** Cambia a ogni richiesta SSR: fa ruotare i film mostrati nei capitoli. */
  storySeed?: number;
}

const easeApple: [number, number, number, number] = [0.22, 1, 0.36, 1];

// Durata di ogni scena del palcoscenico d'apertura. Tenuta in sync con la
// barra di avanzamento (--soiree-duration in CinematicStory.module.css).
const SOIREE_DURATION_MS = 3800;

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

// Molla condivisa dai parallax su scroll: smorza il progresso grezzo dello
// scroll così il backdrop insegue morbido invece di saltellare col trackpad.
const parallaxSpring = { stiffness: 90, damping: 28, mass: 0.4 } as const;

/**
 * Il parallax legato allo scroll ricalcola una trasformazione per fotogramma
 * su ogni sezione presente nella pagina. Sul telefono il guadagno visivo è
 * minimo e il costo si sente tutto: lo teniamo dove c'è un mouse e uno
 * schermo grande. Parte attivo, così il desktop non cambia di una virgola.
 */
function useParallaxEnabled(reduced: boolean) {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (reduced) {
      setEnabled(false);
      return;
    }
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const query = window.matchMedia('(min-width: 769px) and (pointer: fine)');
    const apply = () => setEnabled(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [reduced]);

  return enabled;
}

/**
 * Il fondale in parallax, isolato in un componente a parte.
 *
 * `useScroll` con un target rimisura la posizione dell'elemento a ogni evento
 * di scorrimento: con una decina di sezioni in pagina sono altrettante letture
 * di layout per fotogramma. Tenendo gli hook qui dentro, quando il parallax è
 * spento il componente non viene montato e quel lavoro sparisce davvero,
 * invece di continuare a girare a vuoto.
 */
function StripeBackdropParallax({ containerRef, src, alt }: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  src: string;
  alt: string;
}) {
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start end', 'end start'] });
  const smooth = useSpring(scrollYProgress, parallaxSpring);
  // Corsa ampia: il backdrop viaggia dal fondo alla cima mentre la striscia
  // attraversa il viewport (il bleed extra sta in .stripeBg).
  const y = useTransform(smooth, [0, 1], ['-16%', '16%']);

  return (
    <motion.div className={styles.stripeBg} style={{ y }}>
      <Image src={src} alt={alt} fill sizes="100vw" style={{ objectFit: 'cover' }} />
    </motion.div>
  );
}

function Stripe({ movie, flip, backdropIndex, reduced, parallax }: {
  movie: GroupedMovie;
  flip: boolean;
  backdropIndex: number;
  reduced: boolean;
  parallax: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const extras = movie.extraBackdrops || [];
  const backdrop = extras[backdropIndex] || extras[0] || movie.backdrop_path;
  if (!backdrop) return null;

  const backdropSrc = getTMDBImageUrl(backdrop, 'w1280')!;

  return (
    <div ref={ref} className={styles.stripe} onClick={() => selectMovie(movie.id)}>
      {parallax ? (
        <StripeBackdropParallax containerRef={ref} src={backdropSrc} alt={movie.title} />
      ) : (
        <div className={styles.stripeBg}>
          <Image src={backdropSrc} alt={movie.title} fill sizes="100vw" style={{ objectFit: 'cover' }} />
        </div>
      )}
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

function FestivalChapter({ groups, reduced }: { groups: FestivalGroup[]; reduced: boolean }) {
  return (
    <section className={styles.festivalChapter}>
      <motion.span
        className={styles.chapterKicker}
        initial={reduced ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.8 }}
      >
        Dai festival alla nostra sala
      </motion.span>
      {groups.map(group => (
        <div key={group.festival.key} className={styles.festivalBlock}>
          <motion.div
            className={styles.festivalHeader}
            initial={reduced ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.8, ease: easeApple }}
          >
            <Image
              src={group.festival.logo}
              alt=""
              aria-hidden="true"
              width={Math.round(group.festival.logoWidth * 1.6)}
              height={Math.round(group.festival.logoHeight * 1.6)}
              className={styles.festivalLogo}
              unoptimized
            />
            <h3 className={styles.festivalName}>{group.festival.name}</h3>
          </motion.div>
          <div className={styles.festivalFilms}>
            {group.films.map((film, i) => (
              <motion.button
                key={film.movie.id}
                className={styles.festivalFilm}
                onClick={() => selectMovie(film.movie.id)}
                aria-label={`Vai a ${film.movie.title}`}
                initial={reduced ? false : { opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.7, delay: i * 0.08, ease: easeApple }}
              >
                <span className={styles.festivalPoster}>
                  {film.movie.poster_path && (
                    <Image
                      src={getTMDBImageUrl(film.movie.poster_path, 'w342')!}
                      alt={film.movie.title}
                      fill
                      sizes="(max-width: 768px) 40vw, 200px"
                      style={{ objectFit: 'cover' }}
                    />
                  )}
                </span>
                <span className={styles.festivalFilmTitle}>{film.movie.title}</span>
                <span className={styles.festivalAward}>{film.awardLabel}</span>
              </motion.button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

// Apertura: il palcoscenico delle serate. Un solo grande schermo full-bleed
// dove le prossime serate si alternano in regia: backdrop in dissolvenza con
// una lenta spinta in avanti, e per ogni film il suo metadato più
// sorprendente in corsivo serif (premio, classico, lingua originale…).
// Tutto a tempo, mai legato allo scroll: solo opacity e transform GPU.
function SoireeChapter({ items, reduced }: { items: SoireeItem[]; reduced: boolean }) {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { amount: 0.35 });

  // La regia cambia scena ogni 3,8 secondi (come la barra di avanzamento),
  // finché il palcoscenico è visibile. L'hover non ferma lo scorrimento.
  useEffect(() => {
    if (reduced || !inView || items.length < 2) return;
    const id = setInterval(() => setActive(a => (a + 1) % items.length), SOIREE_DURATION_MS);
    return () => clearInterval(id);
  }, [reduced, inView, items.length]);

  const item = items[Math.min(active, items.length - 1)];
  const movie = item.movie;

  const stageBackdrop = (m: GroupedMovie) => {
    // Terzo backdrop: le strisce narrative usano [0] e [1], il weekend [3].
    const extras = m.extraBackdrops || [];
    return extras[2] || extras[0] || m.backdrop_path;
  };

  // La riga sotto il gancio: regia, anno, genere — senza ripetere il gancio.
  const year = (movie.release_date || '').slice(0, 4);
  const byline = [
    movie.director && !item.hook.includes(movie.director) ? `di ${movie.director}` : '',
    year && !item.hook.includes(year) ? year : '',
    (movie.genres || [])[0] && !item.hook.includes((movie.genres || [])[0]) ? (movie.genres || [])[0] : '',
  ].filter(Boolean).join(' · ');

  return (
    <section
      ref={ref}
      className={styles.soireeStage}
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
      {items.map((it, i) => {
        const bg = stageBackdrop(it.movie);
        if (!bg) return null;
        return (
          <div
            key={`${it.dayKey}-${it.movie.id}`}
            className={`${styles.soireeBg} ${i === active ? styles.soireeBgActive : ''} ${reduced ? styles.soireeBgStill : ''}`}
            aria-hidden="true"
          >
            <Image
              src={getTMDBImageUrl(bg, 'w1280')!}
              alt=""
              fill
              sizes="100vw"
              style={{ objectFit: 'cover' }}
            />
          </div>
        );
      })}
      <div className={styles.soireeVignette} aria-hidden="true" />

      {/* key sulla scena: il blocco rientra in dissolvenza a ogni cambio */}
      <div key={`${item.dayKey}-${movie.id}`} className={styles.soireeContent}>
        <span className={styles.soireeDayLine}>
          {item.dayLabel}
          {item.dateLabel ? ` · ${item.dateLabel}` : ''}
        </span>
        {movie.logo_path ? (
          <Image
            src={getTMDBImageUrl(movie.logo_path, 'w500')!}
            alt={movie.title}
            width={340}
            height={140}
            className={styles.soireeLogo}
          />
        ) : (
          <span className={styles.soireeTitle}>{movie.title}</span>
        )}
        {item.hook && <p className={styles.soireeHook}>{item.hook}</p>}
        {byline && <span className={styles.soireeByline}>{byline}</span>}
        <span className={styles.soireeTimes}>
          <RatingBadge rating={movie.rating} size="xs" />
          {item.times.map(t => (
            <span
              key={t.time}
              className={`${styles.timeChip} ${t.isSoldOut ? styles.timeChipSoldOut : ''}`}
              title={t.isSoldOut ? 'Sold out' : undefined}
            >
              {t.time}
            </span>
          ))}
        </span>
      </div>

      {items.length > 1 && (
        <div className={styles.soireeTicks}>
          {items.map((it, i) => (
            <button
              key={`${it.dayKey}-${it.movie.id}`}
              className={`${styles.soireeTick} ${i === active ? styles.soireeTickActive : ''} ${reduced ? styles.soireeTickStill : ''}`}
              aria-label={`Mostra ${it.movie.title}, ${it.dayLabel.toLowerCase()}`}
              onClick={e => {
                e.stopPropagation();
                setActive(i);
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// Weekend come dittico di "schermi vivi": sabato e domenica sono due metà
// cinematografiche. I backdrop dei film del giorno si dissolvono uno
// nell'altro a tempo (come il Reveal, ma senza legami con lo scroll) con una
// lenta spinta in avanti; la filmstrip di mini-poster salta da un film
// all'altro. Solo opacity e transform via CSS: lo scroll resta libero.
function WeekendPanel({ day, reduced }: { day: WeekendDay; reduced: boolean }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });

  const shows = day.shows;
  const show = shows[Math.min(active, shows.length - 1)];

  // La regia cambia film ogni 5 secondi, ma solo quando il pannello è in
  // scena e il mouse non ci sta sopra (hover = l'utente sta guardando).
  useEffect(() => {
    if (reduced || paused || !inView || shows.length < 2) return;
    const id = setInterval(() => setActive(a => (a + 1) % shows.length), 5000);
    return () => clearInterval(id);
  }, [reduced, paused, inView, shows.length]);

  const movie = show.movie;
  const runtime = formatRuntime(movie.runtime);
  const genre = (movie.genres || [])[0];

  const panelBackdrop = (m: GroupedMovie) => {
    // Quarto backdrop: le strisce narrative usano [0] e [1], il palcoscenico [2].
    const extras = m.extraBackdrops || [];
    return extras[3] || extras[1] || m.backdrop_path;
  };

  return (
    <motion.div
      ref={ref}
      className={styles.weekendPanel}
      onClick={() => selectMovie(movie.id)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectMovie(movie.id);
        }
      }}
      initial={reduced ? false : { opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.9, ease: easeApple }}
    >
      {shows.map((s, i) => {
        const bg = panelBackdrop(s.movie);
        if (!bg) return null;
        return (
          <div
            key={s.movie.id}
            className={`${styles.weekendBackdrop} ${i === active ? styles.weekendBackdropActive : ''} ${reduced ? styles.weekendBackdropStill : ''}`}
            aria-hidden={i !== active}
          >
            <Image
              src={getTMDBImageUrl(bg, 'w1280')!}
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              style={{ objectFit: 'cover' }}
            />
          </div>
        );
      })}
      <div className={styles.weekendPanelShade} aria-hidden="true" />

      <header className={styles.weekendPanelHead}>
        <span className={styles.weekendPanelName}>{day.label}</span>
        <span className={styles.weekendPanelDate}>{day.dateLabel}</span>
      </header>

      <div className={styles.weekendPanelFoot}>
        {/* key sul film attivo: il blocco rientra in dissolvenza a ogni cambio */}
        <div key={movie.id} className={styles.weekendNow}>
          {movie.logo_path ? (
            <Image
              src={getTMDBImageUrl(movie.logo_path, 'w300')!}
              alt={movie.title}
              width={220}
              height={90}
              className={styles.weekendNowLogo}
            />
          ) : (
            <span className={styles.weekendNowTitle}>{movie.title}</span>
          )}
          <span className={styles.weekendNowMeta}>
            <RatingBadge rating={movie.rating} size="xs" />
            {runtime && (
              <span className={styles.metaChip}>
                <Clock size={11} strokeWidth={2.4} aria-hidden="true" />
                {runtime}
              </span>
            )}
            {genre && <span className={styles.metaChip}>{genre}</span>}
          </span>
          <span className={styles.weekendNowTimes}>
            {show.times.map(t => (
              <span
                key={t.time}
                className={`${styles.timeChip} ${t.isSoldOut ? styles.timeChipSoldOut : ''}`}
                title={t.isSoldOut ? 'Sold out' : (t.roomName || undefined)}
              >
                {t.time}
              </span>
            ))}
          </span>
        </div>

        {shows.length > 1 && (
          <div className={styles.weekendRail}>
            {shows.map((s, i) => (
              <button
                key={s.movie.id}
                className={`${styles.weekendRailItem} ${i === active ? styles.weekendRailActive : ''}`}
                aria-label={`Mostra ${s.movie.title}`}
                onClick={e => {
                  e.stopPropagation();
                  setActive(i);
                }}
                onMouseEnter={() => setActive(i)}
              >
                {s.movie.poster_path && (
                  <Image
                    src={getTMDBImageUrl(s.movie.poster_path, 'w185')!}
                    alt=""
                    fill
                    sizes="46px"
                    style={{ objectFit: 'cover' }}
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
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
          Sabato e domenica
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
      <div className={`${styles.weekendDuo} ${days.length === 1 ? styles.weekendDuoSingle : ''}`}>
        {days.map(day => (
          <WeekendPanel key={day.isoDate} day={day} reduced={reduced} />
        ))}
      </div>
    </section>
  );
}

function pickRevealBackdrop(movie: GroupedMovie): string | null {
  // Quinto backdrop: strisce usano [0]/[1], citazioni [2], weekend [3].
  const extras = movie.extraBackdrops || [];
  return extras[4] || extras[3] || extras[0] || movie.backdrop_path || null;
}

function RevealSlide({ movie, index, count, progress }: {
  movie: GroupedMovie;
  index: number;
  count: number;
  progress: MotionValue<number>;
}) {
  const start = index / count;
  const end = (index + 1) / count;
  const span = end - start;
  // Finestre di dissolvenza CENTRATE sui confini tra slide: mentre uno
  // svanisce il successivo sta già emergendo, la somma delle opacità resta
  // ~1 e lo schermo non passa mai dal nero. Il primo slide parte visibile,
  // l'ultimo resta visibile fino in fondo.
  const w = span * 0.18;
  const first = index === 0;
  const last = index === count - 1;

  const fadePts = first
    ? [0, end - w, end + w]
    : last
      ? [start - w, start + w, 1]
      : [start - w, start + w, end - w, end + w];
  const fadeVals = first ? [1, 1, 0] : last ? [0, 1, 1] : [0, 1, 1, 0];
  const opacity = useTransform(progress, fadePts, fadeVals);

  // Il logo emerge dal buio poco dopo il backdrop e svanisce poco prima.
  // Solo opacity: niente blur animato, che ricalcolato a ogni frame di
  // scroll costa troppo e rende la navigazione scattosa.
  const logoPts = first
    ? [0, end - w * 1.4, end + w * 0.2]
    : last
      ? [start - w * 0.2, start + w * 1.4, 1]
      : [start - w * 0.2, start + w * 1.4, end - w * 1.4, end + w * 0.2];
  const logoOpacity = useTransform(progress, logoPts, fadeVals);

  const scale = useTransform(progress, [Math.max(0, start - w), Math.min(1, end + w)], [1, 1.08]);
  const pointerEvents = useTransform(opacity, o => (o > 0.5 ? 'auto' : 'none'));

  const backdrop = pickRevealBackdrop(movie);
  if (!backdrop) return null;

  return (
    <motion.div
      className={styles.revealSlide}
      style={{ opacity, pointerEvents }}
      onClick={() => selectMovie(movie.id)}
    >
      <motion.div className={styles.revealBg} style={{ scale }}>
        <Image
          src={getTMDBImageUrl(backdrop, 'w1280')!}
          alt={movie.title}
          fill
          sizes="100vw"
          loading="eager"
          style={{ objectFit: 'cover' }}
        />
      </motion.div>
      <div className={styles.revealVignette} aria-hidden="true" />
      <motion.div className={styles.revealLogoWrap} style={{ opacity: logoOpacity }}>
        {movie.logo_path ? (
          <Image
            src={getTMDBImageUrl(movie.logo_path, 'w500')!}
            alt=""
            width={460}
            height={190}
            className={styles.revealLogo}
          />
        ) : (
          <span className={styles.revealTitle}>{movie.title}</span>
        )}
      </motion.div>
    </motion.div>
  );
}

function RevealChapter({ movies, reduced }: { movies: GroupedMovie[]; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });

  if (reduced) {
    // Reduced motion: una sola immagine statica con il logo visibile.
    const movie = movies[0];
    const backdrop = pickRevealBackdrop(movie);
    if (!backdrop) return null;
    return (
      <section className={styles.revealStatic} onClick={() => selectMovie(movie.id)}>
        <div className={styles.revealBg}>
          <Image
            src={getTMDBImageUrl(backdrop, 'w1280')!}
            alt={movie.title}
            fill
            sizes="100vw"
            style={{ objectFit: 'cover' }}
          />
        </div>
        <div className={styles.revealVignette} aria-hidden="true" />
        <div className={styles.revealLogoWrap}>
          {movie.logo_path ? (
            <Image
              src={getTMDBImageUrl(movie.logo_path, 'w500')!}
              alt=""
              width={460}
              height={190}
              className={styles.revealLogo}
            />
          ) : (
            <span className={styles.revealTitle}>{movie.title}</span>
          )}
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} className={styles.reveal} style={{ '--reveal-count': movies.length } as CSSProperties}>
      <div className={styles.revealSticky}>
        {movies.map((m, i) => (
          <RevealSlide key={m.id} movie={m} index={i} count={movies.length} progress={scrollYProgress} />
        ))}
      </div>
    </section>
  );
}

/** Le locandine di una colonna del mosaico: identiche con e senza parallax. */
function MosaicPosters({ col }: { col: GroupedMovie[] }) {
  return (
    <>
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
    </>
  );
}

/** Variante con le tre colonne a velocità diverse (solo desktop). */
function MosaicChapterParallax({ columns }: { columns: GroupedMovie[][] }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const ySlow = useTransform(scrollYProgress, [0, 1], [40, -40]);
  const yFast = useTransform(scrollYProgress, [0, 1], [120, -120]);
  const yMid = useTransform(scrollYProgress, [0, 1], [70, -70]);
  const speeds = [ySlow, yFast, yMid];

  return (
    <section ref={ref} className={styles.mosaic}>
      {columns.map((col, i) => (
        <motion.div key={i} className={styles.mosaicColumn} style={{ y: speeds[i] }}>
          <MosaicPosters col={col} />
        </motion.div>
      ))}
    </section>
  );
}

function MosaicChapter({ movies, parallax }: { movies: GroupedMovie[]; parallax: boolean }) {
  const columns: GroupedMovie[][] = [[], [], []];
  movies.forEach((m, i) => columns[i % 3].push(m));

  if (parallax) return <MosaicChapterParallax columns={columns} />;

  // Senza parallax niente hook di scorrimento: il mosaico è una griglia ferma
  // e il browser può saltarne del tutto il disegno quando è fuori schermo.
  return (
    <section className={`${styles.mosaic} ${styles.mosaicStatic}`}>
      {columns.map((col, i) => (
        <div key={i} className={styles.mosaicColumn}>
          <MosaicPosters col={col} />
        </div>
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

/** Siamo su uno schermo da telefono? Parte da `false`: il desktop non cambia. */
function useIsPhone() {
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(max-width: 768px)');
    const apply = () => setIsPhone(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  return isPhone;
}

export default function CinematicStory({ movies, subEvents, storySeed }: CinematicStoryProps) {
  const reduced = useReducedMotion() ?? false;
  const parallax = useParallaxEnabled(reduced);
  const isPhone = useIsPhone();

  // `buildStory` girava a ogni render — mescolava il catalogo e ricreava tutti
  // gli array dei capitoli, facendo ridisegnare l'intera storia a ogni minimo
  // cambio di stato. Ora si costruisce una volta sola.
  const chapters = useMemo(() => {
    const built = buildStory(movies, new Date(), storySeed);
    return isPhone ? trimChaptersForPhone(built) : built;
  }, [movies, storySeed, isPhone]);
  // Il "colore della settimana": la tinta d'accento della storia segue il
  // genere dominante del cartellone, così la home cambia con la programmazione.
  const mood = buildMood(movies);

  if (chapters.length === 0) {
    // Nessun film: mostriamo comunque il calendario, come faceva la home prima.
    return <WeeklyCinemaCalendar subEvents={subEvents} />;
  }

  return (
    <div className={styles.story} style={{ '--story-accent': mood.accent } as CSSProperties}>
      {chapters.map((chapter, i) => {
        switch (chapter.kind) {
          case 'quote':
            return <QuoteChapter key={i} movie={chapter.movie} text={chapter.text} reduced={reduced} />;
          case 'soirees':
            return <SoireeChapter key={i} items={chapter.items} reduced={reduced} />;
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
                    parallax={parallax}
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
          case 'reveal':
            return <RevealChapter key={i} movies={chapter.movies} reduced={reduced} />;
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
          case 'festival':
            return <FestivalChapter key={i} groups={chapter.groups} reduced={reduced} />;
          case 'mosaic':
            return <MosaicChapter key={i} movies={chapter.movies} parallax={parallax} />;
          case 'marquee':
            return <MarqueeChapter key={i} movies={chapter.movies} reduced={reduced} />;
        }
      })}
    </div>
  );
}
