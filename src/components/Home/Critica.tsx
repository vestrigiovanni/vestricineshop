'use client';

import { useRef, type CSSProperties, type ReactNode } from 'react';
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react';
import s from './Speciale.module.css';

/**
 * Una frase della critica che si accende scorrendo (Motion, 25 novembre 2026).
 *
 * Il movimento segue la pagina, non un orologio: `p` va da 0 (la schermata
 * della frase entra dal basso) a 1 (è uscita in alto), 0,5 è la frase al
 * centro. Le parole si accendono una dopo l'altra mentre la frase sale, la
 * firma arriva per ultima, poi tutto sfuma verso l'alto mentre arriva la
 * frase dopo. Il fotogramma dietro resta fermo: si muove solo il testo, e solo
 * con opacità e spostamento, le due cose che costano meno anche nel Firefox di
 * Giovanni che disegna col processore.
 *
 * Nel modo leggero (`data-leggero`) le parole restano accese e sfuma solo la
 * frase intera; con «riduci movimento» non si muove niente.
 */
export function Critica({ testo, firma, className, style, fondale }: {
  testo: string;
  firma: ReactNode;
  className: string;
  style?: CSSProperties;
  fondale: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const fermo = useReducedMotion();
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ['start end', 'end start'] });

  // La frase intera: entra, resta al centro, se ne va salendo piano.
  const opacita = useTransform(p, [0.14, 0.34, 0.6, 0.8], [0, 1, 1, 0]);
  const sale = useTransform(p, [0, 0.5, 1], ['9vh', '0vh', '-9vh']);
  // La firma arriva quando la frase è quasi tutta accesa.
  const firmaOpacita = useTransform(p, [0.38, 0.48, 0.6, 0.78], [0, 1, 1, 0]);
  const firmaSale = useTransform(p, [0.38, 0.48], ['0.8em', '0em']);

  const parole = `“${testo}”`.split(/\s+/);

  return (
    <figure ref={ref} className={className} data-trailer={style ? '' : undefined} style={style}>
      {fondale}
      <div className={s.buio} />
      <motion.blockquote className={s.frase} style={fermo ? undefined : { opacity: opacita, y: sale }}>
        <p aria-label={`“${testo}”`}>
          {parole.map((parola, i) => (
            <Parola key={i} p={p} i={i} n={parole.length} fermo={!!fermo}>{parola}</Parola>
          ))}
        </p>
      </motion.blockquote>
      <motion.figcaption className={s.fonte} style={fermo ? undefined : { opacity: firmaOpacita, y: firmaSale }}>
        {firma}
      </motion.figcaption>
    </figure>
  );
}

/** Una parola: da quasi spenta e un po' più giù, a accesa e al suo posto, nel suo tratto di scorrimento. */
function Parola({ p, i, n, fermo, children }: { p: MotionValue<number>; i: number; n: number; fermo: boolean; children: string }) {
  // Le parole si accendono fra 0,16 e 0,46: ognuna parte un po' dopo la precedente.
  const da = 0.16 + (i / Math.max(n, 1)) * 0.2;
  const a = da + 0.1;
  const opacity = useTransform(p, [da, a], [0.12, 1]);
  const y = useTransform(p, [da, a], ['0.22em', '0em']);
  return (
    <>
      {i > 0 && ' '}
      <motion.span aria-hidden className={s.parola} style={fermo ? undefined : { opacity, y }}>{children}</motion.span>
    </>
  );
}
