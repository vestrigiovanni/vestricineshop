'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { planningAutoPlan, planningGenerate } from '@/actions/planningActions';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import { useToast } from '@/components/cabina/Toast';
import type { Intensity } from '@/services/scheduling/engine';
import type { Band } from '@/services/scheduling/times';
import { fillRequest, mergeFilled, type Draft, type FillChoice } from './draft';
import { periodLabel } from './labels';
import PosterBoard from './PosterBoard';
import { BAND_CHOICES, type CatalogItem } from './types';
import styles from './CatalogDrawer.module.css';
import fill from './FillDialog.module.css';

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
  // Il modo di Gio è scegliere dai poster: la scelta automatica resta, ma come
  // seconda strada.
  const [mode, setMode] = useState<'auto' | 'hand'>('hand');
  const [intensity, setIntensity] = useState<Intensity>((draft.intensity as Intensity) || 'normal');
  const [list, setList] = useState<FillChoice[]>(preset ? [{ film: preset }] : []);
  const [working, setWorking] = useState(false);

  const selected = useMemo(() => new Set(list.map((c) => c.film.tmdbId!).filter(Boolean)), [list]);
  const toggle = (f: CatalogItem) => {
    if (!f.tmdbId) return;
    setList((l) => (l.some((c) => c.film.tmdbId === f.tmdbId) ? l.filter((c) => c.film.tmdbId !== f.tmdbId) : [...l, { film: f }]));
  };

  const patch = (tmdbId: string, change: Partial<FillChoice>) =>
    setList((l) => l.map((c) => (c.film.tmdbId === tmdbId ? { ...c, ...change } : c)));

  const run = async () => {
    setWorking(true);
    try {
      let choices = list;
      if (mode === 'auto') {
        const auto = await planningAutoPlan({ seatingPlanId: roomId, startDate: from, days, intensity, exclude: draft.rejected });
        choices = auto.chosen.map((c) => ({ film: c.film as unknown as CatalogItem, replicas: c.replicas, band: c.preferredBand, suggested: true }));
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

  const settings = (
    <>
      <div className={styles.filters} style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Button variant={mode === 'hand' ? 'fill' : 'ghost'} onClick={() => setMode('hand')}>Scelgo io</Button>
        <Button variant={mode === 'auto' ? 'fill' : 'ghost'} onClick={() => setMode('auto')}>Scegli tu</Button>
      </div>

      <div className={styles.filters} style={{ marginTop: 10 }}>
        {INTENSITIES.map((i) => (
          <Button key={i.key} variant={intensity === i.key ? 'outline' : 'ghost'} onClick={() => setIntensity(i.key)} title={i.hint}>
            {i.label}
          </Button>
        ))}
      </div>
      <p className={styles.tmdbHint}>{INTENSITIES.find((i) => i.key === intensity)?.hint}</p>
    </>
  );

  const actions = (
    <div className={fill.actions}>
      <Button variant="ghost" onClick={onClose} disabled={working}>Annulla</Button>
      <Button variant="fill" onClick={run} disabled={working || (mode === 'hand' && list.length === 0)}>
        {working ? 'Riempio…' : mode === 'auto' ? 'Riempi' : list.length === 0 ? 'Scegli i film' : `Programma ${list.length} film`}
      </Button>
    </div>
  );

  if (mode === 'auto') {
    return (
      <Dialog open onClose={() => { if (!working) onClose(); }} title="Riempi i buchi" showTitle>
        <p className={styles.tmdbHint}>{periodLabel(from, days)} · quello che è già in bozza resta dov’è.</p>
        <div style={{ marginTop: 12 }}>{settings}</div>
        <p className={styles.tmdbHint} style={{ marginTop: 12 }}>
          Scelgo io dalla libreria il film giusto per ogni fascia, lontano da quelli che hai già scartato. Poi togli quello che non ti convince.
        </p>
        {actions}
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={() => { if (!working) onClose(); }} title="Riempi i buchi" variant="wide">
      <div className={fill.layout}>
        <section className={fill.main}>
          <header className={fill.head}>
            <h2>Scegli i film da programmare</h2>
            <p>{periodLabel(from, days)} · un clic su un poster lo aggiunge, un altro lo toglie. Gli orari li penso io.</p>
          </header>
          <PosterBoard selected={selected} onToggle={toggle} exclude={draft.rejected} />
        </section>

        <aside className={fill.side}>
          {settings}

          <h3 className={fill.sideTitle}>
            {list.length === 0 ? 'Nessun film scelto' : `${list.length} ${list.length === 1 ? 'film scelto' : 'film scelti'}`}
          </h3>
          {list.length === 0 ? (
            <p className={styles.tmdbHint}>Sfoglia i poster e tocca quelli che vuoi in sala. Quante volte e in che fascia, se non lo dici tu, lo decido io senza ripetere un film nella stessa giornata.</p>
          ) : (
            <ul className={fill.picked}>
              {list.map((c) => (
                <li key={c.film.tmdbId}>
                  <div className={fill.pickedHead}>
                    <span>{c.film.title}</span>
                    <button type="button" onClick={() => setList((l) => l.filter((x) => x !== c))} aria-label={`Togli ${c.film.title}`}>
                      <X size={14} />
                    </button>
                  </div>
                  <div className={fill.pickedOptions}>
                    <select
                      value={c.replicas ?? ''}
                      onChange={(e) => patch(c.film.tmdbId!, { replicas: e.target.value === '' ? undefined : Number(e.target.value) })}
                      aria-label="Quanti spettacoli"
                    >
                      <option value="">Quanti: decido io</option>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <select
                      value={c.band ?? ''}
                      onChange={(e) => patch(c.film.tmdbId!, { band: (e.target.value || undefined) as Band | undefined })}
                      aria-label="Fascia"
                    >
                      {BAND_CHOICES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {actions}
        </aside>
      </div>
    </Dialog>
  );
}
