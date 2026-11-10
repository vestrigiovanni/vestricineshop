'use client';

import Image from 'next/image';
import type { Slot } from './programma';
import { useStanze, varDi } from './Luce';
import { Cartellino, Posti, Quando } from './Dati';
import { Film, FilmLogo, Prenota, Vicina, giornoDi, img } from './shared';
import base from './Home.module.css';
import s from './Lontani.module.css';

/**
 * Atto 6, più avanti: i film più lontani, in una galleria di fotogrammi. Uno
 * grande e uno piccolo si alternano da una riga all'altra, come le foto di una
 * mostra. Ogni fotogramma porta il logo del suo film, e sotto lo stesso
 * cartellino di tutti gli altri, nel colore del film.
 *
 * Fotogrammi e cartellini arrivano con la pagina, fermi; a entrare, una volta,
 * è solo il titolo dell'atto. Fino al 10 novembre 2026 entrava tutto il blocco
 * (dissolvenza di un secondo, e l'immagine che si posava per due e mezzo), poi
 * il solo cartellino: ma sta attaccato al suo fotogramma, e ogni passo della
 * dissolvenza faceva ridipingere al processore anche quello. Coi film uno dopo
 * l'altro, nel Firefox di Giovanni, un fotogramma su cinque superava i 33 ms;
 * coi cartellini fermi sono due su cento.
 *
 * Fino al 26 ottobre erano fasce che si aprivano a tendina: "così non mi
 * piace, non è elegante" (Giovanni).
 */
export default function Lontani({ slots, now, dopoIlBuio }: { slots: Slot<Film>[]; now: Date; dopoIlBuio: boolean }) {
  const { stanze } = useStanze();
  const primo = giornoDi(slots[0].show.date, now), ultimo = giornoDi(slots[slots.length - 1].show.date, now);
  return (
    <section className={s.lontani} data-atto="lontani" data-dopo-il-buio={dopoIlBuio ? '' : undefined} aria-labelledby="lontani-titolo">
      <header className={s.capo} data-sc-in>
        <h2 id="lontani-titolo" className={base.attoTitolo}>Più avanti.</h2>
        <p className={base.attoSotto}>{slots.length === 1 ? 'Un film' : `${slots.length} film`}{primo === ultimo ? '' : `, da ${primo.toLowerCase()} a ${ultimo.toLowerCase()}`}.</p>
      </header>
      <ul className={s.galleria}>
        {slots.map((x, i) => (
          <li key={x.movie.id} className={s.opera} data-grande={i % 4 === 0 || i % 4 === 3 ? '' : undefined} style={varDi(stanze[x.movie.id])}
            data-luce={x.movie.id} data-film-ancora={x.movie.id}>
            <div className={s.quadro}>
              <Vicina><Image src={img(x.movie.backdrop_path, 'w1280')} alt="" fill sizes="(max-width: 860px) 100vw, 58vw" /></Vicina>
              <div className={s.velo} />
              <h3 className={s.titolo}><FilmLogo film={x.movie} className={s.logo} sizes="(max-width: 860px) 60vw, 300px" /></h3>
            </div>
            <div className={s.testo}>
              <Quando show={x.show} now={now} className={s.quando} />
              <Cartellino film={x.movie} show={x.show} now={now} />
              <div className={s.azione}>
                <Prenota show={x.show} film={x.movie} now={now} variante="link" />
                {!x.show.isSoldOut && <Posti show={x.show} />}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
