'use client';

import Image from 'next/image';
import { X } from 'lucide-react';
import { useTrailer } from '@/context/TrailerContext';
import { trailerOf } from './programma';
import SchedaFilm from './SchedaFilm';
import { Film, FilmLogo, Prenota, Show, crediti, img, lingua, quando } from './shared';
import base from './Home.module.css';
import s from './Apertura.module.css';

interface Props {
  film: Film;
  show: Show;
  now: Date;
  /** Il film scelto con un Prenota: l'apertura diventa la sua scheda intera. */
  scheda: { film: Film; show: Show } | null;
  onApri: (show: Show, film: Film) => void;
  onChiudi: () => void;
}

/**
 * Atto 1, il prossimo film. Quiete e attesa: il fondale sale dal nero, poi il
 * logo, il quando e Prenota. Tre piani che si separano scendendo: il fondale
 * lontano (lento, si allontana e si chiude in una cornice), la locandina vicina
 * (più veloce, lo scavalca), il testo fermo al passo della pagina.
 * Il movimento lo guida `--sc-p`, il progresso dell'atto pubblicato dal motore.
 *
 * Ogni Prenota della pagina porta qui il suo film, con la scheda intera
 * (SchedaFilm): il fondale cambia salendo di nuovo dal nero, e la stanza
 * prende la luce di quel film. La X riporta dov'eri (HomePage).
 */
export default function Apertura({ film, show, now, scheda, onApri, onChiudi }: Props) {
  const { openTrailer } = useTrailer();
  const f = scheda?.film ?? film;
  const trailer = trailerOf(film);
  return (
    <section className={s.apertura} data-sc-act="pin" data-sc-span="2" style={{ height: '200vh' }} data-luce={f.id} data-film-ancora={film.id}
      data-scheda={scheda ? '' : undefined} aria-labelledby="apertura-titolo">
      <div className={`sc-stage ${s.palco}`} data-sc-stage>
        <div className={s.lontano}>
          <div className={s.sorge} key={f.id}>
            {f.backdrop_path && <Image src={img(f.backdrop_path, 'original')} alt="" fill priority sizes="100vw" className={s.fondale} />}
          </div>
        </div>
        <div className={s.velo} />
        {/* Il logo della sala sta con l'apertura e se ne va con lei: in cima solo il logo,
            senza la barra che scendendo si faceva banda (Giovanni, 30 ottobre 2026). */}
        <Image src="/assets/vestri-cinema.png" alt="Vestri Cinema" width={437} height={373} className={s.marchio} priority />
        {f.poster_path && (
          <div className={s.vicino}>
            <div className={s.locandina} key={f.id}>
              <Image src={img(f.poster_path, 'w500')} alt={`Locandina di ${f.title}`} fill priority sizes="(max-width: 860px) 30vw, 20vw" />
            </div>
          </div>
        )}
        {scheda && (
          <button type="button" className={s.chiudi} onClick={onChiudi} aria-label="Chiudi la scheda e torna dov'eri">
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        )}
        <div className={s.copia} data-sc-cue="0 0.6 0" style={{ opacity: 1 }}>
          {scheda ? (
            <SchedaFilm key={`${f.id}-${scheda.show.id}`} film={f} show={scheda.show} now={now} onApri={onApri} />
          ) : (
            <div className={s.entra}>
              <p className={s.quando}>{quando(show, now)}</p>
              <h2 id="apertura-titolo" className={s.titolo}>
                <FilmLogo film={film} className={s.logo} priority sizes="(max-width: 860px) 80vw, 560px" />
              </h2>
              <p className={s.crediti}>{[...crediti(film), lingua(show)].filter(Boolean).join(' · ')}</p>
              <div className={s.azioni}>
                <Prenota show={show} film={film} now={now} />
                {trailer && <button type="button" className={base.prenotaLink + ' ' + s.trailer} onClick={() => openTrailer(trailer)}>Guarda il trailer</button>}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
