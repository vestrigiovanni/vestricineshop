'use client';

import { useRef } from 'react';
import type { Posto } from '@/components/Home/proiezioneSpeciale';
import { anteprima } from './Trascina';
import s from './Speciale.module.css';

interface Props {
  src: string;
  w: number;
  h: number;
  posto: Posto;
  periodo: string;
  onCambia: (p: Posto) => void;
}

const giro = (n: number) => Math.round(n * 100) / 100;
const fra = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

/**
 * Dove il sito scrive le date del cinema su un banner o sulla locandina. Il
 * riquadro si trascina per spostarlo e si allarga dall'angolo in basso a
 * destra; le misure sono in percentuale dell'immagine, così valgono a ogni
 * larghezza dello schermo. Dentro c'è già il testo come uscirà sul sito.
 */
export default function Riquadro({ src, w, h, posto, periodo, onCambia }: Props) {
  const tela = useRef<HTMLDivElement>(null);

  function trascina(e: React.PointerEvent, modo: 'sposta' | 'allarga') {
    e.preventDefault();
    e.stopPropagation();
    const r = tela.current!.getBoundingClientRect();
    const x0 = e.clientX, y0 = e.clientY, p0 = posto;
    const muovi = (ev: PointerEvent) => {
      const dx = ((ev.clientX - x0) / r.width) * 100, dy = ((ev.clientY - y0) / r.height) * 100;
      if (modo === 'sposta') onCambia({ ...p0, x: giro(fra(p0.x + dx, 0, 100 - p0.w)), y: giro(fra(p0.y + dy, 0, 100 - p0.h)) });
      else onCambia({ ...p0, w: giro(fra(p0.w + dx, 4, 100 - p0.x)), h: giro(fra(p0.h + dy, 2, 100 - p0.y)) });
    };
    const fine = () => { removeEventListener('pointermove', muovi); removeEventListener('pointerup', fine); };
    addEventListener('pointermove', muovi);
    addEventListener('pointerup', fine);
  }

  const verticale = h > w;
  return (
    <div ref={tela} className={s.tela} style={{ aspectRatio: `${w} / ${h}`, width: `min(100%, 760px, calc(70vh * ${w / h}))` }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- anteprima del gestionale */}
      <img src={anteprima(src, 'w1280')} alt="" draggable={false} />
      <div
        className={s.riquadro}
        data-cornice={posto.riquadro ? '' : undefined}
        data-verticale={verticale ? '' : undefined}
        style={{ left: `${posto.x}%`, top: `${posto.y}%`, width: `${posto.w}%`, height: `${posto.h}%` }}
        onPointerDown={e => trascina(e, 'sposta')}
        title="Trascina per spostare le date"
      >
        <b>Proiezione speciale</b>
        <span>{periodo}</span>
        <i className={s.maniglia} onPointerDown={e => trascina(e, 'allarga')} title="Trascina per allargare" />
      </div>
    </div>
  );
}
