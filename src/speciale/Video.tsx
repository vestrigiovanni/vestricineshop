'use client';

import { useEffect, useRef } from 'react';

/**
 * Il trailer verticale dell'intermezzo: muto, a ciclo. Parte solo quando è in
 * vista e si ferma appena esce: un video che gira fuori schermo, col
 * processore, ruba fotogrammi a tutta la pagina. Con «riduci movimento» resta
 * fermo sul suo fotogramma, coi comandi, e lo si avvia a mano.
 */
export default function Video({ src, poster, titolo }: { src: string; poster?: string; titolo: string }) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.controls = true; return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) el.play().catch(() => {}); else el.pause();
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <video ref={video} className="sp-video" src={src} poster={poster} muted loop playsInline preload="none"
      aria-label={`Il trailer di ${titolo}, senza audio`} />
  );
}
