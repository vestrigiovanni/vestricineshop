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
    <section className={s.silenzio} data-sc-act="flow" data-luce="buio" aria-label="Si spengono le luci">
      {film.tagline && <p className={s.motto} data-sc-in>{film.tagline}</p>}
    </section>
  );
}

/**
 * Atto 5, il trailer: il picco della pagina, quello che Giovanni vuole far
 * ricordare. Il trailer parte muto appena la pagina ha finito di caricarsi,
 * non quando ci si avvicina: chi ci arriva lo trova già avviato, a metà
 * ("il trailer va fatto partire appena l'utente si collega sul sito",
 * 26 ottobre 2026). Sale con le dita dentro una cornice, si allarga a tutto
 * schermo e si ferma lì a farsi guardare. Solo alla fine arrivano il logo e
 * Prenota.
 */
export default function Trailer({ slot, trailerKey, now }: { slot: Slot<Film>; trailerKey: string; now: Date }) {
  const { movie: film, show } = slot;
  const { openTrailer } = useTrailer();
  const root = useRef<HTMLElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [acceso, setAcceso] = useState(false);
  const [va, setVa] = useState(false);
  // Il trailer si accende quando la pagina ha finito di caricarsi (e il browser ha
  // un momento libero): l'apertura arriva prima, poi parte il video, lontano.
  useEffect(() => {
    // Senza movimento niente video che parte da solo: resta il fotogramma, e il trailer a richiesta.
    if (!prefersMotion()) return;
    let timer = 0;
    const accendi = () => { timer = window.setTimeout(() => setAcceso(true), 1200); };
    if (document.readyState === 'complete') accendi();
    else addEventListener('load', accendi, { once: true });
    return () => { removeEventListener('load', accendi); clearTimeout(timer); };
  }, []);

  // L'orologio del trailer: dove sarebbe se fosse andato sempre da quando è partito.
  // Alcuni browser fermano i video muti fuori schermo; arrivando, lo si rimette in pari.
  const orologio = useRef({ partito: 0, tempo: 0, durata: 0, stato: -1 });
  useEffect(() => {
    if (!acceso) return;
    const ascolta = (e: MessageEvent) => {
      try {
        if (!/youtube(-nocookie)?\.com$/.test(new URL(e.origin).hostname)) return;
        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        const info = d?.info;
        if (!info) return;
        const o = orologio.current;
        if (typeof info.currentTime === 'number') o.tempo = info.currentTime;
        if (typeof info.duration === 'number' && info.duration > 0) o.durata = info.duration;
        if (typeof info.playerState === 'number') o.stato = info.playerState;
        // Il fondale resta finché YouTube non dice che il video sta davvero andando
        // (playerState 1): se l'autoplay è bloccato si vede il fotogramma, non il nero.
        if (info.playerState === 1 && !o.partito) {
          o.partito = performance.now() - o.tempo * 1000;
          setVa(true);
        }
      } catch { /* messaggi d'altro tipo */ }
    };
    window.addEventListener('message', ascolta);
    return () => window.removeEventListener('message', ascolta);
  }, [acceso]);

  useEffect(() => {
    const el = root.current;
    if (!el || !acceso) return;
    const comanda = (func: string, args: unknown[] = []) => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      const o = orologio.current;
      comanda('playVideo');
      if (!o.partito || !o.durata) return;
      const dovrebbe = ((performance.now() - o.partito) / 1000) % o.durata;
      if (Math.abs(dovrebbe - o.tempo) > 4) comanda('seekTo', [dovrebbe, true]);
    }, { rootMargin: '100% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [acceso]);
  const presentati = () => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: trailerKey }), '*');

  return (
    <section ref={root} className={s.trailer} data-sc-act="pin" data-sc-span="3.6" style={{ height: '360vh' }} data-luce="buio" data-film-ancora={film.id} aria-labelledby="trailer-titolo">
      <div className={`sc-stage ${s.palco}`} data-sc-stage>
        <div className={s.schermo}>
          {acceso && (
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
