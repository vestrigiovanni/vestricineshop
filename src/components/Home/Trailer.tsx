'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useTrailer } from '@/context/TrailerContext';
import type { Slot } from './programma';
import { Film, FilmLogo, Prenota, img, prefersMotion, quando } from './shared';
import base from './Home.module.css';
import s from './Trailer.module.css';

/**
 * Atto 4, le luci si spengono: silenzio voluto. La luce d'ambiente cala fino al
 * buio e resta una riga sola, il motto del film che sta per arrivare.
 */
export function Silenzio({ film }: { film: Film }) {
  return (
    <section className={s.silenzio} data-sc-act="flow" data-luce="buio" data-luce-film={film.id} aria-label="Si spengono le luci">
      {film.tagline && <p className={s.motto} data-sc-in>{film.tagline}</p>}
    </section>
  );
}

/**
 * Atto 5, il trailer: il picco della pagina, quello che Giovanni vuole far
 * ricordare. Il trailer parte muto prima di arrivare sullo schermo (così ci si
 * imbatte in un film che va già), sale con le dita dentro una cornice, si
 * allarga a tutto schermo e si ferma lì a farsi guardare. Solo alla fine
 * arrivano il logo e Prenota. Fuori vista si mette in pausa.
 */
export default function Trailer({ slot, trailerKey, now }: { slot: Slot<Film>; trailerKey: string; now: Date }) {
  const { movie: film, show } = slot;
  const { openTrailer } = useTrailer();
  const root = useRef<HTMLElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [vicino, setVicino] = useState(false);
  const [va, setVa] = useState(false);
  // Si accende quando manca uno schermo e mezzo: arrivandoci, sta già andando.
  useEffect(() => {
    const el = root.current;
    // Senza movimento niente video che parte da solo: resta il fotogramma, e il trailer a richiesta.
    if (!el || !prefersMotion()) return;
    const io = new IntersectionObserver(([e]) => setVicino(v => v || e.isIntersecting), { rootMargin: '150% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Lontano dallo schermo il trailer si ferma; tornando, riparte.
  useEffect(() => {
    const el = root.current;
    if (!el || !vicino) return;
    const comanda = (func: string) => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');
    const io = new IntersectionObserver(([e]) => comanda(e.isIntersecting ? 'playVideo' : 'pauseVideo'), { rootMargin: '60% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [vicino]);

  // Il fondale resta finché YouTube non dice che il video sta davvero andando
  // (playerState 1): se l'autoplay è bloccato si vede il fotogramma, non il nero.
  useEffect(() => {
    if (!vicino) return;
    const ascolta = (e: MessageEvent) => {
      try {
        if (!/youtube(-nocookie)?\.com$/.test(new URL(e.origin).hostname)) return;
        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (d?.info?.playerState === 1) setVa(true);
      } catch { /* messaggi d'altro tipo */ }
    };
    window.addEventListener('message', ascolta);
    return () => window.removeEventListener('message', ascolta);
  }, [vicino]);
  const presentati = () => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: trailerKey }), '*');

  return (
    <section ref={root} className={s.trailer} data-sc-act="pin" data-sc-span="3.6" style={{ height: '360vh' }} data-luce="buio" data-luce-film={film.id} data-film-ancora={film.id} aria-labelledby="trailer-titolo">
      <div className={`sc-stage ${s.palco}`} data-sc-stage>
        <div className={s.schermo}>
          {vicino && (
            <iframe
              ref={frame}
              className={s.video}
              onLoad={presentati}
              src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${trailerKey}&playsinline=1&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&enablejsapi=1`}
              allow="autoplay; encrypted-media"
              title={`Trailer di ${film.title}, senza audio`}
              tabIndex={-1}
            />
          )}
          <div className={s.attesa} style={{ opacity: va ? 0 : 1 }}>
            {film.backdrop_path && <Image src={img(film.backdrop_path, 'w1280')} alt="" fill sizes="100vw" />}
          </div>
          <div className={s.velo} />
        </div>
        <div className={s.copia} data-sc-cue="0.74 1 0.25 0.08" data-luce={film.id} data-luce-da="0.74" data-luce-a="1.01">
          <p className={s.quando}>{quando(show, now)}</p>
          <h2 id="trailer-titolo" className={s.titolo}><FilmLogo film={film} className={s.logo} sizes="(max-width: 860px) 70vw, 460px" /></h2>
          <div className={s.azioni}>
            <Prenota show={show} film={film} now={now} />
            <button type="button" className={base.prenotaLink} onClick={() => openTrailer(trailerKey)}>Guarda con l&apos;audio</button>
          </div>
        </div>
      </div>
    </section>
  );
}
