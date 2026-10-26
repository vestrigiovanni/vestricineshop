'use client';

import Image from 'next/image';
import type { Slot } from './programma';
import { Film, FilmLogo, Prenota, Show, Vicina, crediti, giornoDi, img, lingua, ora, tecnica } from './shared';
import s from './Oggi.module.css';

/** Quanto scorrimento per ogni film che sfuma nel successivo. */
const PER_FILM = 0.9;

/**
 * Atto 2, gli altri film del giorno. Scoperta: la cornice resta ferma e i film
 * si sciolgono uno nell'altro, ciascuno col suo orario grande, il logo e
 * Prenota. A ogni film cambia la luce della stanza (`data-luce-da/a`).
 */
export default function Oggi({ slots, now }: { slots: Slot<Film>[]; now: Date }) {
  const n = slots.length;
  const span = Math.round((0.6 + n * PER_FILM) * 100) / 100;
  // Tutti dello stesso giorno? Allora l'atto ha un nome: "Oggi", "Domani".
  const giorni = new Set(slots.map(x => giornoDi(x.show.date, now)));
  const nome = giorni.size === 1 ? [...giorni][0] : 'Subito dopo';
  return (
    <section className={s.oggi} data-sc-act="pin" data-sc-span={span} style={{ height: `${span * 100}vh` }} aria-labelledby="oggi-titolo">
      <div className={`sc-stage ${s.palco}`} data-sc-stage>
        <h2 id="oggi-titolo" className={s.nome}>{nome}</h2>
        <div className={s.cornice}>
          {slots.map((x, i) => (
            // La prima immagine c'è già quando l'atto entra; le altre arrivano sopra e restano.
            <div key={x.movie.id} className={s.quadro} data-sc-cue={i === 0 ? '0 1 0 0' : String(tondo(i / n - 0.09))} data-sc-rise="0" style={i === 0 ? { opacity: 1 } : undefined}>
              <Vicina><Image src={img(x.movie.backdrop_path, 'w1280')} alt="" fill sizes="(max-width: 860px) 100vw, 60vw" /></Vicina>
            </div>
          ))}
        </div>
        <div className={s.testi}>
          {slots.map((x, i) => {
            // I testi non si sovrappongono mai: quello che esce sparisce prima che entri il successivo.
            const da = tondo(i / n), a = tondo((i + 1) / n);
            const cue = n === 1 ? '0 1 0 0' : i === 0 ? `0 ${a} 0 0.25` : i === n - 1 ? String(da) : `${da} ${a} 0.25 0.25`;
            return (
              <div key={x.movie.id} className={s.testo} data-sc-cue={cue} style={i === 0 ? { opacity: 1 } : undefined}
                data-luce={x.movie.id} data-luce-da={i === 0 ? 0 : da} data-luce-a={i === n - 1 ? 1.01 : a} data-film-ancora={x.movie.id}>
                <Voce film={x.movie} show={x.show} now={now} conGiorno={giorni.size > 1} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const tondo = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 1000) / 1000;

function Voce({ film, show, now, conGiorno }: { film: Film; show: Show; now: Date; conGiorno: boolean }) {
  const righe = [crediti(film).join(' · '), [lingua(show), ...tecnica(show)].filter(Boolean).join(' · ')].filter(Boolean);
  return (
    <>
      {conGiorno && <p className={s.giorno}>{giornoDi(show.date, now)}</p>}
      <p className={s.ora}>{ora(show)}</p>
      <h3 className={s.titolo}><FilmLogo film={film} className={s.logo} sizes="(max-width: 860px) 70vw, 380px" /></h3>
      {righe.map(r => <p key={r} className={s.riga}>{r}</p>)}
      <div className={s.azione}><Prenota show={show} film={film} now={now} /></div>
    </>
  );
}
