'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import BookingDrawer from '../BookingDrawer/BookingDrawer';
import { choicesFromShowcase } from '../BookingDrawer/showChoices';
import { buildHomePlan, giroFrom, HomePiece, Slot } from './regia';
import { BookContext, Film, Show, ScrollTrigger, SplitText, gsap, nextShow, prefersMotion, registraGsap, vaiA } from './shared';
import Apertura from './Apertura';
import Nastro from './Nastro';
import Cartellone from './Cartellone';
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

  const plan: HomePiece<Film>[] = useMemo(() => {
    const p = buildHomePlan(live, now);
    if (initialMovieId == null) return p;
    const film = live.find(m => m.id === initialMovieId);
    if (!film) return p;
    return p.map(piece => {
      if (piece.kind !== 'apertura') return piece;
      const primo: Slot<Film> = { movie: film, show: nextShow(film, now) };
      const resto = piece.giro.filter(x => x.movie.id !== film.id);
      return { kind: 'apertura', movie: film, show: primo.show, giro: giroFrom([primo, ...resto], primo) };
    });
  }, [live, now, initialMovieId]);

  const [booking, setBooking] = useState<{ subeventId: number; film: Film | null } | null>(() => {
    if (initialSubeventId == null) return null;
    return { subeventId: initialSubeventId, film: live.find(m => m.subevents.some(s => s.id === initialSubeventId)) || null };
  });
  const book = useCallback((show: Show, film: Film) => setBooking({ subeventId: show.id, film }), []);

  // Lo scorrimento resta quello del browser. Il 19 ottobre 2026 c'era Lenis,
  // che lo rifaceva in JavaScript fotogramma per fotogramma: su Firefox, con
  // trackpad ed estensioni vere, ogni intoppo del browser diventava uno scatto.
  // Lo scorrimento nativo invece gira fuori dal JavaScript e non si blocca.

  // I titoli di sezione salgono riga per riga, gli occhielli e le righe sotto li seguono.
  useEffect(() => {
    const el = root.current;
    if (!el || !prefersMotion()) return;
    registraGsap();
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('[data-split]').forEach(t => {
        SplitText.create(t, {
          type: 'lines',
          mask: 'lines',
          linesClass: 'riga',
          autoSplit: true,
          onSplit: self => gsap.from(self.lines, { yPercent: 108, duration: 1.4, stagger: 0.1, ease: 'expo.out', scrollTrigger: { trigger: t, start: 'top 88%', once: true } }),
        });
      });
      gsap.utils.toArray<HTMLElement>('[data-sale]').forEach(t =>
        gsap.from(t, { opacity: 0, y: 18, duration: 1.2, ease: 'expo.out', delay: 0.15, scrollTrigger: { trigger: t, start: 'top 92%', once: true } }));
    }, el);
    return () => ctx.revert();
  }, []);

  // Le immagini arrivano piano: ricalcola le misure dei pezzi fissati quando la pagina è carica.
  useEffect(() => {
    registraGsap();
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener('load', refresh);
    const t = setTimeout(refresh, 1500);
    document.fonts?.ready.then(refresh);
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
  const kinds = new Set(plan.map(p => p.kind));
  const voci = [
    kinds.has('oggi') && { pezzo: 'oggi', nome: 'Oggi' },
    kinds.has('cartellone') && { pezzo: 'cartellone', nome: 'I film', fino: kinds.has('conto') ? 'conto' : undefined },
    (kinds.has('onore') || kinds.has('parete')) && { pezzo: kinds.has('onore') ? 'onore' : 'parete', nome: 'Premi', fino: kinds.has('parete') ? 'parete' : undefined },
    kinds.has('settimana') && { pezzo: 'settimana', nome: 'Programma' },
  ].filter((v): v is Voce => !!v);

  return (
    <BookContext.Provider value={book}>
      <div ref={root} className={base.home}>
        {/* Ogni pezzo sta in un contenitore suo: GSAP, quando fissa un pezzo, lo
            sposta dentro un pin-spacer, e React deve poter inserire e togliere
            i fratelli senza cercarli dove non sono più. */}
        {plan.map(p => <div key={p.kind} data-pezzo={p.kind}><Pezzo piece={p} now={now} seguenti={seguenti} /></div>)}
        <Indice voci={voci} />
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

/**
 * L'indice: le quattro stanze della pagina in una capsula in basso. Compare
 * dopo l'apertura, segna dove si è e porta dove si vuole.
 */
interface Voce { pezzo: string; nome: string; fino?: string }

function Indice({ voci }: { voci: Voce[] }) {
  const [dopoApertura, setDopoApertura] = useState(false);
  const [inFondo, setInFondo] = useState(false);
  const [qui, setQui] = useState<string | null>(null);
  const visibile = dopoApertura && !inFondo;
  useEffect(() => {
    registraGsap();
    const trigger: ScrollTrigger[] = [];
    const apertura = document.querySelector('[data-pezzo="apertura"]');
    if (apertura) trigger.push(ScrollTrigger.create({ trigger: apertura, start: 'bottom 60%', onEnter: () => setDopoApertura(true), onLeaveBack: () => setDopoApertura(false) }));
    // Sul piede la capsula si ritira: lì ci sono già "Torna su" e il nome della sala.
    const piede = document.querySelector('footer');
    if (piede) trigger.push(ScrollTrigger.create({ trigger: piede, start: 'top bottom', onEnter: () => setInFondo(true), onLeaveBack: () => setInFondo(false) }));
    // Ogni voce vale dal suo pezzo alla fine del suo ultimo pezzo.
    voci.forEach(v => {
      const da = document.querySelector(`[data-pezzo="${v.pezzo}"]`);
      const a = v.fino ? document.querySelector(`[data-pezzo="${v.fino}"]`) : null;
      if (!da) return;
      trigger.push(ScrollTrigger.create({
        trigger: da,
        start: 'top 55%',
        endTrigger: a || da,
        end: 'bottom 55%',
        onToggle: self => setQui(q => (self.isActive ? v.pezzo : q === v.pezzo ? null : q)),
      }));
    });
    return () => trigger.forEach(t => t.kill());
  }, [voci.map(v => v.pezzo).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  if (voci.length < 2) return null;
  return (
    <nav className={base.indice} data-visibile={visibile} aria-label="Sezioni della pagina">
      {voci.map(v => (
        <a key={v.pezzo} href={`#${v.pezzo}`} aria-current={qui === v.pezzo ? 'true' : undefined} tabIndex={visibile ? undefined : -1}
          onClick={e => { e.preventDefault(); vaiA(`[data-pezzo="${v.pezzo}"]`); }}>
          {v.nome}
        </a>
      ))}
    </nav>
  );
}

function Pezzo({ piece: p, now, seguenti }: { piece: HomePiece<Film>; now: Date; seguenti: Slot<Film>[] }) {
  switch (p.kind) {
    case 'apertura': return <Apertura giro={p.giro} now={now} />;
    case 'nastro': return <Nastro films={p.movies} now={now} />;
    case 'oggi': return <Oggi dayKey={p.dayKey} slots={p.slots} now={now} />;
    case 'cartellone': return <Cartellone films={p.movies} now={now} />;
    case 'conto': return <Conto film={p.movie} show={p.show} seguenti={seguenti} now={now} />;
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
