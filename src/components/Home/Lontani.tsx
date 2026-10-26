'use client';

import Image from 'next/image';
import type { CSSProperties } from 'react';
import type { Slot } from './programma';
import { Film, FilmLogo, Prenota, Show, Vicina, crediti, img, lingua, quando } from './shared';
import s from './Lontani.module.css';

/** Le tendine, a turno; l'iride una volta sola, sull'ultimo film. */
const TENDINE = ['up', 'left', 'right', 'down'];

/**
 * Atto 6, più avanti. Slancio: i film più lontani arrivano a fasce che si
 * aprono a tendina, ognuna più stretta della precedente. Il tempo accelera
 * e la stanza cambia colore a ogni stacco.
 */
export default function Lontani({ slots, now }: { slots: Slot<Film>[]; now: Date }) {
  return (
    <section className={s.lontani} aria-labelledby="lontani-titolo">
      <h2 id="lontani-titolo" className={s.nome} data-sc-in>Più avanti.</h2>
      {slots.map((x, i) => {
        const ultimo = i === slots.length - 1 && slots.length > 1;
        return (
          <article key={x.movie.id} className={s.fascia} data-sc-act="flow" data-lato={i % 2 ? 'destra' : 'sinistra'}
            style={{ '--h': `${Math.max(46, 82 - i * 12)}` } as CSSProperties} data-luce={x.movie.id} data-film-ancora={x.movie.id}>
            <div className={s.immagine} data-sc-reveal={ultimo ? 'iris' : TENDINE[i % TENDINE.length]} data-sc-reveal-at={ultimo ? '0.06 0.5' : '0.04 0.34'}>
              <Vicina><Image src={img(x.movie.backdrop_path, 'w1280')} alt="" fill sizes="100vw" /></Vicina>
            </div>
            <div className={s.velo} />
            <Testo film={x.movie} show={x.show} now={now} />
          </article>
        );
      })}
    </section>
  );
}

function Testo({ film, show, now }: { film: Film; show: Show; now: Date }) {
  return (
    <div className={s.testo}>
      <p className={s.quando}>{quando(show, now)}</p>
      <h3 className={s.titolo}><FilmLogo film={film} className={s.logo} sizes="(max-width: 860px) 60vw, 340px" /></h3>
      <p className={s.riga}>{[...crediti(film), lingua(show)].filter(Boolean).join(' · ')}</p>
      <Prenota show={show} film={film} now={now} />
    </div>
  );
}
