'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { useTrailer } from '@/context/TrailerContext';
import { trailerOf } from './programma';
import { sala } from './metadati';
import type { ConDate, Posto, SpecialeInSala } from './proiezioneSpeciale';
import { useStanze, varDi } from './Luce';
import { Posti } from './Dati';
import { Film, Prenota, immagine, prefersMotion, useBook } from './shared';
import base from './Home.module.css';
import s from './Intermezzi.module.css';

/**
 * Gli intermezzi della proiezione speciale (25 novembre 2026): il materiale
 * del distributore messo fra gli atti, perché chi scorre la pagina non si
 * dimentichi della proiezione speciale ("per tenere alta l'attenzione",
 * Giovanni). Tre, distanti fra loro: il banner dopo Oggi, la locandina con le
 * foto di scena dopo le locandine dei prossimi giorni, il trailer verticale
 * dopo Più avanti.
 *
 * Nel materiale c'erano le date dell'anteprima nazionale (27-28-29 novembre):
 * sono state cancellate dalle immagini e dal trailer, e al loro posto il sito
 * scrive quelle del cinema, prese dal programma (`periodo`).
 */
type Props = { dati: SpecialeInSala<Film>; now: Date };

/** "Sala A24, ogni giorno alle 16:00 e alle 21:00". */
function doveQuando({ show, orari }: SpecialeInSala<Film>): string {
  const quando = orari.length ? `ogni giorno alle ${orari.join(' e alle ')}` : '';
  return [sala(show), quando].filter(Boolean).join(', ');
}

/** Le date del cinema, dove il distributore aveva le sue. */
function DateDelCinema({ posto, dati, classe }: { posto?: Posto; dati: SpecialeInSala<Film>; classe: string }) {
  if (!posto) return null;
  return (
    <span className={`${s.date} ${classe}`} data-riquadro={posto.riquadro ? '' : undefined}
      style={{ left: `${posto.x}%`, top: `${posto.y}%`, width: `${posto.w}%`, height: `${posto.h}%` }}>
      <span className={s.dateEvento}>Proiezione speciale</span>
      <span className={s.datePeriodo}>{dati.periodo}</span>
    </span>
  );
}

/** Intermezzo 1, dopo Oggi: il banner a tutta larghezza, che si tocca per prenotare. */
export function IntermezzoBanner({ dati, now }: Props) {
  const { stanze } = useStanze();
  const book = useBook();
  // Con un banner solo, quello vale per lo schermo grande e per il telefono.
  const o: ConDate | undefined = dati.speciale.materiale?.banner?.orizzontale ?? dati.speciale.materiale?.banner?.verticale;
  const v: ConDate | undefined = dati.speciale.materiale?.banner?.verticale ?? o;
  if (!o || !v) return null;
  const quale = (x: ConDate) => (x.w >= x.h ? s.dateOriz : s.dateVert);
  return (
    <section className={s.banner} data-atto="intermezzo-banner" data-luce={dati.movie.id} style={varDi(stanze[dati.movie.id])}
      aria-label={`${dati.movie.title}, proiezione speciale`}>
      <button type="button" className={s.manifesto} onClick={() => book(dati.show, dati.movie)}
        aria-label={`Prenota ${dati.movie.title}, proiezione speciale: ${dati.periodo.toLowerCase()}`}>
        <span className={`${s.cornice} ${s.oriz}`} style={{ aspectRatio: `${o.w} / ${o.h}` }}>
          <Image src={immagine(o.src)} alt="" fill sizes="100vw" />
          <DateDelCinema posto={o.date} dati={dati} classe={quale(o)} />
        </span>
        <span className={`${s.cornice} ${s.vert}`} style={{ aspectRatio: `${v.w} / ${v.h}` }}>
          <Image src={immagine(v.src)} alt="" fill sizes="100vw" />
          <DateDelCinema posto={v.date} dati={dati} classe={quale(v)} />
        </span>
      </button>
      <div className={s.piede}>
        <p className={s.riga}>{doveQuando(dati)}</p>
        <div className={s.azioni}>
          <Prenota show={dati.show} film={dati.movie} now={now} variante="link" />
          {!dati.show.isSoldOut && <Posti show={dati.show} />}
        </div>
      </div>
    </section>
  );
}

/** Intermezzo 2, dopo i prossimi giorni: la locandina e le foto di scena. */
export function IntermezzoQuinte({ dati, now }: Props) {
  const { stanze } = useStanze();
  const l = dati.speciale.materiale?.locandina;
  const foto = dati.speciale.materiale?.foto ?? [];
  if (!l && !foto.length) return null;
  return (
    <section className={s.quinte} data-atto="intermezzo-quinte" data-luce={dati.movie.id} style={varDi(stanze[dati.movie.id])}
      aria-labelledby="quinte-titolo">
      <header className={s.capo}>
        <p className={s.occhiello}>Proiezione speciale</p>
        <h2 id="quinte-titolo" className={base.attoTitolo}>{dati.movie.title}</h2>
        <p className={base.attoSotto}>{dati.periodo}. {maiuscola(doveQuando(dati))}.</p>
        <div className={s.azioni}>
          <Prenota show={dati.show} film={dati.movie} now={now} />
          {!dati.show.isSoldOut && <Posti show={dati.show} sempre />}
        </div>
      </header>
      <div className={s.mostra} data-solo={!l ? 'foto' : !foto.length ? 'locandina' : undefined}>
        {l && (
          <figure className={s.locandina} style={{ aspectRatio: `${l.w} / ${l.h}` }}>
            <Image src={immagine(l.src)} alt={`Locandina di ${dati.movie.title}`} fill sizes="(max-width: 860px) 70vw, 30vw" />
            <DateDelCinema posto={l.date} dati={dati} classe={s.dateLocandina} />
          </figure>
        )}
        {foto.length > 0 && <ul className={s.foto}>
          {foto.map(f => (
            <li key={f.src}>
              <figure className={s.scatto}>
                <span className={s.immagine} style={{ aspectRatio: `${f.w} / ${f.h}` }}>
                  <Image src={immagine(f.src)} alt={f.chi ? `${f.chi} in ${dati.movie.title}` : `Una scena di ${dati.movie.title}`} fill sizes="(max-width: 860px) 100vw, 32vw" />
                </span>
                {(f.chi || f.credito) && (
                  <figcaption className={s.didascalia}>
                    {f.chi && <span>{f.chi}</span>}
                    {f.credito && <span className={s.credito}>Foto: {f.credito}</span>}
                  </figcaption>
                )}
              </figure>
            </li>
          ))}
        </ul>}
      </div>
    </section>
  );
}

/**
 * Intermezzo 3, dopo Più avanti: il trailer verticale, muto e a ciclo, in un
 * telefono. Parte solo quando è in vista e si ferma appena esce: un video che
 * gira fuori schermo, col processore, ruba fotogrammi a tutta la pagina.
 * Con il movimento ridotto resta fermo sul suo fotogramma, coi comandi.
 */
export function IntermezzoTrailer({ dati, now }: Props) {
  const { stanze } = useStanze();
  const { openTrailer } = useTrailer();
  const video = useRef<HTMLVideoElement>(null);
  const tv = dati.speciale.materiale?.trailerVerticale;
  const trailer = trailerOf(dati.movie);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    // Con il movimento ridotto non parte da solo: i comandi, e lo si avvia a mano.
    if (!prefersMotion()) { el.controls = true; return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { el.play().catch(() => {}); } else el.pause();
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (!tv?.src) return null;
  return (
    <section className={s.verticale} data-atto="intermezzo-trailer" data-luce={dati.movie.id} style={varDi(stanze[dati.movie.id])}
      aria-labelledby="verticale-titolo">
      <div className={s.testo}>
        <p className={s.occhiello}>Proiezione speciale</p>
        <h2 id="verticale-titolo" className={s.grande}>{dati.movie.title}</h2>
        <p className={s.sopra}>{dati.speciale.sopra}</p>
        <p className={s.periodo}>{dati.periodo}</p>
        <p className={s.riga}>{doveQuando(dati)}</p>
        <div className={s.azioni}>
          <Prenota show={dati.show} film={dati.movie} now={now} />
          {trailer && <button type="button" className={base.prenotaLink} onClick={() => openTrailer(trailer)}>Guarda con l&apos;audio</button>}
        </div>
      </div>
      <div className={s.telefono}>
        <video ref={video} className={s.video} src={immagine(tv.src)} poster={tv.poster ? immagine(tv.poster) : undefined}
          muted loop playsInline preload="none" aria-label={`Il trailer di ${dati.movie.title}, senza audio`} />
      </div>
    </section>
  );
}

const maiuscola = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
