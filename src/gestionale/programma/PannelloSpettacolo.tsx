'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { controllaSpostamento, elimina, quoteSpettacolo, sposta } from '@/programma/azioni';
import type { MoveCheck } from '@/programma/planning';
import { useAvviso } from '../Avviso';
import Finestra from '../Finestra';
import { dayLong, dayShort } from './labels';
import type { TavoloBlock, TavoloDay } from './week';

export interface MoveIntent {
  day: string;
  time: string;
}

export interface Replica {
  pretixId: number;
  label: string;
}

const OROLOGIO = /^([01]?\d|2[0-3])[:.]([0-5]\d)$/;
export function orologio(v: string): string | null {
  const m = v.trim().match(OROLOGIO);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

interface Quota { id?: number; name?: string | { it?: string }; size?: number | null; available_number?: number | null }

/**
 * Uno spettacolo già in sala: i posti, lo spostamento (si guarda la sala, poi
 * si decide, e solo allora si scrive su Pretix), l'eliminazione. Dalla v1
 * (`BlockPanel`, `DeleteDialog`, `GroupDeleteDialog`).
 */
export default function PannelloSpettacolo({ block, day, targetDays, roomId, from, intent, repliche, onChiudi, onCambiato, onReplica }: {
  block: TavoloBlock;
  day: TavoloDay;
  targetDays: string[];
  roomId: number;
  from: string;
  intent: MoveIntent | null;
  repliche: Replica[];
  onChiudi: () => void;
  onCambiato: (resta?: boolean) => void;
  onReplica: (tmdbId: string) => void;
}) {
  const di = useAvviso();
  const [giorno, setGiorno] = useState(intent?.day ?? day.date);
  const [ora, setOra] = useState(intent?.time ?? block.time);
  const [esito, setEsito] = useState<{ chiave: string; check: MoveCheck | null; errore?: string } | null>(null);
  const [consenso, setConsenso] = useState(false);
  const [lavoro, setLavoro] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quota[] | null>(null);
  const [eliminaUno, setEliminaUno] = useState(false);
  const [eliminaTutti, setEliminaTutti] = useState(false);
  const chiesta = useRef(0);

  const clock = orologio(ora);
  const cambiato = giorno !== day.date || (clock !== null && clock !== block.time);
  const voluto = block.touchable && cambiato && clock ? `${giorno}@${clock}` : null;
  const guardo = voluto !== null && esito?.chiave !== voluto;
  const check = voluto !== null && esito?.chiave === voluto ? esito.check : null;

  useEffect(() => {
    if (!voluto || block.pretixId === null || !clock) return;
    const id = ++chiesta.current;
    const t = window.setTimeout(async () => {
      try {
        const c = await controllaSpostamento({ seatingPlanId: roomId, pretixId: block.pretixId!, day: giorno, time: clock, fromDate: from });
        if (chiesta.current === id) setEsito({ chiave: voluto, check: c });
      } catch {
        if (chiesta.current === id) setEsito({ chiave: voluto, check: null, errore: 'Non sono riuscito a leggere la sala. Riprova.' });
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [voluto, block.pretixId, clock, giorno, roomId, from]);

  const conflitti = check?.conflicts ?? [];
  const sostituiti = conflitti.map(c => c.pretixId).filter((v): v is number => v != null);
  const serveConsenso = (check?.soldTickets ?? 0) > 0;
  const puoi = Boolean(check?.usable) && (!serveConsenso || consenso) && !lavoro;

  const spostalo = async () => {
    if (!check || block.pretixId === null || !clock) return;
    setLavoro(true);
    setErrore(null);
    try {
      const r = await sposta({
        seatingPlanId: roomId, pretixId: block.pretixId, day: giorno, time: clock, fromDate: from,
        replaces: sostituiti, force: serveConsenso, allowOutsideHours: Boolean(check.outsideHours),
      });
      if (!r.moved) {
        setErrore(r.error ?? 'Lo spostamento non è riuscito.');
        if (r.deleted.length) onCambiato(true);
        return;
      }
      di(`«${block.title}» spostato a ${dayLong(giorno)} alle ${check.slot?.time ?? clock}.`);
      onCambiato();
    } catch {
      setErrore('Lo spostamento non è riuscito. Ricarica il tavolo e controlla.');
    } finally {
      setLavoro(false);
    }
  };

  const leggiQuote = async () => {
    if (block.pretixId === null) return;
    try {
      setQuote((await quoteSpettacolo(block.pretixId)) as Quota[]);
    } catch {
      di('Pretix non ha risposto. Riprova fra poco.', 'errore');
    }
  };

  const posti = block.soldOut ? 'Tutto esaurito' : block.sold !== null && block.total !== null ? `${block.sold} su ${block.total} prenotati` : 'Posti non ancora letti';
  const quota = block.sold !== null && block.total ? Math.min(block.sold / block.total, 1) : 0;

  return (
    <div className="p-pannello">
      <header className="p-pannello__testa">
        <div>
          <p className="g-occhiello">{block.touchable ? 'In sala · su Pretix' : day.isPast ? 'Già passato' : 'Fuori dalla programmazione'}</p>
          <h2 className="p-pannello__titolo">{block.title}</h2>
          <p className="g-nota num">{dayShort(day.date)} · {block.time}–{block.endTime} · {block.runtime}′</p>
        </div>
        <button type="button" className="g-tasto g-tasto--piccolo g-tasto--tondo" onClick={onChiudi} aria-label="Chiudi">×</button>
      </header>

      <section className="p-pannello__parte">
        <div className="p-pannello__riga"><span className="g-etichetta">Posti</span><span className="num">{posti}</span></div>
        <div className="p-barretta" aria-hidden><span style={{ width: `${quota * 100}%` }} /></div>
        {block.pretixId !== null && (quote ? (
          <ul className="p-quote num">
            {quote.map((q, i) => <li key={q.id ?? i}>{typeof q.name === 'string' ? q.name : q.name?.it ?? 'Quota'} <b>{q.available_number ?? '…'} / {q.size ?? '∞'}</b></li>)}
          </ul>
        ) : (
          <button type="button" className="g-tasto g-tasto--piccolo" onClick={leggiQuote}>Quote su Pretix</button>
        ))}
      </section>

      {!block.touchable ? (
        <p className="g-testo">
          {day.isPast ? 'È già passato: si guarda, non si tocca.' : 'Non è nato dalla programmazione, quindi qui non si sposta: si gestisce da Pretix.'}
        </p>
      ) : (
        <>
          <section className="p-pannello__parte">
            <span className="g-etichetta">Sposta</span>
            <div className="p-pannello__campi">
              <select value={giorno} onChange={e => { setGiorno(e.target.value); setConsenso(false); }} aria-label="Giorno">
                {targetDays.map(d => <option key={d} value={d}>{dayShort(d)}</option>)}
              </select>
              <input value={ora} onChange={e => { setOra(e.target.value); setConsenso(false); }} inputMode="numeric" aria-label="Orario" aria-invalid={clock === null || undefined} />
            </div>
            {!cambiato && <p className="g-nota">Scrivi un altro orario o scegli un altro giorno, o trascina il blocco sulla settimana.</p>}
            {clock === null && <p className="g-errore">Scrivi l’orario come 18:30.</p>}
            {guardo && <p className="g-nota">Guardo la sala…</p>}
            {esito?.errore && voluto && <p className="g-errore">{esito.errore}</p>}
            {check && (
              <>
                <p className="p-esito" data-tono={!check.usable ? 'no' : conflitti.length || check.outsideHours ? 'attento' : 'si'}>{check.message}</p>
                {check.warning && <p className="p-esito" data-tono="attento">{check.warning}</p>}
                {check.movingShowSoldTickets === null && <p className="p-esito" data-tono="attento">Non sono riuscito a contare i biglietti già presi per questo spettacolo.</p>}
                {(check.movingShowSoldTickets ?? 0) > 0 && (
                  <p className="p-esito" data-tono="attento">
                    {check.movingShowSoldTickets} {check.movingShowSoldTickets === 1 ? 'persona ha' : 'persone hanno'} già un biglietto per le {block.time}: si presenteranno all’orario vecchio. Pretix non le avvisa, devi farlo tu.
                  </p>
                )}
                {serveConsenso && (
                  <label className="g-interruttore">
                    <input type="checkbox" checked={consenso} onChange={e => setConsenso(e.target.checked)} />
                    <span>Ho capito: elimino {conflitti.length === 1 ? 'uno spettacolo' : `${conflitti.length} spettacoli`} con {check.soldTickets} {check.soldTickets === 1 ? 'biglietto preso' : 'biglietti presi'}.</span>
                  </label>
                )}
              </>
            )}
            {errore && <p className="g-errore">{errore}</p>}
            {check?.usable && (
              <button type="button" className={`g-tasto ${conflitti.length ? 'g-tasto--allarme' : 'g-tasto--pieno'}`} onClick={spostalo} disabled={!puoi}>
                {lavoro ? 'Sposto…' : conflitti.length ? `Sposta ed elimina ${conflitti.map(c => `«${c.title}»`).join(' e ')}` : check.outsideHours ? 'Sposta lo stesso' : `Sposta a ${dayShort(giorno)} ${check.slot?.time ?? clock}`}
              </button>
            )}
          </section>

          <section className="p-pannello__parte">
            <span className="g-etichetta">Altro</span>
            <div className="p-pannello__tasti">
              {block.tmdbId && <button type="button" className="g-tasto g-tasto--piccolo" onClick={() => onReplica(block.tmdbId!)}>+ Una replica</button>}
              {block.tmdbId && <Link className="g-tasto g-tasto--piccolo" href={`/admin/film?tmdb=${block.tmdbId}`}>Scheda del film</Link>}
              <button type="button" className="g-tasto g-tasto--piccolo g-tasto--allarme" onClick={() => setEliminaUno(true)}>Elimina</button>
              {repliche.length > 1 && (
                <button type="button" className="g-tasto g-tasto--piccolo g-tasto--allarme" onClick={() => setEliminaTutti(true)}>Elimina le {repliche.length} repliche in vista</button>
              )}
            </div>
            <p className="g-nota">{block.sold ? `${block.sold} biglietti presi: prima di eliminarlo te lo ricordo.` : 'Si elimina da Pretix e dal sito, dopo una conferma.'}</p>
          </section>
        </>
      )}

      {eliminaUno && <EliminaUno block={block} quando={dayLong(day.date)} onChiudi={() => setEliminaUno(false)} onFatto={() => { setEliminaUno(false); di(`«${block.title}» eliminato.`); onCambiato(); }} />}
      {eliminaTutti && <EliminaTutte titolo={block.title} repliche={repliche} onChiudi={() => setEliminaTutti(false)} onFatto={() => { setEliminaTutti(false); onCambiato(); }} />}
    </div>
  );
}

/** Eliminare si vede online subito. La spunta compare solo se qualcuno ha già un biglietto. */
function EliminaUno({ block, quando, onChiudi, onFatto }: { block: TavoloBlock; quando: string; onChiudi: () => void; onFatto: () => void }) {
  const [rifiuto, setRifiuto] = useState<{ testo: string; venduti: number } | null>(null);
  const [consenso, setConsenso] = useState(false);
  const [lavoro, setLavoro] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const conferma = async () => {
    if (block.pretixId === null) return;
    setLavoro(true);
    setErrore(null);
    try {
      const r = await elimina(block.pretixId, rifiuto !== null);
      if (!r.deleted) return setRifiuto({ testo: r.error ?? '', venduti: r.soldTickets });
      onFatto();
    } catch {
      setErrore("L'eliminazione non è riuscita. Ricarica il tavolo e controlla.");
    } finally {
      setLavoro(false);
    }
  };

  return (
    <Finestra titolo={`Eliminare «${block.title}»?`} onChiudi={() => { if (!lavoro) onChiudi(); }}>
      <p className="g-testo">{quando}, ore {block.time}. Sparisce da Pretix, dal sito e dall’app: non si torna indietro.</p>
      {rifiuto && <p className="g-errore">{rifiuto.testo} Eliminarlo lascia orfane quelle prenotazioni.</p>}
      {errore && <p className="g-errore">{errore}</p>}
      {rifiuto && (
        <label className="g-interruttore">
          <input type="checkbox" checked={consenso} onChange={e => setConsenso(e.target.checked)} />
          <span>Ho capito: elimino uno spettacolo con {rifiuto.venduti} {rifiuto.venduti === 1 ? 'biglietto preso' : 'biglietti presi'}.</span>
        </label>
      )}
      <div className="g-finestra__azioni">
        <button type="button" className="g-tasto" onClick={onChiudi} disabled={lavoro}>Annulla</button>
        <button type="button" className="g-tasto g-tasto--allarme" onClick={conferma} disabled={lavoro || (rifiuto !== null && !consenso)}>
          {lavoro ? 'Elimino…' : rifiuto ? 'Elimina lo stesso' : 'Elimina'}
        </button>
      </div>
    </Finestra>
  );
}

/** Tutte le repliche in vista: quelle con biglietti presi restano, e lo si dice. */
function EliminaTutte({ titolo, repliche, onChiudi, onFatto }: { titolo: string; repliche: Replica[]; onChiudi: () => void; onFatto: () => void }) {
  const di = useAvviso();
  const [lavoro, setLavoro] = useState(false);

  const via = async () => {
    setLavoro(true);
    let tolte = 0;
    const restano: string[] = [];
    for (const r of repliche) {
      try {
        if ((await elimina(r.pretixId, false)).deleted) tolte++;
        else restano.push(r.label);
      } catch {
        restano.push(r.label);
      }
    }
    setLavoro(false);
    di(restano.length
      ? `${tolte} repliche di «${titolo}» eliminate. Restano ${restano.join(', ')}: hanno biglietti presi, o Pretix non ha risposto.`
      : `Tutte le ${tolte} repliche di «${titolo}» eliminate.`, restano.length ? 'errore' : 'ok');
    onFatto();
  };

  return (
    <Finestra titolo={`Eliminare tutte le repliche di «${titolo}»?`} onChiudi={() => { if (!lavoro) onChiudi(); }}>
      <p className="g-testo">{repliche.length} spettacoli in questo periodo: {repliche.map(r => r.label).join(', ')}. Spariscono da Pretix, dal sito e dall’app. Quelli con biglietti presi restano.</p>
      <div className="g-finestra__azioni">
        <button type="button" className="g-tasto" onClick={onChiudi} disabled={lavoro}>Annulla</button>
        <button type="button" className="g-tasto g-tasto--allarme" onClick={via} disabled={lavoro}>{lavoro ? 'Elimino…' : `Elimina tutte e ${repliche.length}`}</button>
      </div>
    </Finestra>
  );
}
