'use client';

import { useRef } from 'react';
import type { Slot } from './regia';
import { Film, Show, FilmLogo, PrenotaButton, dayLabel, dayLong, gsap, lingua, runtime, sala, specs, time, useRegia } from './shared';
import base from './Home.module.css';
import s from './Programma.module.css';

/** Una riga di programma: l'ora grande, il logo del film al posto del titolo, i dati, Prenota. */
function Riga({ slot }: { slot: Slot<Film> }) {
  const { movie: f, show } = slot as { movie: Film; show: Show };
  const dati = [f.director, runtime(f.runtime), lingua(show), ...specs(show), sala(show)].filter(Boolean).join(' · ');
  return (
    <li className={s.riga} data-riga>
      <span className={`${base.titoli} ${s.ora}`}>{time(show.date)}</span>
      <span className={s.logo}><FilmLogo film={f} className={s.logoImg} sizes="260px" /></span>
      <span className={`${base.dati} ${s.dati}`}>{dati}</span>
      <PrenotaButton show={show} film={f} />
    </li>
  );
}

/** Oggi: gli spettacoli del primo giorno con qualcosa in sala. */
export function Oggi({ dayKey, slots, now }: { dayKey: string; slots: Slot<Film>[]; now: Date }) {
  const root = useRef<HTMLElement>(null);
  const label = dayLabel(slots[0].show.date, now);
  useRegia(root, () => {
    gsap.from('[data-riga]', { opacity: 0, y: 28, duration: 0.9, stagger: 0.08, ease: 'power2.out', scrollTrigger: { trigger: root.current, start: 'top 80%' } });
  });
  return (
    <section ref={root} className={s.blocco} aria-labelledby="oggi-titolo" data-giorno={dayKey}>
      <header className={s.testa}>
        <h2 id="oggi-titolo" className={`${base.titoli} ${s.titolo}`}>{label === 'Oggi' ? 'Oggi' : dayLong(slots[0].show.date)}</h2>
        {label === 'Oggi' && <span className={`${base.dati} ${s.sotto}`}>{dayLong(slots[0].show.date)}</span>}
      </header>
      <ol className={s.lista}>{slots.map(sl => <Riga key={sl.show.id} slot={sl} />)}</ol>
    </section>
  );
}

/** La settimana completa: ogni giorno con i suoi spettacoli. Da qui si prenota tutto. */
export function Settimana({ days, now }: { days: { dayKey: string; slots: Slot<Film>[] }[]; now: Date }) {
  const root = useRef<HTMLElement>(null);
  useRegia(root, () => {
    gsap.utils.toArray<HTMLElement>('[data-giorno-riga]').forEach(el =>
      gsap.from(el, { opacity: 0, y: 30, duration: 0.8, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 90%' } }));
  });
  return (
    <section ref={root} id="settimana" className={s.blocco} aria-labelledby="settimana-titolo">
      <header className={s.testa}><h2 id="settimana-titolo" className={`${base.titoli} ${s.titolo}`}>La settimana</h2></header>
      {days.map(d => (
        <div key={d.dayKey} className={s.giorno} data-giorno-riga>
          <h3 className={`${base.dati} ${s.nomeGiorno}`}>{dayLabel(d.slots[0].show.date, now) === 'Oggi' ? `Oggi · ${dayLong(d.slots[0].show.date)}` : dayLong(d.slots[0].show.date)}</h3>
          <ol className={s.lista}>{d.slots.map(sl => <Riga key={sl.show.id} slot={sl} />)}</ol>
        </div>
      ))}
    </section>
  );
}
