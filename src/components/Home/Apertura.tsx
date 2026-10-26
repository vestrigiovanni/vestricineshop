'use client';

import Image from 'next/image';
import { useTrailer } from '@/context/TrailerContext';
import { trailerOf } from './programma';
import { Film, FilmLogo, Prenota, Show, crediti, img, lingua, quando } from './shared';
import base from './Home.module.css';
import s from './Apertura.module.css';

/**
 * Atto 1, il prossimo film. Quiete e attesa: il fondale sale dal nero, poi il
 * logo, il quando e Prenota. Tre piani che si separano scendendo: il fondale
 * lontano (lento, si allontana e si chiude in una cornice), la locandina vicina
 * (più veloce, lo scavalca), il testo fermo al passo della pagina.
 * Il movimento lo guida `--sc-p`, il progresso dell'atto pubblicato dal motore.
 */
export default function Apertura({ film, show, now }: { film: Film; show: Show; now: Date }) {
  const { openTrailer } = useTrailer();
  const trailer = trailerOf(film);
  return (
    <section className={s.apertura} data-sc-act="pin" data-sc-span="2" style={{ height: '200vh' }} data-luce={film.id} data-film-ancora={film.id} aria-labelledby="apertura-titolo">
      <div className={`sc-stage ${s.palco}`} data-sc-stage>
        <div className={s.lontano}>
          <div className={s.sorge}>
            {film.backdrop_path && <Image src={img(film.backdrop_path, 'original')} alt="" fill priority sizes="100vw" className={s.fondale} />}
          </div>
        </div>
        <div className={s.velo} />
        {film.poster_path && (
          <div className={s.vicino}>
            <div className={s.locandina}>
              <Image src={img(film.poster_path, 'w500')} alt={`Locandina di ${film.title}`} fill priority sizes="(max-width: 860px) 30vw, 20vw" />
            </div>
          </div>
        )}
        <div className={s.copia} data-sc-cue="0 0.6 0" style={{ opacity: 1 }}>
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
        </div>
      </div>
    </section>
  );
}
