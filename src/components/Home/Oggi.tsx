'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { nextShow, type Slot } from './programma';
import { Film, FilmLogo, Prenota, Show, Vicina, crediti, giornoDi, img, lingua, ora, tecnica, useBook } from './shared';
import base from './Home.module.css';
import s from './Oggi.module.css';

/** Quanto scorrimento per ogni film che sfuma nel successivo. */
const PER_FILM = 0.9;

/**
 * Atto 2, tutti i film del giorno. Scoperta: la cornice resta ferma e i film
 * si sciolgono uno nell'altro, ciascuno col suo orario grande, il logo e
 * Prenota. A ogni film cambia la luce della stanza (`data-luce-da/a`).
 *
 * Lo scorrimento sceglie quale film è acceso; la dissolvenza va poi da sola,
 * a tempo suo, con una transizione CSS che il browser fa sulla scheda grafica.
 * Prima l'opacità seguiva lo scorrimento passo per passo: su Firefox, dove la
 * pagina scorre per conto suo e il JavaScript insegue, si vedeva a scatti.
 */
export default function Oggi({ slots, now }: { slots: Slot<Film>[]; now: Date }) {
  const atto = useRef<HTMLElement>(null);
  const n = slots.length;
  const span = Math.round((0.6 + n * PER_FILM) * 100) / 100;
  // Tutti dello stesso giorno? Allora l'atto ha un nome: "Oggi", "Domani".
  const giorni = new Set(slots.map(x => giornoDi(x.show.date, now)));
  const nome = giorni.size === 1 ? [...giorni][0] : 'Subito dopo';

  useEffect(() => {
    const el = atto.current;
    if (!el) return;
    let acceso = -1, raf = 0;
    const leggi = () => {
      raf = 0;
      // Il progresso si misura qui e non si chiede al motore: nello stesso fotogramma
      // il motore può aggiornarlo dopo, e l'ultimo passo di uno scorrimento resterebbe indietro.
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / Math.max(r.height - innerHeight, 1)));
      const i = Math.min(n - 1, Math.floor(p * n));
      if (i === acceso) return;
      acceso = i;
      el.querySelectorAll<HTMLElement>('[data-voce]').forEach(v => v.toggleAttribute('data-acceso', Number(v.dataset.voce) === i));
    };
    const chiedi = () => { if (!raf) raf = requestAnimationFrame(leggi); };
    // Si ascolta lo scorrimento solo mentre l'atto è in vista.
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { addEventListener('scroll', chiedi, { passive: true }); chiedi(); }
      else removeEventListener('scroll', chiedi);
    });
    io.observe(el);
    return () => { io.disconnect(); removeEventListener('scroll', chiedi); cancelAnimationFrame(raf); };
  }, [n]);

  return (
    <section ref={atto} className={s.oggi} data-sc-act="pin" data-sc-span={span} style={{ height: `${span * 100}vh` }} aria-labelledby="oggi-titolo">
      <div className={`sc-stage ${s.palco}`} data-sc-stage>
        <h2 id="oggi-titolo" className={s.nome}>{nome}</h2>
        <div className={s.cornice}>
          {slots.map((x, i) => (
            <div key={x.movie.id} className={s.quadro} data-voce={i} data-acceso={i === 0 ? '' : undefined}>
              <Vicina><Image src={img(x.movie.backdrop_path, 'w1280')} alt="" fill sizes="(max-width: 860px) 100vw, 60vw" /></Vicina>
            </div>
          ))}
        </div>
        <div className={s.testi}>
          {slots.map((x, i) => (
            <div key={x.movie.id} className={s.testo} data-voce={i} data-acceso={i === 0 ? '' : undefined}
              data-luce={x.movie.id} data-luce-da={tondo(i / n)} data-luce-a={i === n - 1 ? 1.01 : tondo((i + 1) / n)} data-film-ancora={x.movie.id}>
              <Voce film={x.movie} show={x.show} now={now} conGiorno={giorni.size > 1} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const tondo = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 1000) / 1000;

function Voce({ film, show, now, conGiorno }: { film: Film; show: Show; now: Date; conGiorno: boolean }) {
  const book = useBook();
  // Esaurito oggi, ma con un'altra data: "Altre date" apre la sua scheda.
  const altra = show.isSoldOut ? nextShow(film, now) : null;
  const righe = [crediti(film).join(' · '), [lingua(show), ...tecnica(show)].filter(Boolean).join(' · ')].filter(Boolean);
  return (
    <>
      {conGiorno && <p className={s.giorno}>{giornoDi(show.date, now)}</p>}
      <p className={s.ora}>{ora(show)}</p>
      <h3 className={s.titolo}><FilmLogo film={film} className={s.logo} sizes="(max-width: 860px) 70vw, 380px" /></h3>
      {righe.map(r => <p key={r} className={s.riga}>{r}</p>)}
      <div className={s.azione}>
        <Prenota show={show} film={film} now={now} />
        {altra && !altra.isSoldOut && <button type="button" className={base.prenotaLink} onClick={() => book(altra as Show, film)}>Altre date</button>}
      </div>
    </>
  );
}
