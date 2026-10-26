'use client';

import Image from 'next/image';
import type { Slot } from './programma';
import { useStanze, varDi } from './Luce';
import { Film, FilmLogo, Prenota, Vicina, crediti, giornoDi, img, lingua, quando } from './shared';
import s from './Lontani.module.css';

/**
 * Atto 6, più avanti: i film più lontani, in una galleria di fotogrammi. Uno
 * grande e uno piccolo si alternano da una riga all'altra, come le foto di una
 * mostra; ognuno entra con una dissolvenza lenta e l'immagine si posa, a tempo
 * suo. Ogni scheda ha il colore del suo film.
 *
 * Fino al 26 ottobre 2026 erano fasce che si aprivano a tendina, guidate passo
 * per passo dallo scorrimento: "così non mi piace, non è elegante" (Giovanni).
 * Il fotogramma grande sta sempre sopra il centro dello schermo, così la luce
 * della stanza segue lui.
 */
export default function Lontani({ slots, now }: { slots: Slot<Film>[]; now: Date }) {
  const { stanze } = useStanze();
  const primo = giornoDi(slots[0].show.date, now), ultimo = giornoDi(slots[slots.length - 1].show.date, now);
  return (
    <section className={s.lontani} aria-labelledby="lontani-titolo">
      <header className={s.capo} data-sc-in>
        <h2 id="lontani-titolo" className={s.nome}>Più avanti.</h2>
        <p className={s.sotto}>{slots.length === 1 ? 'Un film' : `${slots.length} film`}{primo === ultimo ? '' : `, da ${primo.toLowerCase()} a ${ultimo.toLowerCase()}`}.</p>
      </header>
      <ul className={s.galleria}>
        {slots.map((x, i) => (
          <li key={x.movie.id} className={s.opera} data-grande={i % 4 === 0 || i % 4 === 3 ? '' : undefined} style={varDi(stanze[x.movie.id])}
            data-sc-in data-luce={x.movie.id} data-film-ancora={x.movie.id}>
            <div className={s.quadro}>
              <Vicina><Image src={img(x.movie.backdrop_path, 'w1280')} alt="" fill sizes="(max-width: 860px) 100vw, 58vw" /></Vicina>
              <div className={s.velo} />
              <h3 className={s.titolo}><FilmLogo film={x.movie} className={s.logo} sizes="(max-width: 860px) 60vw, 300px" /></h3>
            </div>
            <div className={s.testo}>
              <p className={s.quando}>{quando(x.show, now)}</p>
              <p className={s.riga}>{[...crediti(x.movie), lingua(x.show)].filter(Boolean).join(' · ')}</p>
              <Prenota show={x.show} film={x.movie} now={now} variante="link" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
