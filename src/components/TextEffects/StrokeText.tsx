'use client';

import { CSSProperties, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import styles from './TextEffects.module.css';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface StrokeTextProps {
  text: string;
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
  /** Secondi che ogni lettera impiega a disegnarsi. */
  drawDuration?: number;
  /** Attesa, in secondi, prima che il riempimento parta. */
  fillDelay?: number;
  /** Ritardo fra una lettera e la successiva. */
  stagger?: number;
  fillMode?: 'fade' | 'wipe' | 'none';
  fontSize?: number;
  fontWeight?: number | string;
  letterSpacing?: number;
  /** Disegna partendo dall'ultima lettera. */
  reverse?: boolean;
  className?: string;
  style?: CSSProperties;
}

const easeDraw: [number, number, number, number] = [0.22, 1, 0.36, 1];

/**
 * Il titolo scritto a contorno, che poi si riempie.
 *
 * L'originale muove i tratti con GSAP; qui l'animazione è di framer-motion —
 * già in casa — così non entra un'altra libreria solo per questo.
 */
export default function StrokeText({
  text,
  strokeColor = '#A78BFA',
  fillColor = '#F8FAFC',
  strokeWidth = 1.4,
  drawDuration = 1.6,
  fillDelay = 0.2,
  stagger = 0.05,
  fillMode = 'wipe',
  fontSize = 128,
  fontWeight = 800,
  letterSpacing = -4,
  reverse = false,
  className = '',
  style,
}: StrokeTextProps) {
  const strokeTextRef = useRef<SVGTextElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const reduced = useReducedMotion() ?? false;

  const rawId = useId();
  const wipeId = `stroke-text-wipe-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const characters = useMemo(() => Array.from(String(text ?? '')), [text]);
  const dash = Math.max(fontSize * 7, 200);

  const fontStyle: CSSProperties = useMemo(
    () => ({
      fontSize: `${fontSize}px`,
      fontWeight,
      letterSpacing: `${letterSpacing}px`,
    }),
    [fontSize, fontWeight, letterSpacing]
  );

  // Il viewBox si prende dalla misura reale delle lettere: senza, il testo
  // esce dal riquadro appena cambia font o titolo.
  useLayoutEffect(() => {
    const node = strokeTextRef.current;
    if (!node) return undefined;

    let cancelled = false;

    const measure = () => {
      if (cancelled || !strokeTextRef.current) return;
      let bbox: DOMRect;
      try {
        bbox = strokeTextRef.current.getBBox();
      } catch {
        return;
      }
      if (!bbox || !bbox.width) return;

      const pad = Math.max(Number(strokeWidth) || 1, fontSize * 0.1);
      const next: Box = {
        x: bbox.x - pad,
        y: bbox.y - pad,
        width: bbox.width + pad * 2,
        height: bbox.height + pad * 2,
      };

      setBox(prev =>
        prev &&
        Math.abs(prev.x - next.x) < 0.5 &&
        Math.abs(prev.width - next.width) < 0.5 &&
        Math.abs(prev.y - next.y) < 0.5
          ? prev
          : next
      );
    };

    measure();
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(measure).catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [characters, fontSize, fontWeight, letterSpacing, strokeWidth]);

  const viewBox = box
    ? `${box.x} ${box.y} ${box.width} ${box.height}`
    : `0 ${-fontSize} 600 ${fontSize * 1.3}`;

  const fillEnabled = fillMode !== 'none';
  const useWipe = fillEnabled && fillMode === 'wipe';
  const fillDuration = Math.max(0.4, drawDuration * 0.5);
  const delayOf = (index: number) =>
    (reverse ? characters.length - 1 - index : index) * stagger;

  return (
    <span
      className={`${styles.strokeText} ${className}`.trim()}
      style={{ ...style, '--stroke-text-height': `${Math.round(fontSize * 1.3)}px` } as CSSProperties}
      role="img"
      aria-label={String(text ?? '')}
    >
      <svg
        className={styles.strokeSvg}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        {useWipe && box && (
          <defs>
            <clipPath id={wipeId} clipPathUnits="userSpaceOnUse">
              <motion.rect
                x={box.x}
                y={box.y}
                height={box.height}
                initial={{ width: reduced ? box.width : 0 }}
                animate={{ width: box.width }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : {
                        duration: fillDuration,
                        delay: drawDuration + fillDelay,
                        ease: 'easeInOut',
                      }
                }
              />
            </clipPath>
          </defs>
        )}

        <text
          ref={strokeTextRef}
          x="0"
          y="0"
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={fontStyle}
        >
          {characters.map((char, index) => (
            <motion.tspan
              key={`s-${index}`}
              style={{ strokeDasharray: dash }}
              initial={{ strokeDashoffset: reduced ? 0 : dash }}
              animate={{ strokeDashoffset: 0 }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { duration: drawDuration, delay: delayOf(index), ease: easeDraw }
              }
            >
              {char}
            </motion.tspan>
          ))}
        </text>

        <text
          x="0"
          y="0"
          fill={fillColor}
          stroke="none"
          style={fontStyle}
          clipPath={useWipe && box ? `url(#${wipeId})` : undefined}
        >
          {characters.map((char, index) => (
            <motion.tspan
              key={`f-${index}`}
              initial={{ opacity: useWipe ? 1 : reduced ? 1 : 0 }}
              animate={{ opacity: fillEnabled ? 1 : 0 }}
              transition={
                reduced || useWipe
                  ? { duration: 0 }
                  : {
                      duration: fillDuration,
                      delay: drawDuration + fillDelay + delayOf(index),
                      ease: 'easeOut',
                    }
              }
            >
              {char}
            </motion.tspan>
          ))}
        </text>
      </svg>
    </span>
  );
}
