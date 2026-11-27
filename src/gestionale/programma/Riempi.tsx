'use client';

import { useMemo, useState } from 'react';
import { genera, sceltaAutomatica } from '@/programma/azioni';
import type { Intensity } from '@/programma/motore/engine';
import type { Band } from '@/programma/motore/times';
import { useAvviso } from '../Avviso';
import Finestra from '../Finestra';
import { immagineTmdb } from '../immagini';
import { fillRequest, mergeFilled, type Draft, type FillChoice } from './draft';
import { periodLabel } from './labels';
import Tabellone from './Tabellone';
import { BAND_CHOICES, type CatalogItem } from './types';

const RITMI: { key: Intensity; label: string; hint: string }[] = [
  { key: 'soft', label: 'Rilassato', hint: '4 al giorno, 5 nel weekend' },
  { key: 'normal', label: 'Normale', hint: '6 al giorno, 7 nel weekend' },
  { key: 'festival', label: 'Festival', hint: '7 al giorno, 8 nel weekend' },
];

/**
 * «Riempi i buchi»: quello che è già in bozza resta dov'è, i film scelti
 * prendono solo lo spazio rimasto. Il modo di Gio è scegliere dai poster
 * («Scelgo io»); «Scegli tu» lascia la scelta al gusto della sala. Gli orari
 * li decide sempre il motore. Dalla v1 (`FillDialog`).
 */
export default function Riempi({ roomId, from, days, draft, preset, update, onChiudi }: {
  roomId: number;
  from: string;
  days: number;
  draft: Draft;
  preset: CatalogItem | null;
  update: (change: (d: Draft) => Draft) => void;
  onChiudi: () => void;
}) {
  const di = useAvviso();
  const [modo, setModo] = useState<'io' | 'tu'>('io');
  const [ritmo, setRitmo] = useState<Intensity>((draft.intensity as Intensity) || 'normal');
  const [lista, setLista] = useState<FillChoice[]>(preset ? [{ film: preset }] : []);
  const [lavoro, setLavoro] = useState(false);
  const scelti = useMemo(() => new Set(lista.map(c => c.film.tmdbId!).filter(Boolean)), [lista]);

  const gira = (f: CatalogItem) => {
    if (!f.tmdbId) return;
    setLista(l => (l.some(c => c.film.tmdbId === f.tmdbId) ? l.filter(c => c.film.tmdbId !== f.tmdbId) : [...l, { film: f }]));
  };
  const cambia = (tmdbId: string, x: Partial<FillChoice>) => setLista(l => l.map(c => (c.film.tmdbId === tmdbId ? { ...c, ...x } : c)));

  const vai = async () => {
    setLavoro(true);
    try {
      let scelte = lista;
      if (modo === 'tu') {
        const auto = await sceltaAutomatica({ seatingPlanId: roomId, startDate: from, days, intensity: ritmo, exclude: draft.rejected });
        scelte = auto.chosen.map(c => ({ film: c.film as unknown as CatalogItem, replicas: c.replicas, band: c.preferredBand, suggested: true }));
        if (!scelte.length) return di(auto.warnings[0] ?? 'Non ho trovato film adatti in libreria per questo periodo.', 'errore');
      }
      const req = fillRequest(draft, from, days, scelte);
      const res = await genera({ seatingPlanId: roomId, startDate: from, days, intensity: ritmo, films: req.films, locked: req.locked });
      const nuovi = res.shows.filter(s => !s.locked);
      update(d => ({ ...mergeFilled(d, nuovi, scelte.map(c => c.film)), intensity: ritmo }));
      onChiudi();
      di(nuovi.length
        ? `${nuovi.length} ${nuovi.length === 1 ? 'spettacolo messo' : 'spettacoli messi'} in bozza. «Rimescola» li cambia di posto, un clic li sistema a mano.`
        : 'Non c’era spazio per niente di nuovo.');
      if (res.warnings.length) window.setTimeout(() => di(res.warnings[0]), 4200);
    } catch {
      di('Non sono riuscito a riempire il periodo. Riprova.', 'errore');
    } finally {
      setLavoro(false);
    }
  };

  return (
    <Finestra titolo="Riempi i buchi" larga onChiudi={() => { if (!lavoro) onChiudi(); }}>
      <p className="g-nota">{periodLabel(from, days)} · quello che è già in bozza resta dov’è.</p>
      <div className="p-riempi__comandi">
        <div className="g-scelta" role="group" aria-label="Chi sceglie i film">
          <button type="button" className="g-scelta__voce" aria-pressed={modo === 'io'} onClick={() => setModo('io')}>Scelgo io</button>
          <button type="button" className="g-scelta__voce" aria-pressed={modo === 'tu'} onClick={() => setModo('tu')}>Scegli tu</button>
        </div>
        <div className="g-scelta" role="group" aria-label="Ritmo">
          {RITMI.map(r => <button key={r.key} type="button" className="g-scelta__voce" aria-pressed={ritmo === r.key} title={r.hint} onClick={() => setRitmo(r.key)}>{r.label}</button>)}
        </div>
        <span className="g-nota">{RITMI.find(r => r.key === ritmo)?.hint}</span>
      </div>

      {modo === 'tu' ? (
        <p className="g-testo">Scelgo io dalla libreria il film giusto per ogni fascia, lontano da quelli che hai già scartato. Poi togli quello che non ti convince.</p>
      ) : (
        <div className="p-riempi">
          <Tabellone modo="griglia" scelti={scelti} onScegli={gira} escludi={draft.rejected} />
          <aside className="p-riempi__scelti">
            <p className="g-etichetta">{lista.length === 0 ? 'Nessun film scelto' : `${lista.length} ${lista.length === 1 ? 'film scelto' : 'film scelti'}`}</p>
            {lista.length === 0 ? (
              <p className="g-nota">Tocca i poster che vuoi in sala. Quante volte e in che fascia, se non lo dici tu, lo decido io senza ripetere un film nella stessa giornata.</p>
            ) : (
              <ul>
                {lista.map(c => {
                  const src = immagineTmdb(c.film.posterPath, 'w92');
                  return (
                    <li key={c.film.tmdbId} className="p-scelto">
                      <div className="p-scelto__testa">
                        {src ? <img src={src} alt="" /> : <span />}
                        <b>{c.film.title}</b>
                        <button type="button" className="g-tasto g-tasto--piccolo g-tasto--tondo" onClick={() => setLista(l => l.filter(x => x !== c))} aria-label={`Togli ${c.film.title}`}>×</button>
                      </div>
                      <div className="p-scelto__opzioni">
                        <select value={c.replicas ?? ''} onChange={e => cambia(c.film.tmdbId!, { replicas: e.target.value === '' ? undefined : Number(e.target.value) })} aria-label="Quanti spettacoli">
                          <option value="">Quanti: decido io</option>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map(k => <option key={k} value={k}>{k}</option>)}
                        </select>
                        <select value={c.band ?? ''} onChange={e => cambia(c.film.tmdbId!, { band: (e.target.value || undefined) as Band | undefined })} aria-label="Fascia">
                          {BAND_CHOICES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                        </select>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      )}

      <div className="g-finestra__azioni">
        <button type="button" className="g-tasto" onClick={onChiudi} disabled={lavoro}>Annulla</button>
        <button type="button" className="g-tasto g-tasto--pieno" onClick={vai} disabled={lavoro || (modo === 'io' && lista.length === 0)}>
          {lavoro ? 'Riempio…' : modo === 'tu' ? 'Riempi' : lista.length === 0 ? 'Scegli i film' : `Programma ${lista.length} film`}
        </button>
      </div>
    </Finestra>
  );
}
