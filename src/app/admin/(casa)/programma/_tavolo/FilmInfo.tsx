'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Play, Plus, X } from 'lucide-react';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import { type BrowserFilm, is4K, metaLine, useFilmCard } from './filmCard';
import { PosterCard } from './FilmShelf';
import styles from './FilmInfo.module.css';

interface Props {
  film: BrowserFilm;
  selected: Set<string>;
  onToggle: (film: BrowserFilm) => void;
  /** Apre la scheda di un altro film, da "dello stesso regista" o "simili". */
  onOpen: (film: BrowserFilm) => void;
  onClose: () => void;
}

const dateFmt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' });
const fmt = (iso: string | number) => dateFmt.format(new Date(iso));

/**
 * "Altre info", come su Netflix: l'immagine larga col logo del film, il
 * trailer a un clic, la trama, chi c'è. In più quello che serve a chi
 * programma: quando è già passato in sala, da quando è in libreria, e cos'altro
 * c'è dello stesso regista da affiancargli.
 */
export default function FilmInfo({ film, selected, onToggle, onOpen, onClose }: Props) {
  const card = useFilmCard(film.tmdbId);
  const [trailer, setTrailer] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const on = Boolean(film.tmdbId && selected.has(film.tmdbId));

  // Esc chiude prima il trailer, poi la scheda — e non il dialogo che c'è sotto.
  const state = useRef({ trailer, onClose });
  useEffect(() => {
    state.current = { trailer, onClose };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      if (state.current.trailer) setTrailer(null);
      else state.current.onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Cambiando film si torna in cima, e il trailer del precedente si ferma.
  useEffect(() => {
    panel.current?.scrollTo({ top: 0 });
    panel.current?.focus();
  }, [film.tmdbId]);
  const [shownFor, setShownFor] = useState(film.tmdbId);
  if (shownFor !== film.tmdbId) {
    setShownFor(film.tmdbId);
    setTrailer(null);
  }

  const backdrop = getTMDBImageUrl(card?.backdropPath, 'w1280');
  const logo = card?.logoPath ? getTMDBImageUrl(card.logoPath, 'w500') : null;
  const loading = card === undefined;
  const title = card?.title || film.title;
  const genres = card?.genres.length ? card.genres : film.genres;
  const directors = card?.directors.length ? card.directors.join(', ') : film.director;

  return (
    <div className={styles.backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} className={styles.panel} role="dialog" aria-modal="true" aria-label={`Scheda di ${title}`} tabIndex={-1}>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Chiudi la scheda">
          <X size={20} />
        </button>

        <div className={styles.top}>
          {trailer ? (
            <iframe
              className={styles.trailer}
              src={`https://www.youtube-nocookie.com/embed/${trailer}?autoplay=1&rel=0&modestbranding=1`}
              title={`Trailer di ${title}`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          ) : (
            <>
              {backdrop ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.topImg} src={backdrop} alt="" />
              ) : (
                <div className={styles.topImg} data-empty data-loading={loading || undefined} />
              )}
              <div className={styles.topShade} />
              <div className={styles.topBody}>
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={styles.logo} src={logo} alt={title} />
                ) : (
                  <h2 className={styles.title}>{title}</h2>
                )}
                <div className={styles.actions}>
                  <button type="button" className={styles.primary} data-on={on || undefined} onClick={() => onToggle(film)}>
                    {on ? <><Check size={18} strokeWidth={3} /> Scelto</> : <><Plus size={18} strokeWidth={3} /> Scegli per la sala</>}
                  </button>
                  {card?.trailerKey && (
                    <button type="button" className={styles.secondary} onClick={() => setTrailer(card.trailerKey)}>
                      <Play size={17} fill="currentColor" /> Trailer
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className={styles.body}>
          <div className={styles.main}>
            <p className={styles.meta}>
              <span>{metaLine({ ...film, year: card?.year ?? film.year, runtime: card?.runtime ?? film.runtime, voteAverage: card?.voteAverage ?? film.voteAverage })}</span>
              {is4K(film) && <span className={styles.badge}>4K</span>}
              {card?.awardLabels.length ? <span className={styles.badgeAmber}>Premiato</span> : null}
            </p>
            {(card?.tasteNote ?? film.tasteNote) && <p className={styles.taste}>{card?.tasteNote ?? film.tasteNote}</p>}
            {card?.tagline && <p className={styles.tagline}>{card.tagline}</p>}
            {loading ? (
              <div className={styles.lines}><span /><span /><span /></div>
            ) : (
              <p className={styles.overview}>{card?.overview || 'Nessuna trama disponibile.'}</p>
            )}
          </div>

          <dl className={styles.facts}>
            {directors && <Fact label="Regia">{directors}</Fact>}
            {card?.cast.length ? <Fact label="Con">{card.cast.slice(0, 5).map((c) => c.name).join(', ')}</Fact> : null}
            {genres.length > 0 && <Fact label="Generi">{genres.join(', ')}</Fact>}
            {card?.countries.length ? <Fact label="Paese">{card.countries.join(', ')}</Fact> : null}
            {card?.originalTitle && card.originalTitle !== title && <Fact label="Titolo originale">{card.originalTitle}</Fact>}
          </dl>
        </div>

        <section className={styles.sala}>
          <h3>In sala</h3>
          <ul>
            <li>
              {card
                ? card.history.count === 0
                  ? 'Mai programmato: sarebbe la prima volta.'
                  : `Programmato ${card.history.count} ${card.history.count === 1 ? 'volta' : 'volte'}${card.history.last ? `, l’ultima il ${fmt(card.history.last)}` : ''}.`
                : film.scheduledCount
                  ? `Programmato ${film.scheduledCount} ${film.scheduledCount === 1 ? 'volta' : 'volte'}.`
                  : 'Mai programmato.'}
            </li>
            {card?.history.next && <li className={styles.amber}>Già in calendario il {fmt(card.history.next)}.</li>}
            {card?.addedAt && <li>In libreria dal {fmt(card.addedAt)}.</li>}
            {card?.plexLibraries.length ? <li>Copia: {card.plexLibraries.join(' e ')}.</li> : null}
          </ul>
          {card?.awardLabels.length ? (
            <div className={styles.awards}>
              {card.awardLabels.slice(0, 8).map((a) => <span key={a}>{a}</span>)}
            </div>
          ) : null}
        </section>

        {card?.cast.length ? (
          <section className={styles.section}>
            <h3>Il cast</h3>
            <ul className={styles.cast}>
              {card.cast.map((c) => {
                const photo = getTMDBImageUrl(c.profilePath, 'w185');
                return (
                  <li key={`${c.name}-${c.character}`}>
                    <span className={styles.face}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {photo ? <img src={photo} alt="" loading="lazy" /> : <span>{initials(c.name)}</span>}
                    </span>
                    <span className={styles.castName}>{c.name}</span>
                    {c.character && <span className={styles.castRole}>{c.character}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {card?.related.byDirector.length ? (
          <Related
            title={`Altri film di ${card.related.director}`}
            films={card.related.byDirector}
            selected={selected}
            onToggle={onToggle}
            onOpen={onOpen}
          />
        ) : null}
        {card?.related.similar.length ? (
          <Related title="Da affiancargli" films={card.related.similar} selected={selected} onToggle={onToggle} onOpen={onOpen} />
        ) : null}
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Related({ title, films, selected, onToggle, onOpen }: {
  title: string;
  films: BrowserFilm[];
  selected: Set<string>;
  onToggle: (film: BrowserFilm) => void;
  onOpen: (film: BrowserFilm) => void;
}) {
  return (
    <section className={styles.section}>
      <h3>{title}</h3>
      <div className={styles.related}>
        {films.map((f) => (
          <PosterCard key={f.tmdbId ?? f.id} film={f} on={Boolean(f.tmdbId && selected.has(f.tmdbId))} onToggle={onToggle} onInfo={onOpen} />
        ))}
      </div>
    </section>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}
