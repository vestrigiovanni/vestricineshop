'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  avvisoEta, avvisoPostiPresi, divietoNormale, emailValida, file, nomePosto, postiDaPretix, postoBreve, prenotabile,
  type Posto, type PostoPretix,
} from './regole';

/**
 * La biglietteria della Home: ogni «Prenota» della pagina (`a[data-prenota]`)
 * apre la sala sopra la pagina invece di andare su Pretix. Senza JavaScript il
 * link porta ancora alla cassa di Pretix. Anche `/?subevent=123` (i vecchi
 * link della v1) apre la sala di quello spettacolo.
 *
 * Tre passi: la sala (i posti si rileggono ogni 20 secondi, e un posto scelto
 * che intanto prende qualcun altro si toglie e lo si dice), la conferma (senza
 * email in grande, l'email sotto per chi vuole la copia: Gio, 30/10/2026), e
 * il biglietto, coi QR e «Scarica PDF». Il browser parla solo con `/api/seats`
 * e `/api/book`: Pretix lo vede solo il server.
 */
export interface SpettacoloInVendita {
  id: number;
  data: string;
  giorno: string;
  ora: string;
  sala: string;
  lingua: string;
  esaurito: boolean;
}
export interface FilmInVendita {
  id: number;
  titolo: string;
  logo: string;
  fondale: string;
  divieto: string;
  spettacoli: SpettacoloInVendita[];
}

const RILEGGI_MS = 20_000;
const img = (p: string, misura: string) => (!p ? '' : p.startsWith('http') ? p : `https://image.tmdb.org/t/p/${misura}${p}`);

type Ordine = { code: string; secret: string; positions: { id: number; secret: string; seat?: { name?: string; row_name?: string; seat_number?: string } | null }[] };
type Passo = 'eta' | 'sala' | 'conferma' | 'fatto';

export default function Biglietteria({ films }: { films: FilmInVendita[] }) {
  const [aperto, setAperto] = useState<{ film: FilmInVendita; show: SpettacoloInVendita; accento: string } | null>(null);

  const apri = useCallback((id: number, da?: Element | null) => {
    for (const film of films) {
      const show = film.spettacoli.find(s => s.id === id);
      if (!show) continue;
      const accento = da ? getComputedStyle(da).getPropertyValue('--f-accento').trim() : '';
      setAperto({ film, show, accento });
      return true;
    }
    return false;
  }, [films]);

  // I «Prenota» della pagina aprono la sala qui.
  useEffect(() => {
    const clic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[data-prenota]');
      if (a && apri(Number(a.getAttribute('data-prenota')), a)) e.preventDefault();
    };
    document.addEventListener('click', clic);
    const voluto = Number(new URLSearchParams(location.search).get('subevent'));
    if (voluto) apri(voluto, document.querySelector(`a[data-prenota="${voluto}"]`));
    return () => document.removeEventListener('click', clic);
  }, [apri]);

  const chiudi = useCallback(() => setAperto(null), []);
  if (!aperto) return null;
  return (
    <Sala key={aperto.show.id} {...aperto}
      cambia={id => apri(id, document.querySelector(`a[data-prenota="${id}"]`))}
      chiudi={chiudi} />
  );
}

// ─── La finestra ──────────────────────────────────────────────────────────

function Sala({ film, show, accento, cambia, chiudi }: {
  film: FilmInVendita; show: SpettacoloInVendita; accento: string; cambia: (id: number) => void; chiudi: () => void;
}) {
  const eta = avvisoEta(film.divieto);
  const [passo, setPasso] = useState<Passo>(eta?.divieto ? 'eta' : 'sala');
  const [scelti, setScelti] = useState<Map<string, string>>(new Map());
  const [avviso, setAvviso] = useState<string | null>(null);
  const [ordine, setOrdine] = useState<Ordine | null>(null);
  const [orari, setOrari] = useState(false);
  const pannello = useRef<HTMLDivElement>(null);
  const altri = film.spettacoli.filter(s => s.id !== show.id);

  // Lo sfondo non scorre (su iOS non basta overflow: il body va fissato), Esc chiude, il fuoco resta dentro.
  useEffect(() => {
    const { body } = document;
    const y = scrollY;
    const prima = { position: body.style.position, top: body.style.top, width: body.style.width };
    Object.assign(body.style, { position: 'fixed', top: `-${y}px`, width: '100%' });
    const daDove = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => pannello.current?.querySelector<HTMLElement>('button, a[href], input')?.focus({ preventScroll: true }));
    const tasti = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { chiudi(); return; }
      if (e.key !== 'Tab' || !pannello.current) return;
      const f = [...pannello.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input')].filter(x => x.offsetParent);
      if (!f.length) return;
      if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      else if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    };
    addEventListener('keydown', tasti);
    return () => {
      removeEventListener('keydown', tasti);
      Object.assign(body.style, prima);
      document.documentElement.style.scrollBehavior = 'auto';
      scrollTo(0, y);
      document.documentElement.style.scrollBehavior = '';
      daDove?.focus?.({ preventScroll: true });
    };
  }, [chiudi]);

  const tocca = (p: Posto) => {
    setAvviso(null);
    setScelti(prev => {
      const n = new Map(prev);
      if (n.has(p.id)) n.delete(p.id); else n.set(p.id, p.etichetta);
      return n;
    });
  };
  const presi = useCallback((p: Posto[]) => {
    setScelti(prev => {
      if (!p.some(x => prev.has(x.id))) return prev;
      const n = new Map(prev);
      p.forEach(x => n.delete(x.id));
      return n;
    });
    setAvviso(avvisoPostiPresi(p.map(x => postoBreve(x.etichetta))));
  }, []);

  const etichette = [...scelti.values()];
  const stile = accento ? ({ '--f-accento': accento } as React.CSSProperties) : undefined;
  const divieto = divietoNormale(film.divieto);

  return (
    <div className="bt" role="dialog" aria-modal="true" aria-label={`Prenotazione: ${film.titolo}`} style={stile} data-passo={passo}>
      {film.fondale && <img className="bt-fondale" src={img(film.fondale, 'w1280')} alt="" />}
      <div className="bt-pannello" ref={pannello}>
        <header className="bt-testa">
          <div className="bt-barra">
            {passo === 'conferma'
              ? <button type="button" className="bt-tasto" onClick={() => setPasso('sala')}>← Cambia posti</button>
              : <span />}
            <button type="button" className="bt-tasto bt-chiudi" onClick={chiudi} aria-label="Chiudi">×</button>
          </div>
          <div className="bt-film">
            {film.logo
              ? <img className="bt-logo" src={img(film.logo, 'w500')} alt={film.titolo} />
              : <h2 className="bt-titolo">{film.titolo}</h2>}
            <p className="bt-dati">{[show.sala, show.lingua, divieto !== 'T' ? divieto : ''].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="bt-quando">
            <span className="bt-etichetta">Quando</span>
            <span className="bt-giorno">{show.giorno}</span>
            <span className="bt-ora cifre">{show.ora}</span>
            {altri.length > 0 && (passo === 'sala' || passo === 'eta') && (
              <button type="button" className="bt-cambia" aria-expanded={orari} onClick={() => setOrari(o => !o)}>{orari ? 'Chiudi' : 'Cambia orario'}</button>
            )}
          </div>
          {orari && (
            <ul className="bt-orari">
              {altri.map(s => (
                <li key={s.id}>
                  <button type="button" disabled={s.esaurito} onClick={() => cambia(s.id)}>
                    <span>{s.giorno}</span><span className="cifre">{s.esaurito ? 'esaurito' : s.ora}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </header>

        {passo === 'eta' ? (
          <section className="bt-avviso" aria-labelledby="bt-eta">
            <h3 id="bt-eta">Vietato ai minori di 18 anni</h3>
            <p>{eta?.testo} All&apos;ingresso può essere chiesto un documento.</p>
            <div className="azioni">
              <button type="button" className="prenota" onClick={() => setPasso('sala')}>Ho almeno 18 anni</button>
              <button type="button" className="bt-tasto" onClick={chiudi}>Torna al programma</button>
            </div>
          </section>
        ) : passo === 'fatto' && ordine ? (
          <Biglietti ordine={ordine} film={film} show={show} />
        ) : (
          <>
            <Mappa spettacolo={show.id} scelti={scelti} tocca={tocca} presi={presi} ferma={passo === 'conferma'} avviso={avviso} />
            <footer className="bt-piede">
              {eta && !eta.divieto && <p className="bt-legale">{eta.testo}</p>}
              {passo === 'conferma'
                ? <Conferma spettacolo={show.id} posti={[...scelti.keys()]} etichette={etichette} fatto={o => { setOrdine(o); setPasso('fatto'); }} />
                : (
                  <>
                    <dl className="bt-conto">
                      <div><dt className="bt-etichetta">Posti</dt><dd>{etichette.length ? etichette.map(postoBreve).join(' · ') : '—'}</dd></div>
                      <div><dt className="bt-etichetta">Costo</dt><dd>Gratuito</dd></div>
                    </dl>
                    <button type="button" className="prenota bt-avanti" disabled={!etichette.length} onClick={() => setPasso('conferma')}>
                      {etichette.length ? `Prenota ${etichette.length} ${etichette.length === 1 ? 'posto' : 'posti'} →` : 'Scegli i posti'}
                    </button>
                    <p className="bt-nota">La prenotazione chiude 2 minuti prima dell&apos;inizio.</p>
                  </>
                )}
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

// ─── La sala ──────────────────────────────────────────────────────────────

function Mappa({ spettacolo, scelti, tocca, presi, ferma, avviso }: {
  spettacolo: number; scelti: Map<string, string>; tocca: (p: Posto) => void; presi: (p: Posto[]) => void; ferma: boolean; avviso: string | null;
}) {
  const [posti, setPosti] = useState<Posto[] | null>(null);
  const [errore, setErrore] = useState(false);
  const sceltiRef = useRef(scelti);
  useEffect(() => { sceltiRef.current = scelti; }, [scelti]);

  const leggi = useCallback(async (zitto = false) => {
    try {
      const r = await fetch(`/api/seats?subeventId=${spettacolo}`, { cache: 'no-store' });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      const p = postiDaPretix(d.seats as PostoPretix[]);
      const rubati = p.filter(x => !prenotabile(x) && sceltiRef.current.has(x.id));
      if (rubati.length) presi(rubati);
      setPosti(p);
      setErrore(false);
    } catch {
      // Un aggiornamento in sottofondo che non va non cancella la sala che si sta guardando.
      if (!zitto) setErrore(true);
    }
  }, [spettacolo, presi]);

  useEffect(() => {
    leggi();
    const t = setInterval(() => { if (document.visibilityState === 'visible') leggi(true); }, RILEGGI_MS);
    return () => clearInterval(t);
  }, [leggi]);

  if (errore && !posti) return (
    <section className="bt-sala bt-sala--vuota" role="alert">
      <p className="bt-avviso-titolo">Non riesco a leggere i posti</p>
      <p>Controlla la connessione e riprova.</p>
      <button type="button" className="bt-tasto" onClick={() => { setErrore(false); leggi(); }}>Riprova</button>
    </section>
  );
  if (!posti) return <section className="bt-sala bt-sala--vuota" aria-busy="true"><p>Accendo le luci in sala…</p></section>;
  if (!posti.some(prenotabile) && !scelti.size) return (
    <section className="bt-sala bt-sala--vuota">
      <p className="bt-avviso-titolo">Posti esauriti</p>
      <p>Per questa proiezione non è rimasto un posto libero. Prova un altro orario.</p>
    </section>
  );

  const righe = file(posti);
  const conFila = righe.some(r => r.fila);
  return (
    <section className="bt-sala" aria-label="La sala" inert={ferma}>
      {avviso && <p className="bt-rubato" role="status">{avviso}</p>}
      <div className="bt-schermo" aria-hidden><span>Schermo</span></div>
      <div className="bt-file">
        {righe.map(({ fila, posti: inFila }, i) => (
          <div key={fila || 'sala'} className="bt-fila" style={{ ['--i' as string]: i }}>
            {conFila && <span className="bt-nome-fila" aria-hidden>{fila}</span>}
            <div className="bt-poltrone">
              {inFila.map(p => {
                const su = scelti.has(p.id), no = !prenotabile(p);
                return (
                  <button key={p.id} type="button" className="bt-posto" data-stato={no ? 'preso' : su ? 'scelto' : 'libero'}
                    disabled={no} aria-pressed={su} aria-label={`${p.etichetta}${p.vip ? ', poltrona VIP: non prenotabile online' : no ? ', occupato' : ''}`}
                    onClick={() => tocca(p)}>
                    <span aria-hidden>{p.numero || p.etichetta}</span>
                  </button>
                );
              })}
            </div>
            {conFila && <span className="bt-nome-fila" aria-hidden>{fila}</span>}
          </div>
        ))}
      </div>
      <ul className="bt-legenda" aria-hidden>
        <li data-stato="libero">Libero</li><li data-stato="scelto">Scelto</li><li data-stato="preso">Non disponibile</li>
      </ul>
    </section>
  );
}

// ─── La conferma ──────────────────────────────────────────────────────────

function Conferma({ spettacolo, posti, etichette, fatto }: { spettacolo: number; posti: string[]; etichette: string[]; fatto: (o: Ordine) => void }) {
  const [email, setEmail] = useState('');
  const [invio, setInvio] = useState<'senza' | 'email' | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const prenota = async (conEmail: boolean) => {
    if (conEmail && !emailValida(email)) { setErrore('Questo indirizzo email non va bene: controllalo.'); return; }
    setInvio(conEmail ? 'email' : 'senza');
    setErrore(null);
    try {
      const r = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subeventId: spettacolo, seats: posti, email: conEmail ? email.trim() : '' }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.error || 'La prenotazione non è andata a buon fine. Riprova fra un momento.');
      fatto(d.order);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
      setInvio(null);
    }
  };

  return (
    <div className="bt-conferma">
      <span className="bt-etichetta">Quasi fatto</span>
      <p className="bt-scelti">{etichette.map(postoBreve).join(' · ')}</p>
      <button type="button" className="prenota bt-avanti" disabled={!!invio} onClick={() => prenota(false)}>
        {invio === 'senza' ? 'Prenoto…' : 'Prenota senza email'}
      </button>
      <form className="bt-email" onSubmit={e => { e.preventDefault(); prenota(true); }}>
        <label htmlFor="bt-email">Oppure ricevi il biglietto anche per email</label>
        <div>
          <input id="bt-email" type="email" autoComplete="email" inputMode="email" placeholder="La tua email" value={email} onChange={e => setEmail(e.target.value)} />
          <button type="submit" className="bt-tasto" disabled={!!invio || !email}>{invio === 'email' ? 'Prenoto…' : 'Conferma'}</button>
        </div>
      </form>
      {errore && <p className="bt-errore" role="alert">{errore}</p>}
    </div>
  );
}

// ─── Il biglietto ─────────────────────────────────────────────────────────

function Biglietti({ ordine, film, show }: { ordine: Ordine; film: FilmInVendita; show: SpettacoloInVendita }) {
  const [qr, setQr] = useState<Record<string, string>>({});
  useEffect(() => {
    let vivo = true;
    Promise.all(ordine.positions.map(async p => [p.secret, await QRCode.toString(p.secret, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#0f0b09', light: '#0000' } })] as const))
      .then(xs => { if (vivo) setQr(Object.fromEntries(xs)); });
    return () => { vivo = false; };
  }, [ordine]);
  const pdf = `/api/biglietto?ordine=${encodeURIComponent(ordine.code)}&chiave=${encodeURIComponent(ordine.secret)}`;

  return (
    <section className="bt-fatto" aria-labelledby="bt-fatto">
      <p className="bt-etichetta">Prenotato · ordine <span className="cifre">{ordine.code}</span></p>
      <h3 id="bt-fatto">Ci vediamo in sala.</h3>
      <p className="bt-dati">{film.titolo} · {show.giorno} alle {show.ora}{show.sala ? ` · ${show.sala}` : ''}</p>
      <ul className="bt-qr">
        {ordine.positions.map(p => (
          <li key={p.id}>
            <span className="bt-qr__codice" dangerouslySetInnerHTML={{ __html: qr[p.secret] || '' }} role="img" aria-label={`QR del biglietto, ${nomePosto(p.seat)}`} />
            <span className="bt-qr__posto">{postoBreve(nomePosto(p.seat))}</span>
          </li>
        ))}
      </ul>
      <div className="azioni">
        <a className="prenota" href={pdf} download>Scarica PDF</a>
      </div>
      <p className="bt-nota">All&apos;ingresso mostra il QR, dal telefono o dal PDF. Se hai lasciato l&apos;email, ti arriva anche lì.</p>
    </section>
  );
}
