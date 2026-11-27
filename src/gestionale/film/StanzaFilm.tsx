'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAvviso } from '../Avviso';
import Finestra from '../Finestra';
import { immagineTmdb, quando } from '../immagini';
import { apriFilm, elencoFilm, type FilmAperto, type VoceFilm } from './azioni';
import SchedaFilm from './SchedaFilm';
import { prossima } from './scheda';

type Riga = VoceFilm & { prossima: string | null; quante: number };

/**
 * La stanza Film: a sinistra i film (quelli in sala, dal più vicino; oppure
 * tutte le schede), a destra la scheda aperta. `?tmdb=` apre subito un film.
 */
export default function StanzaFilm({ iniziale }: { iniziale: string | null }) {
  const di = useAvviso();
  const [righe, setRighe] = useState<Riga[] | null>(null);
  const [vista, setVista] = useState<'sala' | 'tutte'>('sala');
  const [cerca, setCerca] = useState('');
  const [aperto, setAperto] = useState<{ film: FilmAperto; n: number } | null>(null);
  const [apro, setApro] = useState<string | null>(null);
  const [sporco, setSporco] = useState(false);
  const [inAttesa, setInAttesa] = useState<string | null>(null);

  const carica = useCallback(async () => {
    const r = await elencoFilm();
    if (!r.ok) {
      setRighe(x => x ?? []);
      return di(r.errore, 'errore');
    }
    const ora = Date.now();
    setRighe(r.film.map(f => ({ ...f, ...prossima(f.spettacoli, ora) })));
  }, [di]);

  useEffect(() => { void carica(); }, [carica]);

  const apri = useCallback(async (tmdbId: string) => {
    setInAttesa(null);
    setApro(tmdbId);
    const r = await apriFilm(tmdbId);
    setApro(null);
    if (!r.ok) return di(r.errore, 'errore');
    setSporco(false);
    setAperto(a => ({ film: r, n: (a?.n ?? 0) + 1 }));
  }, [di]);

  useEffect(() => { if (iniziale) void apri(iniziale); }, [iniziale, apri]);

  const chiudi = () => {
    setInAttesa(null);
    setAperto(null);
    setSporco(false);
  };

  // `inAttesa`: il film da aprire dopo aver lasciato le modifiche, '' per chiudere e basta.
  const scegli = (tmdbId: string) => {
    if (aperto?.film.scheda.tmdbId === tmdbId) return;
    if (sporco) setInAttesa(tmdbId);
    else void apri(tmdbId);
  };

  const q = cerca.trim().toLowerCase();
  const visibili = useMemo(() => {
    const tutte = (righe ?? []).filter(r => !q || r.titolo.toLowerCase().includes(q) || r.tmdbId === q);
    return vista === 'sala'
      ? tutte.filter(r => r.prossima).sort((a, b) => a.prossima!.localeCompare(b.prossima!))
      : tutte.sort((a, b) => a.titolo.localeCompare(b.titolo, 'it'));
  }, [righe, vista, q]);

  const inSala = righe?.filter(r => r.prossima).length ?? 0;
  const scelto = aperto?.film.scheda.tmdbId;

  return (
    <div className="g-stanza-film" data-aperta={aperto ? '' : undefined}>
      <aside className="g-elenco" aria-label="Film">
        <header className="g-elenco__testa">
          <p className="g-occhiello num">{righe ? `${inSala} in sala · ${righe.length} schede` : 'Leggo i film…'}</p>
          <h1 className="g-titolo">Film</h1>
        </header>
        <input className="g-cerca" type="search" value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Cerca un film" aria-label="Cerca un film" />
        <div className="g-scelta" role="group" aria-label="Quali film">
          <button type="button" className="g-scelta__voce" aria-pressed={vista === 'sala'} onClick={() => setVista('sala')}>In sala</button>
          <button type="button" className="g-scelta__voce" aria-pressed={vista === 'tutte'} onClick={() => setVista('tutte')}>Tutte le schede</button>
        </div>
        <ul className="g-righe">
          {visibili.map(r => {
            const loc = immagineTmdb(r.locandina, 'w92');
            return (
              <li key={r.tmdbId}>
                <button type="button" className="g-riga" aria-current={scelto === r.tmdbId || undefined} onClick={() => scegli(r.tmdbId)}>
                  <span className="g-riga__locandina" data-slot>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {loc && <img src={loc} alt="" loading="lazy" />}
                  </span>
                  <span className="g-riga__testo">
                    <span className="g-riga__titolo">{r.titolo}</span>
                    <span className="g-riga__dati num">
                      {r.prossima ? `${quando(r.prossima)} · ${r.quante} in arrivo` : r.spettacoli.length ? 'nessuno spettacolo futuro' : 'senza spettacoli'}
                      {r.lingua ? ` · ${r.lingua.toLowerCase()}` : ''}
                    </span>
                  </span>
                  {apro === r.tmdbId ? <span className="g-segno">apro…</span>
                    : r.stub ? <span className="g-segno" data-allarme>da riempire</span>
                    : r.diGio ? <span className="g-segno" data-tuo>tua</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
        {righe && visibili.length === 0 && <p className="g-nota">{q ? 'Nessun film con questo nome.' : vista === 'sala' ? 'Nessun film in sala.' : 'Nessuna scheda.'}</p>}
      </aside>

      <div className="g-banco">
        {aperto ? (
          <SchedaFilm
            key={`${scelto}@${aperto.n}`}
            aperto={aperto.film}
            onSporco={setSporco}
            onSalvato={carica}
            onAggiornato={film => setAperto(a => ({ film, n: (a?.n ?? 0) + 1 }))}
            onChiudi={() => (sporco ? setInAttesa('') : chiudi())}
          />
        ) : (
          <div className="g-vuoto">
            <p className="g-vuoto__titolo">Scegli un film</p>
            <p className="g-nota">Titolo, trama, lingua, immagini e trailer: quello che scrivi qui vince su TMDB, e lo vedono sito, app e Pretix.</p>
          </div>
        )}
      </div>

      {inAttesa !== null && (
        <Finestra titolo="Modifiche non salvate" onChiudi={() => setInAttesa(null)}>
          <p className="g-testo">Nella scheda aperta ci sono modifiche non salvate. Se {inAttesa ? 'apri un altro film' : 'la chiudi'} si perdono.</p>
          <div className="g-finestra__azioni">
            <button type="button" className="g-tasto" onClick={() => setInAttesa(null)}>Resto qui</button>
            <button type="button" className="g-tasto g-tasto--pieno" onClick={() => (inAttesa ? void apri(inAttesa) : chiudi())}>
              {inAttesa ? 'Apri l’altro' : 'Chiudi senza salvare'}
            </button>
          </div>
        </Finestra>
      )}
    </div>
  );
}
