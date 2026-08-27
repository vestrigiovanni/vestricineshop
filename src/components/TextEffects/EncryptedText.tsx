'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView } from 'framer-motion';
import styles from './TextEffects.module.css';

interface EncryptedTextProps {
  text: string;
  className?: string;
  /** Millisecondi fra un carattere svelato e il successivo. */
  revealDelayMs?: number;
  /** Alfabeto usato per il rumore. */
  charset?: string;
  /** Ogni quanto cambiano i caratteri non ancora svelati. */
  flipDelayMs?: number;
  encryptedClassName?: string;
  revealedClassName?: string;
}

const DEFAULT_CHARSET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-={}[];:,.<>/?';

function generateRandomCharacter(charset: string): string {
  return charset.charAt(Math.floor(Math.random() * charset.length));
}

function generateGibberishPreservingSpaces(original: string, charset: string): string {
  if (!original) return '';
  let result = '';
  for (let i = 0; i < original.length; i += 1) {
    result += original[i] === ' ' ? ' ' : generateRandomCharacter(charset);
  }
  return result;
}

export default function EncryptedText({
  text,
  className = '',
  revealDelayMs = 50,
  charset = DEFAULT_CHARSET,
  flipDelayMs = 50,
  encryptedClassName = '',
  revealedClassName = '',
}: EncryptedTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  // Prima che l'effetto parta si mostra il titolo vero: il rumore nasce da
  // `Math.random`, e generarlo già in SSR faceva scrivere al server lettere
  // diverse da quelle del browser (errore di idratazione).
  const [started, setStarted] = useState(false);
  const [revealCount, setRevealCount] = useState(0);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const lastFlipTimeRef = useRef(0);
  const scrambleCharsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!isInView) return;

    const initial = text ? generateGibberishPreservingSpaces(text, charset) : '';
    scrambleCharsRef.current = initial.split('');
    setStarted(true);
    startTimeRef.current = performance.now();
    lastFlipTimeRef.current = startTimeRef.current;
    setRevealCount(0);

    let isCancelled = false;

    const update = (now: number) => {
      if (isCancelled) return;

      const elapsedMs = now - startTimeRef.current;
      const totalLength = text.length;
      const currentRevealCount = Math.min(
        totalLength,
        Math.floor(elapsedMs / Math.max(1, revealDelayMs))
      );

      setRevealCount(currentRevealCount);

      if (currentRevealCount >= totalLength) return;

      if (now - lastFlipTimeRef.current >= Math.max(0, flipDelayMs)) {
        for (let index = 0; index < totalLength; index += 1) {
          if (index >= currentRevealCount) {
            scrambleCharsRef.current[index] =
              text[index] === ' ' ? ' ' : generateRandomCharacter(charset);
          }
        }
        lastFlipTimeRef.current = now;
      }

      animationFrameRef.current = requestAnimationFrame(update);
    };

    animationFrameRef.current = requestAnimationFrame(update);

    return () => {
      isCancelled = true;
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isInView, text, revealDelayMs, charset, flipDelayMs]);

  if (!text) return null;

  return (
    <span ref={ref} className={className} aria-label={text}>
      {text.split('').map((char, index) => {
        const isRevealed = !started || index < revealCount;
        const displayChar = isRevealed
          ? char
          : char === ' '
            ? ' '
            : (scrambleCharsRef.current[index] ?? generateRandomCharacter(charset));

        return (
          <span
            key={index}
            aria-hidden="true"
            className={isRevealed ? revealedClassName : `${styles.encrypted} ${encryptedClassName}`}
          >
            {displayChar}
          </span>
        );
      })}
    </span>
  );
}
