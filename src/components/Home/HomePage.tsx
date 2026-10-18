'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import BookingDrawer from '../BookingDrawer/BookingDrawer';
import { choicesFromShowcase } from '../BookingDrawer/showChoices';
import { buildHomePlan, HomePiece, Slot } from './regia';
import { BookContext, Film, Show, ScrollTrigger, nextShow, registraGsap } from './shared';
import Apertura from './Apertura';
import Conto from './Conto';
import { Oggi, Settimana } from './Programma';
import { Onore, Parete } from './Premi';
import { Pellicola, Giornata, Locandina, Barre, Iride, TrailerMuto, Doppio, Ventaglio, Sottotitoli } from './Pezzi';
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

export default function HomePage({ movies, nowIso, initialAvailability, initialMovieId, initialSubeventId }: Props) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
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

  const plan: HomePiece<Film>[] = useMemo(() => {
    const p = buildHomePlan(live, now);
    if (initialMovieId == null) return p;
    const film = live.find(m => m.id === initialMovieId);
    if (!film) return p;
    return p.map(piece => piece.kind === 'apertura' ? { kind: 'apertura', movie: film, show: nextShow(film, now) } : piece);
  }, [live, now, initialMovieId]);

  const [booking, setBooking] = useState<{ subeventId: number; film: Film | null } | null>(() => {
    if (initialSubeventId == null) return null;
    return { subeventId: initialSubeventId, film: live.find(m => m.subevents.some(s => s.id === initialSubeventId)) || null };
  });
  const book = useCallback((show: Show, film: Film) => setBooking({ subeventId: show.id, film }), []);

  // Le immagini arrivano piano: ricalcola le misure dei pezzi fissati quando la pagina è carica.
  useEffect(() => {
    registraGsap();
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener('load', refresh);
    const t = setTimeout(refresh, 1500);
    return () => { window.removeEventListener('load', refresh); clearTimeout(t); };
  }, []);

  if (!plan.length) {
    return <section className={base.home} style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}><p className={base.titoli} style={{ fontSize: 40 }}>Nessun film in programmazione</p></section>;
  }

  // Tutti gli spettacoli futuri, per il conto alla rovescia che passa al successivo.
  const settimana = plan.find(p => p.kind === 'settimana');
  const seguenti = settimana && settimana.kind === 'settimana' ? settimana.days.flatMap(d => d.slots) : [];
  const film = booking?.film;
  const choices = film ? choicesFromShowcase(film.subevents.filter(s => new Date(s.date) >= now)) : [];

  return (
    <BookContext.Provider value={book}>
      <div className={base.home}>
        {/* Ogni pezzo sta in un contenitore suo: GSAP, quando fissa un pezzo, lo
            sposta dentro un pin-spacer, e React deve poter inserire e togliere
            i fratelli senza cercarli dove non sono più. */}
        {plan.map(p => <div key={p.kind} data-pezzo={p.kind}><Pezzo piece={p} now={now} seguenti={seguenti} /></div>)}
      </div>
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

function Pezzo({ piece: p, now, seguenti }: { piece: HomePiece<Film>; now: Date; seguenti: Slot<Film>[] }) {
  switch (p.kind) {
    case 'apertura': return <Apertura film={p.movie} show={p.show} now={now} />;
    case 'oggi': return <Oggi dayKey={p.dayKey} slots={p.slots} now={now} />;
    case 'conto': return <Conto film={p.movie} show={p.show} seguenti={seguenti} />;
    case 'onore': return <Onore film={p.movie} award={p.award} now={now} />;
    case 'parete': return <Parete items={p.items} now={now} />;
    case 'pellicola': return <Pellicola films={p.movies} now={now} />;
    case 'giornata': return <Giornata dayKey={p.dayKey} slots={p.slots} now={now} />;
    case 'locandina': return <Locandina film={p.movie} now={now} />;
    case 'barre': return <Barre film={p.movie} now={now} />;
    case 'iride': return <Iride film={p.movie} now={now} />;
    case 'trailer': return <TrailerMuto film={p.movie} trailerKey={p.trailerKey} now={now} />;
    case 'doppio': return <Doppio a={p.a} b={p.b} />;
    case 'ventaglio': return <Ventaglio films={p.movies} now={now} />;
    case 'sottotitoli': return <Sottotitoli film={p.movie} show={p.show} />;
    case 'settimana': return <Settimana days={p.days} now={now} />;
  }
}
