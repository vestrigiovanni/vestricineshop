'use client';

import Image from 'next/image';
import { useTrailer } from '@/context/TrailerContext';
import { trailerOf } from './programma';
import { sala } from './metadati';
import type { SpecialeInSala } from './proiezioneSpeciale';
import { useStanze, varDi } from './Luce';
import { Posti } from './Dati';
import { Film, FilmLogo, Prenota, immagine } from './shared';
import { logoTestata } from './loghiStampa';
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
  const carattere = speciale.carattere;
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
        {/* Come la collaborazione di una maison: Vestri Cinema × la casa del film. */}
        <div className={s.collab}>
          <Image src="/assets/vestri-cinema.png" alt="Vestri Cinema" width={437} height={373} className={s.marchio} loading="eager" />
          {speciale.casa.logo && (
            <>
              <span className={s.per} aria-label="con">×</span>
              <Image src={immagine(speciale.casa.logo, 'w500')} alt={speciale.casa.nome} width={500} height={205} className={s.casa} loading="eager" />
            </>
          )}
        </div>
        <div className={s.copia}>
          {speciale.sopra && <p className={s.sopra}>{speciale.sopra}</p>}
          {/* Il logo del film, come nel materiale del distributore; senza logo, il titolo scritto. */}
          <h2 id="speciale-titolo" className={s.titolo}>
            {movie.logo_path && movie.logo_path !== 'none'
              ? <FilmLogo film={movie} className={s.logoTitolo} subito taglia="original" sizes="(max-width: 860px) 86vw, 760px" />
              : movie.title}
          </h2>
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

      {carattere && (
        // Il carattere del trailer, servito dal sito: nessuna richiesta a Google.
        <style>{`@font-face{font-family:'Critica ${carattere.famiglia}';src:url('${carattere.src}') format('woff2');font-weight:${carattere.peso};font-display:swap}`}</style>
      )}
      {speciale.citazioni.map(c => {
        const logo = c.fonte ? logoTestata(c.fonte) : null;
        return (
          <figure key={`${c.fonte}-${c.testo}`} className={s.citazione} data-trailer={carattere ? '' : undefined}
            style={carattere ? ({ '--cit-font': `'Critica ${carattere.famiglia}'`, '--cit-peso': carattere.peso } as React.CSSProperties) : undefined}>
            <Image src={immagine(c.fondale, 'original')} alt="" fill sizes="100vw" className={s.fondale} />
            <div className={s.buio} />
            <blockquote className={s.frase}>
              <p>“{c.testo}”</p>
            </blockquote>
            {/* Come nel trailer: «NOME, testata»; la testata col suo logo ufficiale, se l'abbiamo. */}
            <figcaption className={s.fonte}>
              {c.critico && <span>{c.critico}{c.fonte ? ', ' : ''}</span>}
              {logo
                // eslint-disable-next-line @next/next/no-img-element -- logo piccolo, già della misura giusta
                ? <img src={logo} alt={c.fonte} className={s.testata} />
                : c.fonte && <span className={s.testataScritta}>{c.fonte}</span>}
            </figcaption>
          </figure>
        );
      })}
    </section>
  );
}
