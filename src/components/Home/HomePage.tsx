'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import BookingDrawer from '../BookingDrawer/BookingDrawer';
import { choicesFromShowcase } from '../BookingDrawer/showChoices';
import { buildProgramma, type Programma } from './programma';
import { BookContext, Film, Show, prefersMotion } from './shared';
import { Ambiente, LuceProvider } from './Luce';
import { useMotore } from './motore';
import { useLeggero } from './leggero';
import Barra from './Barra';
import Apertura from './Apertura';
import Oggi from './Oggi';
import Prossimi from './Prossimi';
import Trailer, { Silenzio } from './Trailer';
import Lontani from './Lontani';
import Tutto from './Tutto';
import './sala.css';
import base from './Home.module.css';

const fetcher = (url: string) => fetch(url).then(res => res.json());

interface Props {
  movies: Film[];
  /** L'istante usato dal server: la regia lo riusa, così la pagina idratata è identica. */
  nowIso: string;
  initialAvailability?: Record<number, boolean>;
  /** Da `?film=`: l'apertura mostra questo film. */
  initialMovieId?: number | null;
  /** Da `?subevent=`: la prenotazione parte già aperta. */
  initialSubeventId?: number | null;
}

/**
 * La home, rifatta il 26 ottobre 2026 con la skill scroll-craft (brief in
 * docs/scrollcraft/builds/vestri-sala/BRIEF.md). Una galleria che va dal film
 * più vicino al più lontano, calma all'inizio e intensa alla fine, in una
 * stanza buia che prende la luce del film che hai davanti.
 *
 * Il motore di scroll-craft (src/vendor/scrollcraft) fissa gli atti con
 * `position: sticky` e pubblica il loro progresso in `--sc-p`: lo scorrimento
 * resta quello del browser (il 19 ottobre Lenis, che lo rifaceva in
 * JavaScript, andava a scatti su Firefox).
 */
export default function HomePage({ movies, nowIso, initialAvailability, initialMovieId, initialSubeventId }: Props) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const root = useRef<HTMLDivElement>(null);
  const { data: availability } = useSWR<Record<string, boolean>>('/api/availability', fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
    fallbackData: initialAvailability,
  });

  // Esaurito resta esaurito: il dato dal vivo può solo aggiungere.
  const live: Film[] = useMemo(() => {
    if (!availability) return movies;
    return movies.map(m => ({
      ...m,
      subevents: m.subevents.map(se => ({ ...se, isSoldOut: se.isSoldOut || availability[se.id] === true || availability[String(se.id)] === true })),
    }));
  }, [movies, availability]);

  // La regia si fa sui film come arrivano dal server: la disponibilità dal vivo
  // cambia i Prenota, non la forma della pagina (il motore ha già misurato gli atti).
  const struttura = useMemo(() => {
    const p = buildProgramma(movies, now);
    if (!p || initialMovieId == null || p.primo.movie.id === initialMovieId) return p;
    // `?film=`: quel film apre la pagina e il primo passa in testa a "Oggi" (se non c'è già); gli altri restano dove sono.
    const scelto = p.film.find(x => x.movie.id === initialMovieId);
    const via = <T,>(xs: T[]) => xs.filter(x => x !== scelto);
    const oggi = p.oggi.includes(p.primo) ? via(p.oggi) : [p.primo, ...via(p.oggi)];
    return scelto ? { ...p, primo: scelto, oggi, prossimi: via(p.prossimi), lontani: via(p.lontani) } : p;
  }, [movies, now, initialMovieId]);
  const plan = useMemo(() => (struttura ? aggiorna(struttura, live) : null), [struttura, live]);

  const [booking, setBooking] = useState<{ subeventId: number; film: Film | null } | null>(() => {
    if (initialSubeventId == null) return null;
    return { subeventId: initialSubeventId, film: live.find(m => m.subevents.some(s => s.id === initialSubeventId)) || null };
  });
  const apri = useCallback((show: Show, film: Film) => setBooking({ subeventId: show.id, film }), []);

  // Ogni Prenota porta il suo film nell'apertura, con la scheda intera: da vicino
  // si torna su scorrendo, da lontano con uno stacco (il fondale risale dal nero).
  const [scelto, setScelto] = useState<{ film: Film; show: Show } | null>(null);
  const scegli = useCallback((show: Show, film: Film) => {
    setScelto({ film, show });
    const lontano = scrollY > innerHeight * 2.5;
    window.scrollTo({ top: 0, behavior: lontano || !prefersMotion() ? 'instant' : 'smooth' });
  }, []);
  const chiudi = useCallback(() => setScelto(null), []);
  useEffect(() => {
    if (!scelto || booking) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setScelto(null); };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [scelto, booking]);

  useMotore(root);
  useLeggero(root);

  if (!plan) {
    return <section className={base.home} style={{ minHeight: '70vh', display: 'grid', placeItems: 'center' }}><p className={base.logoTesto} style={{ fontSize: 40 }}>Nessun film in programmazione.</p></section>;
  }

  const film = booking?.film;
  // La scheda coi dati dal vivo (gli esauriti cambiano mentre la si guarda).
  const scheda = scelto && { film: live.find(m => m.id === scelto.film.id) || scelto.film, show: scelto.show };
  const choices = film ? choicesFromShowcase(film.subevents.filter(s => new Date(s.date) >= now)) : [];
  const filmLuce = plan.film.map(x => x.movie);

  return (
    <BookContext.Provider value={scegli}>
      <LuceProvider films={filmLuce} root={root}>
        <div ref={root} className={base.home}>
          <Ambiente films={filmLuce} />
          <h1 className={base.nascosto}>Vestri Cinema: i film in sala</h1>
          <Barra film={plan.film} now={now} />
          <div className={base.atti}>
            <Apertura film={plan.primo.movie} show={plan.primo.show} now={now} scheda={scheda} onApri={apri} onChiudi={chiudi} />
            {plan.oggi.length > 0 && <Oggi slots={plan.oggi} now={now} />}
            {plan.prossimi.length > 0 && <Prossimi slots={plan.prossimi} lontani={plan.lontani.length + (plan.trailer ? 1 : 0)} now={now} />}
            {plan.trailer && <Silenzio film={plan.trailer.slot.movie} />}
            {plan.trailer && <Trailer slot={plan.trailer.slot} trailerKey={plan.trailer.key} now={now} />}
            {plan.lontani.length > 0 && <Lontani slots={plan.lontani} now={now} />}
            <Tutto film={plan.film} giorni={plan.giorni} now={now} />
          </div>
        </div>
      </LuceProvider>
      <BookingDrawer
        isOpen={booking != null}
        onClose={() => setBooking(null)}
        subeventId={booking?.subeventId ?? null}
        movieTitle={film?.title}
        choices={choices}
        backdropPath={film?.backdrop_path}
      />
    </BookContext.Provider>
  );
}

/**
 * La stessa struttura coi dati dal vivo: ogni film e ogni spettacolo vengono
 * sostituiti dalla loro versione aggiornata (esauriti compresi).
 */
function aggiorna(p: Programma<Film>, live: Film[]): Programma<Film> {
  const filmDi = new Map(live.map(m => [m.id, m]));
  const slot = (x: { movie: Film; show: Show }) => {
    const movie = filmDi.get(x.movie.id) || x.movie;
    return { movie, show: movie.subevents.find(s => s.id === x.show.id) || x.show };
  };
  return {
    primo: slot(p.primo),
    oggi: p.oggi.map(slot),
    prossimi: p.prossimi.map(slot),
    trailer: p.trailer && { slot: slot(p.trailer.slot), key: p.trailer.key },
    lontani: p.lontani.map(slot),
    giorni: p.giorni.map(g => ({ dayKey: g.dayKey, slots: g.slots.map(slot) })),
    film: p.film.map(slot),
  };
}
