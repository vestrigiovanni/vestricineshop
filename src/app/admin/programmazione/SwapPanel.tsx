'use client';

/**
 * CAMBIA FILM — il pannello del secondo clic.
 *
 * Il primo clic è il ⇄ sulla card. Questo è il secondo: le locandine che
 * potrebbero prendere quel posto, e una di loro lo prende.
 *
 * NON È IL CATALOGO — qui non si cerca fra novecento titoli, si guarda cosa ci
 * sta *lì*. Un film più lungo dello spazio disponibile andrebbe a sbattere
 * contro lo spettacolo successivo, quindi non compare affatto; e l'ordine viene
 * dall'affinità con la fascia, perché alle 22:30 e alle 10:30 non ha senso
 * proporre la stessa lista. È la differenza fra "scegli un film" e "risolvi
 * questo slot", ed è tutta la ragione per cui cambiare film ora costa due clic.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Dices, Loader2, Replace, X } from 'lucide-react';
import styles from './Programmazione.module.css';
import { planningAlternatives } from '@/actions/planningActions';
import { BAND_LABELS, type Band } from '@/services/scheduling/times';
import FilmCard from './FilmCard';
import type { CatalogItem } from './types';

export interface SwapTarget {
  /** Lo spettacolo da cui si è partiti. */
  key: string;
  title: string;
  time: string;
  day: string;
  band: Band;
  tmdbId: string;
  /** Quanto può durare al massimo il film che prende questo posto. */
  maxRuntime: number;
  /** Quanti spettacoli ha in tutto questo film nel piano. */
  occurrences: number;
}

interface Props {
  target: SwapTarget;
  /** I film già nel piano: riproporli creerebbe un doppione. */
  exclude: string[];
  busy: boolean;
  onClose: () => void;
  /** `all` = cambia tutti gli spettacoli di quel film, non solo questo. */
  onSwap: (film: CatalogItem, scope: 'one' | 'all') => void;
}

export default function SwapPanel({ target, exclude, busy, onClose, onSwap }: Props) {
  const [films, setFilms] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [seed, setSeed] = useState(0);
  /**
   * Di default si cambia **tutto il film**, non il singolo spettacolo.
   *
   * Chi apre questo pannello di solito ha in mente "questo film non mi piace",
   * non "questa replica delle 16:10 non mi piace": sostituirne una sola
   * lascerebbe le altre cinque dov'erano e costringerebbe a rifare il giro
   * cinque volte. Il singolo resta a un clic di distanza per quando serve.
   */
  const [scope, setScope] = useState<'one' | 'all'>(target.occurrences > 1 ? 'all' : 'one');

  const load = useCallback(async (nextSeed: number) => {
    setLoading(true);
    try {
      const rows = await planningAlternatives({
        band: target.band,
        maxRuntime: target.maxRuntime,
        exclude,
        count: 12,
        seed: nextSeed,
      });
      setFilms(rows as unknown as CatalogItem[]);
    } catch (e) {
      console.error('[Programmazione] alternative', e);
      setFilms([]);
    } finally {
      setLoading(false);
    }
    // `exclude` cambia a ogni render del genitore (è un array nuovo ogni volta):
    // metterlo fra le dipendenze farebbe ricaricare il pannello di continuo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.band, target.maxRuntime, target.key]);

  useEffect(() => { load(seed); }, [load, seed]);

  return (
    <div className={styles.swapBackdrop} onClick={onClose}>
      <section
        className={styles.swapPanel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Cambia film"
      >
        <header className={styles.swapHead}>
          <div>
            <h3><Replace size={16} /> Al posto di «{target.title}»</h3>
            <p>
              {target.time} · {BAND_LABELS[target.band]} · ci sta un film fino a{' '}
              <b>{target.maxRuntime}′</b>
            </p>
          </div>
          <button className={styles.swapClose} onClick={onClose} aria-label="Chiudi">
            <X size={18} />
          </button>
        </header>

        {target.occurrences > 1 && (
          <div className={styles.swapScope}>
            <button
              type="button"
              className={scope === 'all' ? styles.swapScopeOn : ''}
              onClick={() => setScope('all')}
            >
              Tutti e {target.occurrences} gli spettacoli
            </button>
            <button
              type="button"
              className={scope === 'one' ? styles.swapScopeOn : ''}
              onClick={() => setScope('one')}
            >
              Solo quello delle {target.time}
            </button>
          </div>
        )}

        {loading ? (
          <p className={styles.emptyNote}><Loader2 size={15} className={styles.spin} /> Cerco cosa ci sta…</p>
        ) : films.length === 0 ? (
          <p className={styles.emptyNote}>
            In libreria non c&apos;è nessun altro film che stia in {target.maxRuntime}′ e non sia
            già in questo piano. Prova a togliere lo spettacolo e a rigenerare.
          </p>
        ) : (
          <div className={styles.swapGrid}>
            {films.map((f) => (
              <FilmCard
                key={f.id}
                film={f}
                selected={false}
                compact
                onClick={() => { if (!busy) onSwap(f, scope); }}
              />
            ))}
          </div>
        )}

        <footer className={styles.swapFoot}>
          <button
            type="button"
            className={styles.ghostBtnSmall}
            onClick={() => setSeed((s) => s + 1)}
            disabled={loading || busy}
          >
            <Dices size={13} /> Fammene vedere altri
          </button>
          <span>
            {scope === 'all' && target.occurrences > 1
              ? `Il film scelto prenderà tutti e ${target.occurrences} gli orari.`
              : 'Il film scelto prenderà questo orario, e resterà bloccato lì.'}
          </span>
        </footer>
      </section>
    </div>
  );
}
