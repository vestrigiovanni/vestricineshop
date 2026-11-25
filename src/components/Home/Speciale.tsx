'use client';

import Image from 'next/image';
import { useTrailer } from '@/context/TrailerContext';
import { trailerOf } from './programma';
import { sala } from './metadati';
import type { SpecialeInSala } from './proiezioneSpeciale';
import { useStanze, varDi } from './Luce';
import { Posti } from './Dati';
import { Film, Prenota, immagine } from './shared';
import base from './Home.module.css';
import s from './Speciale.module.css';

/**
 * La proiezione speciale (25 novembre 2026): finché è in programma apre la
 * home, prima di tutto il resto. Una pagina d'apertura come quella di un
 * distributore, col primo piano del film, il logo della casa (A24) e il titolo
 * grande; poi le frasi della critica, una per schermata, ciascuna sul suo
 * fotogramma. Chiesta da Giovanni con le schermate del sito di I Wonder
 * Pictures. Le date sono quelle del cinema (`periodo`), non quelle
 * dell'anteprima nazionale stampate nel materiale; sotto, sala e orari.
 *
 * Tutto fermo, scorre solo la pagina: niente sfumature CSS grandi (il velo è
 * un'immagine), niente ombre, niente entrate a tempo. Col processore, nel
 * Firefox di Giovanni, sono le cose che costano (vedi scroll-craft-home).
 *
 * Prenota fa quello che fa ovunque: porta il film nell'apertura, con la scheda
 * intera e i giorni.
 */
export default function Speciale({ dati, now }: { dati: SpecialeInSala<Film>; now: Date }) {
  const { openTrailer } = useTrailer();
  const { stanze } = useStanze();
  const { speciale, movie, show, orari } = dati;
  const trailer = trailerOf(movie);
  const dove = sala(show);
  // "ogni giorno alle 16:00 e alle 21:00": gli orari, non le date.
  const quando = orari.length ? `ogni giorno alle ${orari.join(' e alle ')}` : '';

  return (
    <section className={s.speciale} data-atto="speciale" style={varDi(stanze[movie.id])} data-luce={movie.id} data-film-ancora={movie.id}
      aria-labelledby="speciale-titolo">
      <div className={s.apertura}>
        <Image src={immagine(speciale.fondale, 'original')} alt="" fill preload sizes="100vw" className={s.fondale} />
        <div className={s.velo} />
        <Image src="/assets/vestri-cinema.png" alt="Vestri Cinema" width={437} height={373} className={s.marchio} loading="eager" />
        {speciale.casa.logo && <Image src={immagine(speciale.casa.logo, 'w500')} alt={speciale.casa.nome} width={500} height={205} className={s.casa} loading="eager" />}
        <div className={s.copia}>
          {speciale.sopra && <p className={s.sopra}>{speciale.sopra}</p>}
          <h2 id="speciale-titolo" className={s.titolo}>{movie.title}</h2>
          <p className={s.evento}>Proiezione speciale</p>
          <p className={s.dove}>{dati.periodo}</p>
          {(dove || quando) && <p className={s.orari}>{[dove, quando].filter(Boolean).join(', ')}</p>}
          <div className={s.azioni}>
            <Prenota show={show} film={movie} now={now} />
            {!show.isSoldOut && <Posti show={show} sempre />}
            {trailer && <button type="button" className={base.prenotaLink} onClick={() => openTrailer(trailer)}>Guarda il trailer</button>}
          </div>
        </div>
      </div>

      {speciale.citazioni.map(c => (
        <figure key={`${c.fonte}-${c.testo}`} className={s.citazione}>
          <Image src={immagine(c.fondale, 'original')} alt="" fill sizes="100vw" className={s.fondale} />
          <div className={s.buio} />
          <blockquote className={s.frase}>
            <p>“{c.testo}”</p>
          </blockquote>
          <figcaption className={s.fonte}>{c.fonte}</figcaption>
        </figure>
      ))}
    </section>
  );
}
