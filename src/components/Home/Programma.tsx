'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { Slot } from './regia';
import { Film, Show, FilmLogo, PrenotaButton, ScrollTrigger, Testata, dayLabel, dayLong, gsap, img, lingua, prefersMotion, runtime, sala, specs, time, useRegia } from './shared';
import { formatDayNumber, formatWeekdayShort } from '@/utils/cinemaDate';
import base from './Home.module.css';
import s from './Programma.module.css';

/**
 * Una riga di programma: l'ora grande, il logo del film al posto del titolo,
 * i dati, Prenota. Passandoci sopra, dietro la riga sale il fondale del film
 * (chiesto solo al primo passaggio).
 */
function Riga({ slot }: { slot: Slot<Film> }) {
  const { movie: f, show } = slot as { movie: Film; show: Show };
  const [vista, setVista] = useState(false);
  const dati = [f.director, f.release_year, runtime(f.runtime), lingua(show), ...specs(show), sala(show)].filter(Boolean).join(' · ');
  const accendi = () => setVista(true);
  return (
    <li className={s.riga} data-riga data-esaurito={show.isSoldOut || undefined} onPointerEnter={accendi} onFocus={accendi}>
      <span className={s.rigaFondo} aria-hidden>
        {vista && f.backdrop_path && <Image src={img(f.backdrop_path, 'w780')} alt="" fill sizes="60vw" style={{ objectFit: 'cover', objectPosition: '50% 35%' }} />}
      </span>
      <span className={`${base.titoli} ${s.ora}`}>{time(show.date)}</span>
      <span className={s.logo}><FilmLogo film={f} className={s.logoImg} sizes="260px" /></span>
      <span className={`${base.dati} ${s.dati}`}>{dati}</span>
      <span className={s.azione}><PrenotaButton show={show} film={f} /></span>
    </li>
  );
}

/** Oggi: gli spettacoli del primo giorno con qualcosa in sala. */
export function Oggi({ dayKey, slots, now }: { dayKey: string; slots: Slot<Film>[]; now: Date }) {
  const root = useRef<HTMLElement>(null);
  const label = dayLabel(slots[0].show.date, now);
  const liberi = slots.filter(x => !x.show.isSoldOut).length;
  useRegia(root, () => {
    gsap.from('[data-riga]', { opacity: 0, y: 36, duration: 1.1, stagger: 0.08, ease: 'expo.out', scrollTrigger: { trigger: '[data-riga]', start: 'top 88%' } });
  });
  return (
    <section ref={root} id="oggi" className={s.blocco} aria-labelledby="oggi-titolo" data-giorno={dayKey}>
      <Testata
        id="oggi-titolo"
        occhiello={label === 'Oggi' ? dayLong(slots[0].show.date) : 'Il primo giorno in sala'}
        destra={<span className={base.dati}>{slots.length} spettacoli{liberi < slots.length ? ` · ${liberi} prenotabili` : ''}</span>}
      >
        {label === 'Oggi' ? 'Oggi in sala' : dayLong(slots[0].show.date)}
      </Testata>
      <ol className={s.lista}>{slots.map(sl => <Riga key={sl.show.id} slot={sl} />)}</ol>
    </section>
  );
}

/**
 * Il programma: un giorno alla volta, scelto dalla fila delle date. La fila
 * resta in alto mentre si scorre la lista. Da qui si prenota tutto.
 */
export function Settimana({ days, now }: { days: { dayKey: string; slots: Slot<Film>[] }[]; now: Date }) {
  const root = useRef<HTMLElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const date = useRef<HTMLDivElement>(null);
  const [scelto, setScelto] = useState(0);
  const cambiato = useRef(false);
  const giorno = days[Math.min(scelto, days.length - 1)];
  const film = new Set(days.flatMap(d => d.slots.map(x => x.movie.id))).size;
  const totale = days.reduce((n, d) => n + d.slots.length, 0);

  const scegli = (i: number) => {
    if (i === scelto) return;
    cambiato.current = true;
    const el = lista.current;
    if (!el || !prefersMotion()) { setScelto(i); return; }
    gsap.to(el, { opacity: 0, y: 14, duration: 0.25, ease: 'power2.in', onComplete: () => setScelto(i) });
  };

  // Il giorno nuovo entra riga per riga; se la lista era più in alto dello schermo, la pagina la raggiunge.
  useLayoutEffect(() => {
    if (!cambiato.current) return;
    const el = lista.current;
    if (!el) return;
    ScrollTrigger.refresh();
    const sopra = (date.current?.offsetHeight || 0) + 16;
    if (el.getBoundingClientRect().top < sopra - 1) {
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - sopra, behavior: prefersMotion() ? 'smooth' : 'auto' });
    }
    if (!prefersMotion()) return;
    gsap.set(el, { opacity: 1, y: 0 });
    gsap.fromTo(el.querySelectorAll('[data-riga]'), { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.05, ease: 'expo.out' });
  }, [scelto]);

  return (
    <section ref={root} id="settimana" className={s.blocco} aria-labelledby="settimana-titolo">
      <Testata id="settimana-titolo" occhiello="Tutti gli spettacoli" destra={<span className={base.dati}>{days.length} giorni · {film} film · {totale} spettacoli</span>}>
        Il programma
      </Testata>
      <div ref={date} className={s.date} role="tablist" aria-label="Scegli il giorno">
        {days.map((d, i) => {
          const data = d.slots[0].show.date;
          const oggi = dayLabel(data, now) === 'Oggi';
          return (
            <button key={d.dayKey} role="tab" id={`giorno-${d.dayKey}`} aria-selected={i === scelto} aria-controls="programma-giorno"
              className={`${s.data} ${i === scelto ? s.dataScelta : ''}`} onClick={() => scegli(i)}>
              <span className={`${base.dati} ${s.dataSett}`}>{oggi ? 'Oggi' : formatWeekdayShort(data)}</span>
              <span className={`${base.titoli} ${s.dataNum}`}>{formatDayNumber(data)}</span>
              <span className={`${base.dati} ${s.dataConta}`}>{d.slots.length}</span>
            </button>
          );
        })}
      </div>
      <div ref={lista} id="programma-giorno" role="tabpanel" aria-labelledby={`giorno-${giorno.dayKey}`} className={s.pannello}>
        <h3 className={`${base.titoli} ${s.nomeGiorno}`}>{dayLong(giorno.slots[0].show.date)}</h3>
        <ol className={s.lista}>{giorno.slots.map(sl => <Riga key={sl.show.id} slot={sl} />)}</ol>
      </div>
    </section>
  );
}
