'use client';

import { useState } from 'react';
import Image from 'next/image';
import { X } from 'lucide-react';
import { useTrailer } from '@/context/TrailerContext';
import { trailerOf } from './programma';
import SchedaFilm from './SchedaFilm';
import { Cartellino, Posti, Quando } from './Dati';
import { Film, FilmLogo, Prenota, Show, img } from './shared';
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
 * logo, il quando e Prenota, con lo stesso cartellino di ogni altro film
 * (regia, anno, durata, lingua, sala, premio col logo del festival).
 *
 * Il fondale sta fermo: è grande quanto lo schermo, e muoverlo o chiuderlo in
 * una cornice seguendo lo scorrimento, col processore, era un fotogramma ogni
 * 83 ms (misurato il 10 novembre 2026 nel Firefox di Giovanni). La profondità
 * la danno le cose piccole: la locandina sale più in fretta della pagina e il
 * testo se ne va per primo, guidati da `--sc-p`, il progresso dell'atto. Poi
 * l'atto si scioglie nel fondo e sale via con lo scorrimento del browser.
 *
 * Ogni Prenota della pagina porta qui il suo film, con la scheda intera
 * (SchedaFilm): il fondale nuovo sfuma sopra il vecchio, e la stanza prende la
 * luce di quel film. Nella scheda i fotogrammi del film si possono sfogliare:
 * quello scelto diventa il fondale. La X riporta dov'eri (HomePage).
 */
export default function Apertura({ film, show, now, scheda, onApri, onChiudi }: Props) {
  const { openTrailer } = useTrailer();
  const f = scheda?.film ?? film;
  const trailer = trailerOf(film);

  // Il fotogramma scelto nella scheda vale per quel film soltanto.
  const [scelto, setScelto] = useState<{ id: number; path: string } | null>(null);
  const fondale = (scheda && scelto?.id === f.id ? scelto.path : '') || f.backdrop_path || '';

  // Il fondale nuovo sfuma sopra il vecchio, che resta sotto finché non è coperto
  // (stato che dipende da altro stato: si aggiorna durante il render).
  const [strati, setStrati] = useState<string[]>(fondale ? [fondale] : []);
  if (fondale && strati[strati.length - 1] !== fondale) setStrati([...strati.filter(x => x !== fondale), fondale].slice(-2));

  return (
    <section className={s.apertura} data-atto="apertura" data-sc-act="pin" data-sc-span="1.7" style={{ height: '170vh' }} data-luce={f.id} data-film-ancora={film.id}
      data-scheda={scheda ? '' : undefined} aria-labelledby="apertura-titolo">
      <div className={`sc-stage ${s.palco}`} data-sc-stage>
        <div className={s.lontano}>
          {strati.map((path, i) => (
            <div key={path} className={s.sorge} data-primo={i === 0 && strati.length === 1 ? '' : undefined}
              onAnimationEnd={i === strati.length - 1 && strati.length > 1 ? () => setStrati(v => v.slice(-1)) : undefined}>
              <Image src={img(path, 'original')} alt="" fill preload={path === film.backdrop_path} sizes="100vw" className={s.fondale} />
            </div>
          ))}
        </div>
        <div className={s.velo} />
        {/* Il logo della sala sta con l'apertura e se ne va con lei: in cima solo il logo,
            senza la barra che scendendo si faceva banda (Giovanni, 30 ottobre 2026). */}
        <Image src="/assets/vestri-cinema.png" alt="Vestri Cinema" width={437} height={373} className={s.marchio} loading="eager" />
        {f.poster_path && (
          <div className={s.vicino}>
            <div className={s.locandina} key={f.id}>
              <Image src={img(f.poster_path, 'w500')} alt={`Locandina di ${f.title}`} fill loading="eager" sizes="(max-width: 860px) 30vw, 20vw" />
            </div>
          </div>
        )}
        {scheda && (
          <button type="button" className={s.chiudi} onClick={onChiudi} aria-label="Chiudi la scheda e torna dov'eri">
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        )}
        <div className={s.copia} data-sc-cue="0 0.7 0" style={{ opacity: 1 }}>
          {scheda ? (
            <SchedaFilm key={`${f.id}-${scheda.show.id}`} film={f} show={scheda.show} now={now} onApri={onApri}
              fotogramma={fondale} onFotogramma={path => setScelto({ id: f.id, path })} />
          ) : (
            <div className={s.entra}>
              <h2 id="apertura-titolo" className={s.titolo}>
                <FilmLogo film={film} className={s.logo} subito sizes="(max-width: 860px) 80vw, 560px" />
              </h2>
              <Quando show={show} now={now} className={s.quando} />
              <Cartellino film={film} show={show} now={now} className={s.cartellino} />
              <div className={s.azioni}>
                <Prenota show={show} film={film} now={now} />
                {!show.isSoldOut && <Posti show={show} sempre />}
                {trailer && <button type="button" className={base.prenotaLink + ' ' + s.trailer} onClick={() => openTrailer(trailer)}>Guarda il trailer</button>}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
