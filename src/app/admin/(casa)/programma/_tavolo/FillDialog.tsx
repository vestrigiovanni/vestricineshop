'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { catalogList } from '@/actions/catalogActions';
import { planningAutoPlan, planningGenerate } from '@/actions/planningActions';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import { useToast } from '@/components/cabina/Toast';
import type { Intensity } from '@/services/scheduling/engine';
import type { Band } from '@/services/scheduling/times';
import { fillRequest, mergeFilled, type Draft, type FillChoice } from './draft';
import { periodLabel } from './labels';
import { BAND_CHOICES, type CatalogItem } from './types';
import styles from './CatalogDrawer.module.css';

const INTENSITIES: { key: Intensity; label: string; hint: string }[] = [
  { key: 'soft', label: 'Rilassata', hint: '4 al giorno, 5 nel weekend' },
  { key: 'normal', label: 'Normale', hint: '6 al giorno, 7 nel weekend' },
  { key: 'festival', label: 'Festival', hint: '7 al giorno, 8 nel weekend' },
];

interface Props {
  roomId: number;
  from: string;
  days: number;
  draft: Draft;
  /** Il film scelto nel catalogo, se c'è: parte già nell'elenco. */
  preset: CatalogItem | null;
  update: (change: (d: Draft) => Draft) => void;
  onClose: () => void;
}

export default function FillDialog({ roomId, from, days, draft, preset, update, onClose }: Props) {
  const toast = useToast();
  const [mode, setMode] = useState<'auto' | 'hand'>(preset ? 'hand' : 'auto');
  const [intensity, setIntensity] = useState<Intensity>((draft.intensity as Intensity) || 'normal');
  const [list, setList] = useState<FillChoice[]>(preset ? [{ film: preset }] : []);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<{ q: string; films: CatalogItem[] } | null>(null);
  const [working, setWorking] = useState(false);

  const q = search.trim();
  useEffect(() => {
    if (!q) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      catalogList({ search: q, pageSize: 8 })
        .then((r) => {
          if (!cancelled) setFound({ q, films: r.films as unknown as CatalogItem[] });
        })
        .catch(() => null);
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q]);

  const add = (f: CatalogItem) => {
    if (!f.tmdbId || list.some((c) => c.film.tmdbId === f.tmdbId)) return;
    setList((l) => [...l, { film: f }]);
    setSearch('');
    setFound(null);
  };

  const patch = (tmdbId: string, change: Partial<FillChoice>) =>
    setList((l) => l.map((c) => (c.film.tmdbId === tmdbId ? { ...c, ...change } : c)));

  const run = async () => {
    setWorking(true);
    try {
      let choices = list;
      if (mode === 'auto') {
        const auto = await planningAutoPlan({ seatingPlanId: roomId, startDate: from, days, intensity, exclude: draft.rejected });
        choices = auto.chosen.map((c) => ({ film: c.film as unknown as CatalogItem, replicas: c.replicas, band: c.preferredBand }));
        if (choices.length === 0) {
          toast(auto.warnings[0] ?? 'Non ho trovato film adatti in libreria per questo periodo.', 'alarm');
          return;
        }
      }
      const req = fillRequest(draft, from, days, choices);
      const res = await planningGenerate({ seatingPlanId: roomId, startDate: from, days, intensity, films: req.films, locked: req.locked });
      const added = res.shows.filter((s) => !s.locked);
      update((d) => ({ ...mergeFilled(d, added, choices.map((c) => c.film)), intensity }));
      onClose();
      toast(
        added.length
          ? `${added.length} ${added.length === 1 ? 'spettacolo messo' : 'spettacoli messi'} in bozza. Rigenera li rimescola, un clic li sistema a mano.`
          : 'Non c’era spazio per niente di nuovo.',
        added.length ? 'ok' : 'info',
      );
      if (res.warnings.length) toast(res.warnings[0]);
    } catch {
      toast('Non sono riuscito a riempire il periodo. Riprova.', 'alarm');
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open onClose={() => { if (!working) onClose(); }} title="Riempi i buchi" showTitle>
      <p className={styles.tmdbHint}>{periodLabel(from, days)} · quello che è già in bozza resta dov’è.</p>

      <div className={styles.filters} style={{ gridTemplateColumns: '1fr 1fr', marginTop: 12 }}>
        <Button variant={mode === 'auto' ? 'fill' : 'ghost'} onClick={() => setMode('auto')}>Scegli tu</Button>
        <Button variant={mode === 'hand' ? 'fill' : 'ghost'} onClick={() => setMode('hand')}>Con questi film</Button>
      </div>

      <div className={styles.filters} style={{ marginTop: 10 }}>
        {INTENSITIES.map((i) => (
          <Button key={i.key} variant={intensity === i.key ? 'outline' : 'ghost'} onClick={() => setIntensity(i.key)} title={i.hint}>
            {i.label}
          </Button>
        ))}
      </div>
      <p className={styles.tmdbHint}>{INTENSITIES.find((i) => i.key === intensity)?.hint}</p>

      {mode === 'auto' ? (
        <p className={styles.tmdbHint} style={{ marginTop: 12 }}>
          Scelgo io dalla libreria il film giusto per ogni fascia, lontano da quelli che hai già scartato. Poi togli quello che non ti convince.
        </p>
      ) : (
        <div style={{ marginTop: 12 }}>
          <div className={styles.tmdbForm}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Aggiungi un film dal catalogo…" aria-label="Aggiungi un film" />
          </div>
          {q && found?.q === q && (
            <ul className={styles.tmdbList}>
              {found.films.map((f) => (
                <li key={f.id}>
                  <span>{f.title} <em>{[f.year, `${f.runtime ?? f.durationMin ?? '?'}′`].join(' · ')}</em></span>
                  <Button variant="ghost" onClick={() => add(f)}>+</Button>
                </li>
              ))}
            </ul>
          )}
          {list.length === 0 ? (
            <p className={styles.tmdbHint}>Nessun film ancora: cercane uno qui sopra.</p>
          ) : (
            <ul className={styles.tmdbList}>
              {list.map((c) => (
                <li key={c.film.tmdbId}>
                  <span>{c.film.title}</span>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select
                      value={c.replicas ?? ''}
                      onChange={(e) => patch(c.film.tmdbId!, { replicas: e.target.value === '' ? undefined : Number(e.target.value) })}
                      aria-label="Quanti spettacoli"
                    >
                      <option value="">Quanti: decidi tu</option>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <select
                      value={c.band ?? ''}
                      onChange={(e) => patch(c.film.tmdbId!, { band: (e.target.value || undefined) as Band | undefined })}
                      aria-label="Fascia"
                    >
                      {BAND_CHOICES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                    <button type="button" onClick={() => setList((l) => l.filter((x) => x !== c))} aria-label="Togli" style={{ background: 'none', border: 0, color: 'var(--c-dim)', cursor: 'pointer' }}>
                      <X size={14} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <Button variant="ghost" onClick={onClose} disabled={working}>Annulla</Button>
        <Button variant="fill" onClick={run} disabled={working || (mode === 'hand' && list.length === 0)}>
          {working ? 'Riempio…' : mode === 'auto' ? 'Riempi' : `Riempi con ${list.length} ${list.length === 1 ? 'film' : 'film'}`}
        </Button>
      </div>
    </Dialog>
  );
}
