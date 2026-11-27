'use client';

import { useMemo, useState } from 'react';
import { romeClock } from '@/programma/motore/rome';
import { projectionSpecLabels } from '@/programma/specifiche';
import Finestra from '../Finestra';
import { commitPayload, type Draft } from './draft';
import { dayShort } from './labels';
import type { CommitApi } from './useCommit';

/**
 * La bozza in fondo al tavolo, e «Manda in sala»: la conferma elenca giorno
 * per giorno quello che si crea su Pretix. Dopo il sì nessuno lavora in
 * sottofondo: è questa finestra, aperta, a far avanzare la creazione a lotti
 * (`useCommit`). Chiusa a metà, alla riapertura si riprende. Dalla v1 (`CommitBar`).
 */
export default function Barra({ draft, savedAt, commit, onButta }: { draft: Draft; savedAt: string | null; commit: CommitApi; onButta: () => void }) {
  const [conferma, setConferma] = useState(false);
  const [butta, setButta] = useState(false);
  const piano = useMemo(() => commitPayload(draft), [draft]);
  const sostituzioni = Object.values(draft.replacements).filter(r => r.replaces.length > 0);
  const presiARischio = sostituzioni.reduce((n, r) => n + r.soldTickets, 0);
  const perGiorno = useMemo(() => {
    const m = new Map<string, typeof piano>();
    for (const s of piano) m.set(s.date, [...(m.get(s.date) ?? []), s]);
    return [...m.entries()];
  }, [piano]);

  const n = draft.shows.length;
  const lavora = commit.phase === 'running';
  const percento = Math.round((commit.progress.done / Math.max(commit.progress.total, 1)) * 100);

  return (
    <>
      {n > 0 && (
        <div className="p-barra" role="region" aria-label="La bozza">
          <span className="p-barra__stato">
            <b className="num">{n} in bozza</b>
            <span className="g-nota">{savedAt ? ` · salvata alle ${romeClock(new Date(savedAt))}` : ' · non ancora salvata'}</span>
            {sostituzioni.length > 0 && <span className="g-nota p-barra__attento"> · {sostituzioni.length} sostituzioni</span>}
          </span>
          <span className="p-barra__azioni">
            <button type="button" className="g-tasto" onClick={() => setButta(true)} disabled={lavora}>Butta la bozza</button>
            <button type="button" className="g-tasto g-tasto--pieno" onClick={() => setConferma(true)} disabled={lavora}>Manda in sala →</button>
          </span>
        </div>
      )}

      {conferma && (
        <Finestra titolo={`Mandare in sala ${n} ${n === 1 ? 'spettacolo' : 'spettacoli'}?`} onChiudi={() => setConferma(false)}>
          <p className="g-testo">Si creano su Pretix e compaiono subito sul sito e nell’app, con le prenotazioni aperte.</p>
          <div className="p-riepilogo">
            {perGiorno.map(([data, lista]) => (
              <div key={data}>
                <p className="g-etichetta">{dayShort(data)}</p>
                <ul>
                  {lista.map(s => (
                    <li key={`${s.tmdbId}@${s.time}`}>
                      <span className="num p-riepilogo__ora">{s.time}</span> {s.title}
                      {s.specs && <em> · {projectionSpecLabels(s.specs, s.specsNote).join(' · ')}</em>}
                      {s.replaces && <em className="p-barra__attento"> · sostituisce</em>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {sostituzioni.length > 0 && (
            <p className="g-errore">
              {sostituzioni.length === 1 ? 'Uno spettacolo in sala verrà eliminato' : `${sostituzioni.length} spettacoli in sala verranno eliminati`} per fare posto
              {presiARischio > 0 ? `, con ${presiARischio} biglietti presi da avvisare a mano` : ''}.
            </p>
          )}
          <div className="g-finestra__azioni">
            <button type="button" className="g-tasto" onClick={() => setConferma(false)}>Non ancora</button>
            <button type="button" className="g-tasto g-tasto--pieno" onClick={() => { setConferma(false); void commit.start(piano); }}>
              Crea {n} {n === 1 ? 'spettacolo' : 'spettacoli'} su Pretix
            </button>
          </div>
        </Finestra>
      )}

      {commit.phase !== 'idle' && (
        <Finestra titolo={lavora ? 'Mando in sala…' : commit.failures.length ? 'Finito, con qualche intoppo' : 'In sala'} onChiudi={() => { if (!lavora) commit.close(); }}>
          <div className="p-barretta p-barretta--grande" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percento}><span style={{ width: `${percento}%` }} /></div>
          <p className="g-testo">{lavora ? commit.progress.step : `${commit.created} ${commit.created === 1 ? 'spettacolo creato' : 'spettacoli creati'}.`}</p>
          {lavora && <p className="g-nota">Puoi anche chiudere il portatile: alla riapertura riprendo da dove ero.</p>}
          {commit.failures.length > 0 && (
            <ul className="g-registro">
              {commit.failures.map(f => <li key={f.key}><b>{f.label}</b> — {f.error}</li>)}
            </ul>
          )}
          {!lavora && (
            <div className="g-finestra__azioni">
              {commit.failures.length > 0 && <button type="button" className="g-tasto" onClick={() => void commit.retry()}>Riprova quelli non riusciti</button>}
              <button type="button" className="g-tasto g-tasto--pieno" onClick={commit.close}>Chiudi</button>
            </div>
          )}
        </Finestra>
      )}

      {commit.resumeOffer && commit.phase === 'idle' && (
        <Finestra titolo="Una creazione rimasta a metà" onChiudi={commit.declineResume}>
          <p className="g-testo">
            {commit.resumeOffer.done} spettacoli su {commit.resumeOffer.total} sono già in sala, ne mancano {commit.resumeOffer.total - commit.resumeOffer.done}.
            La riprendo da dove era? Quelli già creati non si rifanno.
          </p>
          <div className="g-finestra__azioni">
            <button type="button" className="g-tasto" onClick={commit.declineResume}>Lascia stare</button>
            <button type="button" className="g-tasto g-tasto--pieno" onClick={commit.acceptResume}>Riprendi</button>
          </div>
        </Finestra>
      )}

      {butta && (
        <Finestra titolo="Buttare la bozza?" onChiudi={() => setButta(false)}>
          <p className="g-testo">
            {n} {n === 1 ? 'spettacolo che non è ancora in sala sparisce' : 'spettacoli che non sono ancora in sala spariscono'}. Quello che è già su Pretix non si tocca.
          </p>
          <div className="g-finestra__azioni">
            <button type="button" className="g-tasto" onClick={() => setButta(false)}>Tienila</button>
            <button type="button" className="g-tasto g-tasto--allarme" onClick={() => { setButta(false); onButta(); }}>Butta la bozza</button>
          </div>
        </Finestra>
      )}
    </>
  );
}
