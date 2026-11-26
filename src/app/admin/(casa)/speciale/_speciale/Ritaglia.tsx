'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import { giudizio, misure as scriviMisure, riquadroIniziale, sposta, tira, type Formato } from '@/services/stampa/formati';
import { anteprima, caricaTela, type Caricata } from './Trascina';
import s from './Speciale.module.css';

type Box = { x: number; y: number; w: number; h: number };

/**
 * Ritagliare e adattare un'immagine senza uscire dal gestionale (26/11/2026,
 * chiesto da Giovanni): si sceglie la proporzione (la consigliata per quel
 * posto è la prima), si sposta il riquadro trascinandolo e lo si allarga
 * tirando l'angolo, oppure si disegna un riquadro nuovo trascinando fuori.
 * «Ritaglia e usa» taglia dall'originale a piena risoluzione e la carica al
 * posto di quella di prima.
 */
export default function Ritaglia({ src, formato, onFatto, onChiudi, onErrore }: {
  src: string;
  formato: Formato;
  onFatto: (c: Caricata) => void;
  onChiudi: () => void;
  onErrore: (m: string) => void;
}) {
  const img = useRef<HTMLImageElement>(null);
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null);
  const [rapporto, setRapporto] = useState(0);
  const [box, setBox] = useState<Box>({ x: 0, y: 0, w: 1, h: 1 });
  const [lavoro, setLavoro] = useState(false);
  const presa = useRef<{ modo: 'sposta' | 'tira'; px: number; py: number; box: Box } | null>(null);
  const r = formato.rapporti[rapporto]?.r ?? 0;
  // L'originale (per TMDB, non l'anteprima piccola): da qui si misura e si taglia.
  const pieno = anteprima(src, 'original');

  // Il riquadro iniziale: il più grande con la proporzione scelta, al centro.
  useEffect(() => {
    if (dim) setBox(riquadroIniziale(dim.w, dim.h, r));
  }, [dim, r]);

  /** Il punto del puntatore in frazioni dell'immagine. */
  const punto = (e: React.PointerEvent) => {
    const q = img.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - q.left) / q.width)), y: Math.min(1, Math.max(0, (e.clientY - q.top) / q.height)) };
  };

  function giu(e: React.PointerEvent, modo: 'sposta' | 'tira' | 'nuovo') {
    if (!dim) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = punto(e);
    if (modo === 'nuovo') {
      const nuovo = { x: p.x, y: p.y, w: 0.05, h: 0.05 };
      setBox(nuovo);
      presa.current = { modo: 'tira', px: p.x, py: p.y, box: nuovo };
      return;
    }
    presa.current = { modo, px: p.x, py: p.y, box };
  }
  function muovi(e: React.PointerEvent) {
    const p0 = presa.current;
    if (!p0 || !dim) return;
    const p = punto(e);
    setBox(p0.modo === 'sposta' ? sposta(p0.box, p.x - p0.px, p.y - p0.py) : tira(p0.box, p.x, p.y, dim.w, dim.h, r));
  }
  const su = () => { presa.current = null; };

  const esce = dim ? { w: Math.round(box.w * dim.w), h: Math.round(box.h * dim.h) } : null;
  const voto = esce ? giudizio(esce.w, esce.h, formato) : null;

  async function usa() {
    if (!dim || !esce) return;
    setLavoro(true);
    try {
      const sorgente = new Image();
      sorgente.crossOrigin = 'anonymous';
      await new Promise<void>((ok, no) => { sorgente.onload = () => ok(); sorgente.onerror = () => no(new Error('Non riesco ad aprire l’originale per ritagliarlo.')); sorgente.src = pieno; });
      const tela = document.createElement('canvas');
      // Oltre 3840 px non serve: si riduce mentre si taglia.
      const k = Math.min(1, 3840 / Math.max(esce.w, esce.h));
      tela.width = Math.round(esce.w * k);
      tela.height = Math.round(esce.h * k);
      const x = tela.getContext('2d')!;
      x.imageSmoothingQuality = 'high';
      x.drawImage(sorgente, box.x * sorgente.naturalWidth, box.y * sorgente.naturalHeight, box.w * sorgente.naturalWidth, box.h * sorgente.naturalHeight, 0, 0, tela.width, tela.height);
      onFatto(await caricaTela(tela, 'ritagliata'));
    } catch (e) {
      onErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setLavoro(false);
    }
  }

  return (
    <Dialog open onClose={() => { if (!lavoro) onChiudi(); }} title="Ritaglia e adatta" showTitle variant="wide">
      <div className={s.taglio}>
        <div className={s.taglioScelte}>
          {formato.rapporti.map((x, i) => (
            <button key={x.nome} type="button" className={s.chip} data-on={i === rapporto ? '' : undefined} onClick={() => setRapporto(i)}>
              {x.nome}{i === 0 && x.r ? ' · consigliata' : ''}
            </button>
          ))}
          <span className={s.taglioMisure} data-bassa={voto && !voto.ok ? '' : undefined}>
            {esce ? `Esce ${scriviMisure(esce.w, esce.h)}${voto && !voto.ok ? ` · bassa, servono almeno ${formato.minimo} px` : ''}` : 'Apro l’originale…'}
          </span>
        </div>
        <div className={s.taglioTela} onPointerMove={muovi} onPointerUp={su} onPointerCancel={su}>
          <div className={s.taglioQuadro}>
            {/* eslint-disable-next-line @next/next/no-img-element -- l'originale da ritagliare */}
            <img ref={img} src={pieno} alt="" crossOrigin="anonymous" draggable={false}
              onLoad={e => setDim({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              onPointerDown={e => giu(e, 'nuovo')} />
            {dim && (
              <div className={s.taglioBox} style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
                onPointerDown={e => giu(e, 'sposta')}>
                <span className={s.taglioAngolo} onPointerDown={e => giu(e, 'tira')} />
              </div>
            )}
          </div>
        </div>
        <p className={s.taglioAiuto}>
          Trascina il riquadro per spostarlo, tira l’angolo in basso a destra per allargarlo, o disegnane uno nuovo trascinando sull’immagine.
          Il taglio parte dall’originale, alla risoluzione piena.
        </p>
        <div className={s.taglioAzioni}>
          <Button variant="ghost" onClick={onChiudi} disabled={lavoro}>Annulla</Button>
          <Button variant="fill" onClick={usa} disabled={lavoro || !dim}>
            {lavoro ? <><Loader2 size={16} className={s.gira} /> Ritaglio…</> : 'Ritaglia e usa'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
