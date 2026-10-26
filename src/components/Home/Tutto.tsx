'use client';

import Image from 'next/image';
import type { CSSProperties } from 'react';
import type { Giorno, Slot } from './programma';
import { useLuce, varDi } from './Luce';
import { Film, Prenota, giornoDi, img, lingua, ora, tecnica, vaiA } from './shared';
import s from './Tutto.module.css';

/**
 * Atto 7, tutto il programma: la chiusura, che resta. "Vorrei vedere tutti i
 * film in programma": le locandine di tutti i film insieme, poi la settimana
 * giorno per giorno, ogni riga col suo Prenota nel colore del suo film. La
 * stanza prende la luce di tutti i film.
 */
export default function Tutto({ film, giorni, now }: { film: Slot<Film>[]; giorni: Giorno<Film>[]; now: Date }) {
  const { stanze } = useLuce();
  const spettacoli = giorni.reduce((n, g) => n + g.slots.length, 0);
  return (
    <section id="programma" className={s.tutto} data-luce="tutti" aria-labelledby="tutto-titolo">
      <header className={s.capo} data-sc-in>
        <h2 id="tutto-titolo" className={s.titolo}>Tutto il programma.</h2>
        <p className={s.sotto}>
          {film.length === 1 ? 'Un film' : `${film.length} film`}, {spettacoli === 1 ? 'uno spettacolo' : `${spettacoli} spettacoli`}
          {giorni.length > 1 ? `, da ${giornoDi(giorni[0].slots[0].show.date, now).toLowerCase()} a ${giornoDi(giorni[giorni.length - 1].slots[0].show.date, now).toLowerCase()}` : ''}.
        </p>
      </header>

      <ul className={s.parete} data-sc-in data-sc-stagger="35">
        {film.map(x => (
          <li key={x.movie.id} style={varDi(stanze[x.movie.id])}>
            <button type="button" className={s.opera} onClick={() => vaiA(`[data-film-ancora="${x.movie.id}"]`)} aria-label={`${x.movie.title}: vai al film`}>
              {x.movie.poster_path && <Image src={img(x.movie.poster_path, 'w342')} alt="" fill sizes="(max-width: 860px) 30vw, 12vw" />}
            </button>
          </li>
        ))}
      </ul>

      <div className={s.settimana}>
        {giorni.map(g => (
          <section key={g.dayKey} className={s.giorno} aria-label={giornoDi(g.slots[0].show.date, now)}>
            <h3 className={s.nomeGiorno}>{giornoDi(g.slots[0].show.date, now)}</h3>
            <ul className={s.righe}>
              {g.slots.map(x => (
                <li key={x.show.id} className={s.riga} style={varDi(stanze[x.movie.id]) as CSSProperties}>
                  <span className={s.ora}>{ora(x.show)}</span>
                  <span className={s.film}>
                    <span className={s.nomeFilm}>{x.movie.title}</span>
                    <span className={s.dati}>{[x.movie.director, lingua(x.show), ...tecnica(x.show)].filter(Boolean).join(' · ')}</span>
                  </span>
                  <Prenota show={x.show} film={x.movie} now={now} variante="link" className={s.prenota} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
