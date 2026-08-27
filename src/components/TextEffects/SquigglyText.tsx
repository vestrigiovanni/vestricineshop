'use client';

import { CSSProperties, ReactNode, useId, useMemo } from 'react';
import { motion, useTime, useTransform } from 'framer-motion';
import styles from './TextEffects.module.css';

export interface SquigglyTextProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Quanti fotogrammi di deformazione si alternano. */
  steps?: number;
  /** Millisecondi fra un filtro e il successivo. */
  stepDuration?: number;
  /** Spostamento massimo in pixel: più alto, più ondeggia. */
  scale?: number | [number, number];
  baseFrequency?: number;
  numOctaves?: number;
  as?: 'span' | 'div';
}

export default function SquigglyText({
  children,
  steps = 5,
  stepDuration = 80,
  scale = [6, 8],
  baseFrequency = 0.02,
  numOctaves = 3,
  as = 'span',
  className = '',
  style,
}: SquigglyTextProps) {
  const reactId = useId();
  // useId produce ":" e "_", che in url(#…) non sono validi.
  const safeId = reactId.replace(/[:_]/g, '');

  const filters = useMemo(
    () => Array.from({ length: steps }, (_, i) => `url(#squiggly-${safeId}-${i})`),
    [steps, safeId]
  );

  const time = useTime();
  const filter = useTransform(time, t => filters[Math.floor(t / stepDuration) % filters.length]);

  const scaleAt = (i: number) => (Array.isArray(scale) ? scale[i % scale.length] : scale);

  const Wrapper = as === 'div' ? motion.div : motion.span;

  return (
    <Wrapper style={{ filter, ...style }} className={`${styles.squiggly} ${className}`.trim()}>
      <svg aria-hidden className={styles.squigglyDefs} xmlns="http://www.w3.org/2000/svg">
        <defs>
          {Array.from({ length: steps }).map((_, i) => (
            <filter id={`squiggly-${safeId}-${i}`} key={i}>
              <feTurbulence
                baseFrequency={baseFrequency}
                numOctaves={numOctaves}
                result="noise"
                seed={i}
              />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale={scaleAt(i)} />
            </filter>
          ))}
        </defs>
      </svg>
      {children}
    </Wrapper>
  );
}
