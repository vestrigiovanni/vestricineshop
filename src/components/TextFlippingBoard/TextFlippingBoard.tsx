'use client';

import React, { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import styles from './TextFlippingBoard.module.css';

const FLAP_CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$()-+&=;:'\"%,./?°";

export const BOARD_ROWS = 6;
/** Colonne di serie: su schermi stretti conviene passarne meno. */
export const BOARD_COLS = 22;

const BASE_COL_DELAY = 30;
const BASE_ROW_DELAY = 20;
const BASE_STEP_MS = 55;
const BASE_FLIP_S = 0.35;
const BASE_TOTAL_S =
  ((BOARD_COLS - 1) * BASE_COL_DELAY + (BOARD_ROWS - 1) * BASE_ROW_DELAY + 8 * BASE_STEP_MS) / 1000;

/** Colore che una palette può assumere mentre gira, prima di fermarsi. */
interface AccentColor {
  top: string;
  bottom: string;
  text: string;
}

const ACCENT_COLORS: AccentColor[] = [
  { top: '#dc2626', bottom: '#b91c1c', text: '#ffffff' },
  { top: '#f97316', bottom: '#ea580c', text: '#ffffff' },
  { top: '#facc15', bottom: '#eab308', text: '#171717' },
  { top: '#16a34a', bottom: '#15803d', text: '#ffffff' },
  { top: '#2563eb', bottom: '#1d4ed8', text: '#ffffff' },
  { top: '#7c3aed', bottom: '#6d28d9', text: '#ffffff' },
  { top: '#ffffff', bottom: '#f5f5f5', text: '#171717' },
];

const RESTING = { top: '#171717', bottom: '#171717', text: '#ffffff' };
const FALLING_FLAP = { top: '#262626', text: '#ffffff' };

/** Spazio unificatore: una casella vuota deve restare alta come le altre. */
const NBSP = '\u00a0';

// ── La singola palette ────────────────────────────────────────────────

const FlapCell = React.memo(
  function FlapCell({
    target,
    delay,
    stepMs,
    flipDuration,
  }: {
    target: string;
    delay: number;
    stepMs: number;
    flipDuration: number;
  }) {
    const [current, setCurrent] = useState(' ');
    const [prev, setPrev] = useState(' ');
    const [flipId, setFlipId] = useState(0);
    const [accent, setAccent] = useState<AccentColor | null>(null);
    const [prevAccent, setPrevAccent] = useState<AccentColor | null>(null);
    const curRef = useRef(' ');
    const tgtRef = useRef<string | null>(null);
    const accentRef = useRef<AccentColor | null>(null);
    const startTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const stepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
      if (startTimer.current) clearTimeout(startTimer.current);
      if (stepTimer.current) clearTimeout(stepTimer.current);
      startTimer.current = null;
      stepTimer.current = null;

      const normalized = FLAP_CHARS.includes(target.toUpperCase()) ? target.toUpperCase() : ' ';
      if (normalized === tgtRef.current) return;
      tgtRef.current = normalized;

      if (normalized === ' ' && curRef.current === ' ') return;

      const scrambleCount =
        normalized === ' ' ? 8 + Math.floor(Math.random() * 8) : 25 + Math.floor(Math.random() * 15);

      const runStep = (i: number) => {
        const isLast = i === scrambleCount;
        const ch = isLast
          ? normalized
          : FLAP_CHARS[1 + Math.floor(Math.random() * (FLAP_CHARS.length - 1))];

        const newAccent = isLast
          ? null
          : Math.random() < 0.2
            ? ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)]
            : null;

        setPrev(curRef.current);
        setPrevAccent(accentRef.current);
        curRef.current = ch;
        accentRef.current = newAccent;
        setCurrent(ch);
        setAccent(newAccent);
        setFlipId(n => n + 1);

        if (!isLast) {
          stepTimer.current = setTimeout(() => runStep(i + 1), stepMs);
        }
      };

      startTimer.current = setTimeout(() => runStep(1), delay);

      return () => {
        if (startTimer.current) clearTimeout(startTimer.current);
        if (stepTimer.current) clearTimeout(stepTimer.current);
        startTimer.current = null;
        stepTimer.current = null;
        tgtRef.current = null;
      };
    }, [target, delay, stepMs]);

    const show = current === ' ' ? NBSP : current;
    const showPrev = prev === ' ' ? NBSP : prev;

    const topBg = accent?.top ?? RESTING.top;
    const bottomBg = accent?.bottom ?? RESTING.bottom;
    const textColor = accent?.text ?? RESTING.text;
    const flapTopBg = prevAccent?.top ?? FALLING_FLAP.top;
    const flapTextColor = prevAccent?.text ?? FALLING_FLAP.text;

    const bottomDelay = flipDuration * 0.5;

    return (
      <div className={styles.cell}>
        <div className={styles.flapArea}>
          <div className={styles.hinge} aria-hidden="true">
            <div className={`${styles.hingePin} ${styles.hingePinLeft}`} />
            <div className={styles.hingeLine} />
            <div className={`${styles.hingePin} ${styles.hingePinRight}`} />
          </div>

          {/* Metà alta ferma: il carattere nuovo */}
          <div className={styles.staticTop} style={{ background: topBg }}>
            <div className={`${styles.text} ${styles.textTop}`} style={{ color: textColor }}>
              {show}
            </div>
          </div>

          {/* Metà bassa ferma: il carattere nuovo */}
          <div className={styles.staticBottom} style={{ background: bottomBg }}>
            <div
              className={`${styles.text} ${styles.textBottom}`}
              style={{ color: textColor }}
            >
              {show}
            </div>
            {flipId > 0 && (
              <motion.div
                key={`s${flipId}`}
                className={`${styles.shine} ${styles.shineSettle}`}
                initial={{ opacity: 0.5 }}
                animate={{ opacity: 0 }}
                transition={{ duration: flipDuration * 1.3, ease: 'easeOut' }}
              />
            )}
          </div>

          {/* Palettina che cade: metà alta del carattere vecchio */}
          {flipId > 0 && (
            <motion.div
              key={flipId}
              className={styles.flapTop}
              style={{ background: flapTopBg }}
              initial={{ rotateX: 0 }}
              animate={{ rotateX: -100 }}
              transition={{ duration: flipDuration, ease: [0.55, 0.055, 0.675, 0.19] }}
            >
              <div
                className={`${styles.text} ${styles.textTop}`}
                style={{ color: flapTextColor }}
              >
                {showPrev}
              </div>
              <motion.div
                className={`${styles.shine} ${styles.shineFalling}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.6 }}
                transition={{ duration: flipDuration }}
              />
            </motion.div>
          )}

          {/* Palettina che sale: metà bassa del carattere nuovo */}
          {flipId > 0 && (
            <motion.div
              key={`b${flipId}`}
              className={styles.flapBottom}
              style={{ background: bottomBg }}
              initial={{ rotateX: 90 }}
              animate={{ rotateX: 0 }}
              transition={{
                duration: flipDuration * 0.85,
                delay: bottomDelay,
                ease: [0.33, 1.55, 0.64, 1],
              }}
            >
              <div
                className={`${styles.text} ${styles.textBottom}`}
                style={{ color: textColor }}
              >
                {show}
              </div>
              <motion.div
                className={`${styles.shine} ${styles.shineRising}`}
                initial={{ opacity: 0.4 }}
                animate={{ opacity: 0 }}
                transition={{ duration: flipDuration * 0.85, delay: bottomDelay }}
              />
            </motion.div>
          )}

          <div className={styles.splitLine} />
        </div>

        <div className={styles.stripes} aria-hidden="true" />
      </div>
    );
  },
  (prevProps, nextProps) =>
    prevProps.target === nextProps.target &&
    prevProps.delay === nextProps.delay &&
    prevProps.stepMs === nextProps.stepMs &&
    prevProps.flipDuration === nextProps.flipDuration
);

// ── Casella colorata ──────────────────────────────────────────────────

const COLOR_MAP: Record<string, string> = {
  '{R}': '#D32F2F',
  '{O}': '#F57C00',
  '{Y}': '#FBC02D',
  '{G}': '#43A047',
  '{B}': '#1E88E5',
  '{V}': '#8E24AA',
  '{W}': '#FAFAFA',
};

const ColorCell = React.memo(function ColorCell({ color }: { color: string }) {
  return <div className={styles.colorCell} style={{ backgroundColor: color }} />;
});

// ── Lettura di una riga ───────────────────────────────────────────────

type ParsedCell = { type: 'char'; value: string } | { type: 'color'; hex: string };

/**
 * Le palette hanno un alfabeto fisso e senza accenti: "El Paraíso" perdeva la
 * í e diventava "EL PARA SO". Qui gli accenti si sciolgono nella lettera base
 * prima di finire in griglia.
 */
function stripAccents(input: string): string {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function parseRow(row: string): ParsedCell[] {
  const cells: ParsedCell[] = [];
  let i = 0;
  while (i < row.length) {
    if (row[i] === '{' && i + 2 < row.length && row[i + 2] === '}') {
      const code = row.substring(i, i + 3);
      if (COLOR_MAP[code]) {
        cells.push({ type: 'color', hex: COLOR_MAP[code] });
        i += 3;
        continue;
      }
    }
    cells.push({ type: 'char', value: row[i] });
    i++;
  }
  return cells;
}

// ── A capo automatico ─────────────────────────────────────────────────

function wrapParagraph(paragraph: string, maxCols: number): string[] {
  const lines: string[] = [];
  const words = paragraph.split(/[ \t]+/).filter(Boolean);
  let currentLine = '';

  for (const word of words) {
    if (word.length > maxCols) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }
      lines.push(word.slice(0, maxCols));
      continue;
    }

    if (!currentLine) {
      currentLine = word;
    } else if (currentLine.length + 1 + word.length <= maxCols) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

function wrapText(input: string, maxCols: number): string[] {
  return input
    .split('\n')
    .flatMap(paragraph => (paragraph.trim() === '' ? [''] : wrapParagraph(paragraph, maxCols)));
}

// ── Il tabellone ──────────────────────────────────────────────────────

export interface TextFlippingBoardProps {
  /** Quante caselle per riga. Meno colonne = caselle più grandi. */
  cols?: number;
  /** Etichetta di ogni riga: la rende cliccabile e leggibile a voce. */
  rowLabels?: string[];
  /** Cosa fare quando si tocca una riga. */
  onRowSelect?: (rowIndex: number) => void;
  /** Righe già impaginate: restano allineate a sinistra, colonna per colonna. */
  rows?: string[];
  /** Testo libero: va a capo da solo e si centra sul tabellone. */
  text?: string;
  className?: string;
  /** Durata totale dell'animazione, in secondi. Circa 1,2s di default. */
  duration?: number;
  /** Etichetta per chi non vede il tabellone. */
  ariaLabel?: string;
}

export default function TextFlippingBoard({
  rows,
  text,
  className = '',
  duration = BASE_TOTAL_S,
  ariaLabel,
  rowLabels,
  onRowSelect,
  cols = BOARD_COLS,
}: TextFlippingBoardProps) {
  const scale = duration / BASE_TOTAL_S;
  const colDelay = BASE_COL_DELAY * scale;
  const rowDelay = BASE_ROW_DELAY * scale;
  const stepMs = BASE_STEP_MS * scale;
  const flipDur = Math.min(0.6, Math.max(0.15, BASE_FLIP_S * scale));

  const board = useMemo(() => {
    const grid: ParsedCell[][] = Array.from({ length: BOARD_ROWS }, () =>
      Array.from({ length: cols }, () => ({ type: 'char' as const, value: ' ' }))
    );

    if (text) {
      const lines = wrapText(stripAccents(text), cols).slice(0, BOARD_ROWS);
      const startRow = Math.max(0, Math.floor((BOARD_ROWS - lines.length) / 2));
      lines.forEach((line, i) => {
        const row = startRow + i;
        if (row >= BOARD_ROWS) return;
        const parsed = parseRow(line);
        const startCol = Math.max(0, Math.floor((cols - parsed.length) / 2));
        parsed.forEach((cell, c) => {
          if (startCol + c < cols) grid[row][startCol + c] = cell;
        });
      });
    } else if (rows) {
      rows.forEach((row, r) => {
        if (r >= BOARD_ROWS) return;
        const parsed = parseRow(stripAccents(row));
        parsed.forEach((cell, c) => {
          if (c < cols) grid[r][c] = cell;
        });
      });
    }

    return grid;
  }, [rows, text, cols]);

  const gridStyle: CSSProperties = { gridTemplateColumns: `repeat(${cols}, 1fr)` };

  const renderCells = (row: ParsedCell[], r: number) =>
    row.map((cell, c) =>
      cell.type === 'color' ? (
        <ColorCell key={`${r}-${c}`} color={cell.hex} />
      ) : (
        <FlapCell
          key={`${r}-${c}`}
          target={cell.value}
          delay={c * colDelay + r * rowDelay}
          stepMs={stepMs}
          flipDuration={flipDur}
        />
      )
    );

  return (
    <div
      className={`${styles.board} ${className}`.trim()}
      style={{ '--board-cols': cols } as CSSProperties}
      aria-label={ariaLabel}
      role="group"
    >
      {board.map((row, r) => {
        const label = rowLabels?.[r];
        // Riga vuota o senza destinazione: resta decorativa, non cliccabile.
        if (!onRowSelect || !label) {
          return (
            <div key={r} className={styles.row} style={gridStyle} aria-hidden="true">
              {renderCells(row, r)}
            </div>
          );
        }
        return (
          <button
            key={r}
            type="button"
            className={`${styles.row} ${styles.rowClickable}`}
            style={gridStyle}
            onClick={() => onRowSelect(r)}
            aria-label={label}
          >
            {renderCells(row, r)}
          </button>
        );
      })}
    </div>
  );
}
