'use client';

/**
 * IL TABELLONE — cento film in faccia, da guardare e sfoltire.
 *
 * Le corsie tematiche rispondono a "cosa mi consigli?". Il tabellone risponde a
 * una domanda diversa e più veloce: "fammi vedere cos'ho". Cento locandine
 * insieme si scorrono in mezzo minuto, e riconoscere un film che si vuole
 * proiettare è un colpo d'occhio, non una ricerca.
 *
 * IL GIRO — scegli quelli che ti piacciono, premi **Aggiorna**, e i cento
 * cambiano *tranne i tuoi*. Si fanno più giri finché la lista è quella giusta.
 * È l'unica ragione per cui `keep` esiste: un tabellone che rimescolasse anche
 * le scelte fatte costringerebbe a ricominciare a ogni giro, ed è esattamente
 * ciò che rendeva lento scegliere i film.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dices, Loader2, Search, Sparkles, X } from 'lucide-react';
import styles from './Programmazione.module.css';
import { planningCatalogBoard } from '@/actions/planningActions';
import FilmCard from './FilmCard';
import type { CatalogItem, Pick } from './types';

interface Props {
  picks: Map<string, Pick>;
  onToggle: (film: CatalogItem) => void;
  /** Quanti film mostrare per giro. */
  size?: number;
}

export default function StepBoard({ picks, onToggle, size = 100 }: Props) {
  const [films, setFilms] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [onlyNever, setOnlyNever] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  /**
   * I film già scelti restano in cima a ogni giro.
   *
   * Si legge dalle `picks` al momento della richiesta e **non** si mette fra le
   * dipendenze: altrimenti ogni spunta rifarebbe il tabellone da capo, e le
   * locandine ballerebbero sotto il dito di chi le sta scegliendo.
   */
  const keepRef = useRef<string[]>([]);
  keepRef.current = [...picks.keys()];

  const load = useCallback(async (nextSeed: number) => {
    setLoading(true);
    try {
      const rows = await planningCatalogBoard({
        count: size,
        seed: nextSeed,
        keep: keepRef.current,
        onlyNever,
        search: debounced || undefined,
      });
      setFilms(rows as unknown as CatalogItem[]);
    } catch (e) {
      console.error('[Programmazione] tabellone', e);
    } finally {
      setLoading(false);
    }
  }, [size, onlyNever, debounced, keepRef]);

  useEffect(() => { load(seed); }, [load, seed]);

  const chosen = films.filter((f) => f.tmdbId && picks.has(f.tmdbId)).length;

  return (
    <section className={styles.boardWrap}>
      <header className={styles.boardBar}>
        <div className={styles.boardTitle}>
          <b><Sparkles size={15} /> Il tabellone</b>
          <span>
            {loading ? 'Pesco dalla libreria…' : `${films.length} film dalla tua libreria`}
            {chosen > 0 && ` · ${chosen} scelt${chosen === 1 ? 'o' : 'i'} qui`}
          </span>
        </div>

        <label className={styles.searchBox}>
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca fra questi…"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Pulisci">
              <X size={14} />
            </button>
          )}
        </label>

        <label className={styles.checkField}>
          <input type="checkbox" checked={onlyNever} onChange={(e) => setOnlyNever(e.target.checked)} />
          Mai programmati
        </label>

        <button
          type="button"
          className={styles.ghostBtn}
          onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}
          disabled={loading}
          title="Cambia i film che non hai scelto: i tuoi restano"
        >
          {loading ? <Loader2 size={16} className={styles.spin} /> : <Dices size={16} />} Aggiorna
        </button>
      </header>

      {loading && films.length === 0 ? (
        <p className={styles.emptyNote}><Loader2 size={15} className={styles.spin} /> Un momento…</p>
      ) : films.length === 0 ? (
        <p className={styles.emptyNote}>
          Nessun film in libreria con questi filtri. Se il catalogo è vuoto, lancia
          <code> npm run plex:sync</code> dal Mac del cinema.
        </p>
      ) : (
        <div className={styles.filmGrid}>
          {films.map((f) => (
            <FilmCard
              key={f.id}
              film={f}
              selected={Boolean(f.tmdbId && picks.has(f.tmdbId))}
              onClick={() => onToggle(f)}
            />
          ))}
        </div>
      )}

      <p className={styles.boardHint}>
        I film che scegli restano in cima anche dopo l&apos;aggiornamento: puoi fare più giri
        senza perdere quelli che ti erano piaciuti.
      </p>
    </section>
  );
}
