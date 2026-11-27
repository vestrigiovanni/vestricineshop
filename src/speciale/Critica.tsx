'use client';

/* eslint-disable @next/next/no-img-element */
import { useRef, type CSSProperties } from 'react';
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react';

/**
 * Una frase della critica che si accende scorrendo (dalla v1, 25 novembre 2026).
 *
 * Il movimento segue la pagina, non un orologio: `p` va da 0 (la schermata
 * della frase entra dal basso) a 1 (è uscita in alto), 0,5 è la frase al
 * centro. Le parole si accendono una dopo l'altra mentre la frase sale, la
 * firma arriva per ultima, poi tutto sfuma verso l'alto mentre arriva la
 * frase dopo. Il fotogramma dietro resta fermo: si muove solo il testo, e solo
 * con opacità e spostamento, le due cose che costano meno anche nel Firefox di
 * Gio che disegna col processore. Con «riduci movimento» non si muove niente.
 */
export function Critica({ testo, fonte, critico, logo, fondale, misure, style, trailer }: {
  testo: string;
  fonte: string;
  critico?: string;
  /** Il logo ufficiale della testata, se l'abbiamo (loghiStampa.ts). */
  logo: string | null;
  fondale: string;
  misure?: string;
  style?: CSSProperties;
  /** Col carattere del trailer. */
  trailer: boolean;
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
    <figure ref={ref} className="sp-citazione" data-trailer={trailer ? '' : undefined} style={style}>
      <img className="sp-fondale" src={fondale} srcSet={misure} sizes="100vw" alt="" loading="lazy" decoding="async" />
      <div className="sp-citazione__buio" />
      <motion.blockquote className="sp-citazione__frase" style={fermo ? undefined : { opacity: opacita, y: sale }}>
        <p aria-label={`“${testo}”`}>
          {parole.map((parola, i) => (
            <Parola key={i} p={p} i={i} n={parole.length} fermo={!!fermo}>{parola}</Parola>
          ))}
        </p>
      </motion.blockquote>
      <motion.figcaption className="sp-citazione__fonte" style={fermo ? undefined : { opacity: firmaOpacita, y: firmaSale }}>
        {/* Come nel trailer: «NOME, testata»; la testata col suo logo ufficiale, se l'abbiamo. */}
        {critico && <span>{critico}{fonte ? ', ' : ''}</span>}
        {logo
          ? <img src={logo} alt={fonte} className="sp-testata" />
          : fonte && <span className="sp-testata--scritta">{fonte}</span>}
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
      <motion.span aria-hidden className="sp-parola" style={fermo ? undefined : { opacity, y }}>{children}</motion.span>
    </>
  );
}
