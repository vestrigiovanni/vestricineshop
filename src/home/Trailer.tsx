'use client';
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from 'react';
import type { Slot } from './programma';
import type { Film } from './metadati';
import { Cartellino, Logo, Posti, Prenota, Quando, img } from './pezzi';

/**
 * Atto 5, il trailer: il momento da ricordare. Parte muto appena la pagina ha
 * finito di caricarsi, così chi ci arriva lo trova già avviato ("il trailer va
 * fatto partire appena l'utente si collega sul sito", Gio, 26/10/2026). Lo
 * schermo si apre dentro la sala buia seguendo lo scorrimento (`--sc-p` del
 * motore); solo alla fine arrivano il logo e Prenota.
 * Con "riduci movimento" il video non parte: resta il fotogramma.
 */
export default function Trailer({ slot, chiave, now }: { slot: Slot<Film>; chiave: string; now: Date }) {
  const { movie: film, show } = slot;
  const [acceso, setAcceso] = useState(false);
  const [va, setVa] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let t = 0;
    const accendi = () => { t = window.setTimeout(() => setAcceso(true), 1200); };
    if (document.readyState === 'complete') accendi();
    else addEventListener('load', accendi, { once: true });
    return () => { removeEventListener('load', accendi); clearTimeout(t); };
  }, []);

  // Il fotogramma resta sopra finché YouTube non dice che il video va davvero:
  // niente schermo nero né pulsanti rossi mentre carica.
  useEffect(() => {
    if (!acceso) return;
    const ascolta = (e: MessageEvent) => {
      try {
        if (!/youtube(-nocookie)?\.com$/.test(new URL(e.origin).hostname)) return;
        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (d?.info?.playerState === 1) setVa(true);
      } catch { /* messaggi d'altro tipo */ }
    };
    addEventListener('message', ascolta);
    return () => removeEventListener('message', ascolta);
  }, [acceso]);
  const presentati = () => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: chiave }), '*');

  return (
    <section className="trailer" data-sc-act="pin" data-sc-span="3" style={{ height: '300vh' }} data-luce="buio" data-film={film.id}
      aria-labelledby="trailer-titolo">
      <div className="sc-stage trailer__palco" data-sc-stage>
        <div className="trailer__schermo">
          {acceso && (
            <iframe
              ref={frame}
              className="trailer__video"
              onLoad={presentati}
              src={`https://www.youtube-nocookie.com/embed/${chiave}?autoplay=1&mute=1&controls=0&loop=1&playlist=${chiave}&playsinline=1&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&enablejsapi=1`}
              allow="autoplay; encrypted-media"
              title={`Trailer di ${film.title}, senza audio`}
              tabIndex={-1}
            />
          )}
          <div className="trailer__attesa" data-via={va ? '' : undefined}>
            {film.backdrop_path && <img src={img(film.backdrop_path, 'w1280')} alt="" loading="lazy" decoding="async" />}
          </div>
          <div className="trailer__velo" />
        </div>
        <div className="container trailer__copia" data-sc-cue="0.68 1">
          <p className="occhiello">Il trailer</p>
          <h2 id="trailer-titolo" className="trailer__titolo"><Logo film={film} size="w780" /></h2>
          <Quando show={show} now={now} />
          <Cartellino film={film} show={show} now={now} voci={['film', 'versione']} />
          <div className="azioni">
            <Prenota show={show} film={film} now={now} />
            <a className="prenota-link" href={`https://www.youtube.com/watch?v=${chiave}`} target="_blank" rel="noreferrer">
              Guarda con l&apos;audio<span aria-hidden> ↗</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
