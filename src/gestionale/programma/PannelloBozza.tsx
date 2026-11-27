'use client';

import { useEffect, useRef, useState } from 'react';
import { alternative, controllaOrario } from '@/programma/azioni';
import type { ManualSlotCheck } from '@/programma/planning';
import type { ScheduledShow } from '@/programma/motore/engine';
import { PROJECTION_SPECS, type ProjectionSpecCode } from '@/programma/specifiche';
import { useAvviso } from '../Avviso';
import Finestra from '../Finestra';
import {
  clashesWithDraft, draftKey, maxRuntimeAt, minuteOfDay, removeShow, replaceShow, setLocked, setSpecs, showFromSlot, swapFilm, type Draft,
} from './draft';
import { dayShort } from './labels';
import { orologio } from './PannelloSpettacolo';
import { riga } from './Tabellone';
import { commitKey, type CatalogItem } from './types';

/**
 * Uno spettacolo in bozza, non ancora in sala: l'orario (anche uno occupato:
 * si dice cosa comporta), i bollini del film, lo scambio con un altro film che
 * ci sta lì, e «Togli». Dalla v1 (`DraftPanel`, `SwapDialog`).
 */
export default function PannelloBozza({ show, draft, roomId, from, targetDays, esistentiIl, update, onScegli }: {
  show: ScheduledShow;
  draft: Draft;
  roomId: number;
  from: string;
  targetDays: string[];
  esistentiIl: (day: string) => { start: number; end: number }[];
  update: (change: (d: Draft) => Draft) => void;
  onScegli: (key: string | null) => void;
}) {
  const di = useAvviso();
  const key = draftKey(show);
  const [giorno, setGiorno] = useState(show.day);
  const [ora, setOra] = useState(show.time);
  const [esito, setEsito] = useState<{ chiave: string; check: ManualSlotCheck | null; errore?: string } | null>(null);
  const [consenso, setConsenso] = useState(false);
  const [scambio, setScambio] = useState(false);
  const chiesta = useRef(0);

  const clock = orologio(ora);
  const cambiato = giorno !== show.day || (clock !== null && clock !== show.time);
  const voluto = cambiato && clock ? `${giorno}@${clock}` : null;
  const guardo = voluto !== null && esito?.chiave !== voluto;
  const check = voluto !== null && esito?.chiave === voluto ? esito.check : null;

  useEffect(() => {
    if (!voluto || !clock) return;
    const id = ++chiesta.current;
    const t = window.setTimeout(async () => {
      try {
        const c = await controllaOrario({ seatingPlanId: roomId, tmdbId: show.tmdbId, day: giorno, time: clock, fromDate: from });
        if (chiesta.current === id) setEsito({ chiave: voluto, check: c });
      } catch {
        if (chiesta.current === id) setEsito({ chiave: voluto, check: null, errore: 'Non sono riuscito a leggere la sala. Riprova.' });
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [voluto, clock, giorno, roomId, from, show.tmdbId]);

  const inizio = check?.slot ? minuteOfDay(check.slot) : null;
  const scontro = check?.slot && inizio !== null ? clashesWithDraft(draft, check.slot.day, inizio, inizio + show.runtime, key) : null;
  const conflitti = check?.conflicts ?? [];
  const serveConsenso = (check?.soldTickets ?? 0) > 0;
  const puoi = Boolean(check?.usable) && !scontro && (!serveConsenso || consenso);

  const metti = () => {
    if (!check?.slot || !puoi) return;
    const next = showFromSlot(show, check.slot);
    update(d => replaceShow(d, key, next, {
      replaces: conflitti.map(c => c.pretixId).filter((v): v is number => v != null),
      force: serveConsenso,
      label: conflitti.map(c => `«${c.title}» delle ${c.time}`).join(', ') || undefined,
      soldTickets: check.soldTickets,
      outsideHours: check.outsideHours,
    }));
    onScegli(draftKey(next));
  };

  const pick = draft.picks[show.tmdbId];
  const bollini = pick?.specs ?? [];
  const giraBollino = (code: ProjectionSpecCode) =>
    update(d => setSpecs(d, show.tmdbId, { specs: bollini.includes(code) ? bollini.filter(c => c !== code) : [...bollini, code] }));

  const fratelli = draft.shows.filter(s => s.tmdbId === show.tmdbId);
  const maxUno = maxRuntimeAt(draft, show.day, minuteOfDay(show), esistentiIl(show.day), key);
  const maxTutti = Math.min(...fratelli.map(s => maxRuntimeAt(draft, s.day, minuteOfDay(s), esistentiIl(s.day), draftKey(s))));
  const escludi = [...new Set([...draft.shows.map(s => s.tmdbId), ...draft.rejected])];
  const sostituisce = draft.replacements[commitKey(show)];

  return (
    <div className="p-pannello">
      <header className="p-pannello__testa">
        <div>
          <p className="g-occhiello" data-allarme="">{show.locked ? 'In bozza · non ancora in sala' : 'In bozza · messo dal motore'}</p>
          <h2 className="p-pannello__titolo">{show.title}</h2>
          <p className="g-nota num">{dayShort(show.day)} · {show.time}–{show.endTime} · {show.runtime}′</p>
          {sostituisce && sostituisce.replaces.length > 0 && (
            <p className="p-esito" data-tono="attento">Sostituirà {sostituisce.label ?? 'uno spettacolo in sala'}{sostituisce.soldTickets > 0 ? `, con ${sostituisce.soldTickets} biglietti presi` : ''}.</p>
          )}
          {sostituisce?.outsideHours && <p className="p-esito" data-tono="attento">Esce dall’orario d’apertura: l’hai scelto tu.</p>}
        </div>
        <button type="button" className="g-tasto g-tasto--piccolo g-tasto--tondo" onClick={() => onScegli(null)} aria-label="Chiudi">×</button>
      </header>

      <section className="p-pannello__parte">
        <span className="g-etichetta">Orario</span>
        <div className="p-pannello__campi">
          <select value={giorno} onChange={e => { setGiorno(e.target.value); setConsenso(false); }} aria-label="Giorno">
            {targetDays.map(d => <option key={d} value={d}>{dayShort(d)}</option>)}
          </select>
          <input value={ora} onChange={e => { setOra(e.target.value); setConsenso(false); }} inputMode="numeric" aria-label="Orario" aria-invalid={clock === null || undefined} />
        </div>
        {!cambiato && <p className="g-nota">Scrivi un orario, anche occupato: ti dico cosa comporta. Oppure trascina il blocco.</p>}
        {clock === null && <p className="g-errore">Scrivi l’orario come 18:30.</p>}
        {guardo && <p className="g-nota">Guardo la sala…</p>}
        {esito?.errore && voluto && <p className="g-errore">{esito.errore}</p>}
        {check && (
          <>
            <p className="p-esito" data-tono={!check.usable || scontro ? 'no' : conflitti.length || check.outsideHours ? 'attento' : 'si'}>
              {scontro ? `Si scontra con «${scontro.title}» delle ${scontro.time}, anche lui in bozza.` : check.message}
            </p>
            {check.warning && !scontro && <p className="p-esito" data-tono="attento">{check.warning}</p>}
            {serveConsenso && !scontro && (
              <label className="g-interruttore">
                <input type="checkbox" checked={consenso} onChange={e => setConsenso(e.target.checked)} />
                <span>Ho capito: quando la mando in sala elimino {conflitti.length === 1 ? 'uno spettacolo' : `${conflitti.length} spettacoli`} con {check.soldTickets} {check.soldTickets === 1 ? 'biglietto preso' : 'biglietti presi'}.</span>
              </label>
            )}
            {check.usable && !scontro && (
              <button type="button" className={`g-tasto ${conflitti.length ? 'g-tasto--allarme' : 'g-tasto--pieno'}`} onClick={metti} disabled={!puoi}>
                {conflitti.length ? `Metti qui, al posto di ${conflitti.map(c => `«${c.title}»`).join(' e ')}` : `Metti a ${dayShort(giorno)} ${check.slot?.time ?? clock}`}
              </button>
            )}
          </>
        )}
      </section>

      <section className="p-pannello__parte">
        <span className="g-etichetta">Il film · vale per {fratelli.length === 1 ? 'questo spettacolo' : `tutti e ${fratelli.length} gli spettacoli`}</span>
        <div className="p-bollini">
          {PROJECTION_SPECS.map(s => (
            <label key={s.code} className="g-spunta" title={s.description}>
              <input type="checkbox" checked={bollini.includes(s.code)} onChange={() => giraBollino(s.code)} /> {s.adminLabel}
            </label>
          ))}
        </div>
        <input value={pick?.specsNote ?? ''} onChange={e => update(d => setSpecs(d, show.tmdbId, { specsNote: e.target.value }))} placeholder="Nota di proiezione (es. copia restaurata)" aria-label="Nota di proiezione" />
      </section>

      <section className="p-pannello__parte">
        <span className="g-etichetta">Altro</span>
        <div className="p-pannello__tasti">
          {!show.locked && <button type="button" className="g-tasto g-tasto--piccolo" onClick={() => update(d => setLocked(d, key, true))}>Tienilo qui</button>}
          <button type="button" className="g-tasto g-tasto--piccolo" onClick={() => setScambio(true)}>⇄ Scambia il film</button>
          <button type="button" className="g-tasto g-tasto--piccolo g-tasto--allarme" onClick={() => { update(d => removeShow(d, key)); di(`«${show.title}» tolto dalla bozza.`); onScegli(null); }}>Togli dalla bozza</button>
        </div>
        {!show.locked && <p className="g-nota">L’ha messo il motore: «Rimescola» lo può spostare, finché non lo tieni o lo sposti tu.</p>}
      </section>

      {scambio && (
        <Scambia
          show={show}
          quanti={fratelli.length}
          maxUno={maxUno}
          maxTutti={maxTutti}
          escludi={escludi}
          onChiudi={() => setScambio(false)}
          onScambia={(film, scope) => {
            setScambio(false);
            update(d => swapFilm(d, key, film, scope));
            di(`Al posto di «${show.title}»: «${film.title}».`);
            onScegli(draftKey({ tmdbId: film.tmdbId!, date: show.date, time: show.time }));
          }}
        />
      )}
    </div>
  );
}

/** Non è il catalogo: qui si guarda cosa ci sta **lì**, nella sua fascia. */
function Scambia({ show, quanti, maxUno, maxTutti, escludi, onChiudi, onScambia }: {
  show: ScheduledShow;
  quanti: number;
  maxUno: number;
  maxTutti: number;
  escludi: string[];
  onChiudi: () => void;
  onScambia: (film: CatalogItem, scope: 'one' | 'all') => void;
}) {
  const [scope, setScope] = useState<'one' | 'all'>(quanti > 1 ? 'all' : 'one');
  const [seme, setSeme] = useState(0);
  const [esito, setEsito] = useState<{ chiave: string; film: CatalogItem[] } | null>(null);
  const massimo = scope === 'all' ? maxTutti : maxUno;
  const chiave = `${scope}|${seme}|${massimo}`;
  const escludiChiave = escludi.join(',');

  useEffect(() => {
    let via = false;
    alternative({ band: show.band, maxRuntime: massimo, exclude: escludiChiave.split(','), count: 12, seed: seme })
      .then(f => { if (!via) setEsito({ chiave, film: f as CatalogItem[] }); })
      .catch(() => { if (!via) setEsito({ chiave, film: [] }); });
    return () => { via = true; };
  }, [chiave, show.band, massimo, escludiChiave, seme]);

  const carico = esito?.chiave !== chiave;
  return (
    <Finestra titolo={`Al posto di «${show.title}»`} onChiudi={onChiudi}>
      <p className="g-nota">Ci sta un film fino a {massimo}′.</p>
      {quanti > 1 && (
        <div className="g-scelta" role="group" aria-label="Quali spettacoli">
          <button type="button" className="g-scelta__voce" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>Tutti e {quanti}</button>
          <button type="button" className="g-scelta__voce" aria-pressed={scope === 'one'} onClick={() => setScope('one')}>Solo le {show.time}</button>
        </div>
      )}
      {carico ? <p className="g-nota">Cerco cosa ci sta…</p> : !esito?.film.length ? (
        <p className="g-nota">Nessun altro film in libreria sta in {massimo}′ senza essere già in bozza.</p>
      ) : (
        <ul className="p-scambi">
          {esito.film.map(f => (
            <li key={f.id}>
              <span><b>{f.title}</b> <span className="g-nota num">{riga(f)}</span></span>
              <button type="button" className="g-tasto g-tasto--piccolo" onClick={() => onScambia(f, scope)}>Metti</button>
            </li>
          ))}
        </ul>
      )}
      <div className="g-finestra__azioni">
        <button type="button" className="g-tasto" onClick={() => setSeme(s => s + 1)} disabled={carico}>Fammene vedere altri</button>
        <button type="button" className="g-tasto" onClick={onChiudi}>Chiudi</button>
      </div>
    </Finestra>
  );
}
