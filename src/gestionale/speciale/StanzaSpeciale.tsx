'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  specialeAccendi, specialeCriticaChiedi, specialeCriticaStato, specialeDalDistributore, specialeDistributore, specialeElenco, specialeElimina,
  specialeFotogrammi, specialeSalva, specialeSonda, type Candidato, type DalDistributore, type DatiSpeciale, type DistributoreDelFilm, type FilmInProgramma, type FotogrammiTmdb,
} from './azioni';
import type { SpecialeSalvata } from './salvate';
import { periodo, type Citazione, type ConDate, type FotoDiScena, type Materiale, type Posto } from '@/speciale/proiezioneSpeciale';
import { useAvviso } from '../Avviso';
import Finestra from '../Finestra';
import { immagineTmdb } from '../immagini';
import { SENZA_RISPOSTA } from './esito';
import type { Posto as PostoSito } from './stampa/formati';
import Trascina, { anteprima, trascinabile, type Caricata } from './Trascina';
import Riquadro from './Riquadro';
import ChiHaLeFoto from './ChiHaLeFoto';

/**
 * La stanza Speciale: inserire, cambiare, spegnere o togliere la proiezione
 * speciale che apre la Home, con le foto e la critica da trascinare,
 * «Riempi dal distributore», «Critica dal trailer» e «Chi ha le foto?». Vale
 * finché il film ha spettacoli in programma; spenta resta salvata e il sito
 * non la mostra. Niente arriva al sito finché non si preme «Salva».
 * Dalla v1 (`_speciale/SpecialeRoom.tsx`), nel tema Fornace.
 */

const POSTO_BANNER: Posto = { x: 25, y: 76, w: 50, h: 11, riquadro: true };
const POSTO_LOCANDINA: Posto = { x: 20, y: 90, w: 60, h: 4, riquadro: false };

function vuota(film?: FilmInProgramma): DatiSpeciale {
  return { tmdbId: film?.tmdbId ?? 0, attiva: true, inizio: film ? film.primo.slice(0, 10) : '', sopra: '', casaNome: '', casaLogo: '', fondale: '', citazioni: [], carattere: null, materiale: null };
}

function daSalvata(x: SpecialeSalvata): DatiSpeciale {
  return {
    id: x.id, tmdbId: x.tmdbId, attiva: x.attiva, inizio: x.inizio, sopra: x.sopra,
    casaNome: x.casa.nome, casaLogo: x.casa.logo, fondale: x.fondale,
    citazioni: x.citazioni, carattere: x.carattere ?? null, materiale: x.materiale ?? null,
  };
}

/** Il distributore italiano del film: chi è, dove sta il materiale, com'è la sua area stampa. */
function Distributore({ d }: { d: DistributoreDelFilm | null | undefined }) {
  if (d === undefined) return <p className="g-nota">Cerco il distributore italiano…</p>;
  if (!d) return <p className="g-nota">Distributore italiano non trovato (né nelle aree stampa né su MyMovies).</p>;
  return (
    <p className="g-nota s-link">
      <b>{d.nome}</b>
      {d.sito && <> · <a href={d.sito} target="_blank" rel="noreferrer">sito ↗</a></>}
      {d.pagina && <> · <a href={d.pagina} target="_blank" rel="noreferrer">pagina del film ↗</a></>}
      {d.fonte.startsWith('http') && <> · <a href={d.fonte} target="_blank" rel="noreferrer">scheda MyMovies ↗</a></>}
      <br />{d.nota}
    </p>
  );
}

function sposta<T>(xs: T[], da: number, a: number): T[] {
  if (a < 0 || a >= xs.length || da === a) return xs;
  const out = [...xs];
  const [x] = out.splice(da, 1);
  out.splice(a, 0, x);
  return out;
}

export default function StanzaSpeciale() {
  const di = useAvviso();
  const errore = useCallback((m: string) => di(m, 'errore'), [di]);
  const [speciali, setSpeciali] = useState<SpecialeSalvata[] | null>(null);
  const [film, setFilm] = useState<FilmInProgramma[]>([]);
  const [bozza, setBozza] = useState<DatiSpeciale | null>(null);
  const [tmdb, setTmdb] = useState<FotogrammiTmdb | null>(null);
  const [distIt, setDistIt] = useState<DistributoreDelFilm | null | undefined>(undefined);
  const [salvo, setSalvo] = useState(false);
  const [daEliminare, setDaEliminare] = useState<SpecialeSalvata | null>(null);
  const [dist, setDist] = useState<DalDistributore | null>(null);
  const [cerco, setCerco] = useState(false);
  const [leggo, setLeggo] = useState<string | null>(null);
  const [paginaDist, setPaginaDist] = useState('');
  const [candidati, setCandidati] = useState<Map<number, Candidato | { errore: string }> | null>(null);

  const carica = useCallback(async () => {
    const r = await specialeElenco().catch(() => ({ ok: false as const, errore: SENZA_RISPOSTA }));
    if (r.ok) {
      setSpeciali(r.speciali);
      setFilm(r.film);
    } else {
      errore(r.errore);
      setSpeciali([]);
    }
  }, [errore]);
  useEffect(() => { void carica(); }, [carica]);

  const tmdbId = bozza?.tmdbId ?? 0;
  useEffect(() => {
    if (!tmdbId) return;
    let vivo = true;
    specialeFotogrammi(tmdbId).then(r => { if (vivo) setTmdb(r.ok ? r : null); }).catch(() => { if (vivo) setTmdb(null); });
    return () => { vivo = false; };
  }, [tmdbId]);

  // In una bozza nuova senza logo, la pagina d'apertura parte già con il distributore.
  useEffect(() => {
    if (!tmdbId) return;
    let vivo = true;
    setDistIt(undefined);
    specialeDistributore(tmdbId)
      .then(r => {
        if (!vivo) return;
        const d = r.ok ? r.distributore : null;
        setDistIt(d);
        if (d?.logo) setBozza(b => (b && !b.id && !b.casaLogo && b.tmdbId === tmdbId ? { ...b, casaLogo: d.logo!, casaNome: d.nome } : b));
      })
      .catch(() => { if (vivo) setDistIt(null); });
    return () => { vivo = false; };
  }, [tmdbId]);

  const filmDi = useMemo(() => new Map(film.map(f => [f.tmdbId, f])), [film]);
  const scelto = bozza ? filmDi.get(bozza.tmdbId) : undefined;
  const date = scelto && bozza && /^\d{4}-\d{2}-\d{2}$/.test(bozza.inizio) ? periodo(bozza.inizio, scelto.ultimo, new Date()) : 'Dal … al …';

  const cambia = (p: Partial<DatiSpeciale>) => setBozza(b => (b ? { ...b, ...p } : b));
  const materiale = (p: Partial<Materiale>) => setBozza(b => (b ? { ...b, materiale: { ...(b.materiale ?? {}), ...p } } : b));
  const cit = (i: number, p: Partial<Citazione>) => setBozza(b => (b ? { ...b, citazioni: b.citazioni.map((c, j) => (j === i ? { ...c, ...p } : c)) } : b));

  /**
   * «Critica dal trailer»: segna la richiesta, apre vestricritica:// (l'app sul
   * Mac scarica il trailer italiano e lo legge) e aspetta la risposta. Le
   * citazioni arrivano in fondo alla bozza, senza doppioni.
   */
  async function criticaDalTrailer() {
    if (!bozza?.tmdbId) return errore('Prima scegli il film.');
    const id = bozza.tmdbId;
    const chiesta = await specialeCriticaChiedi(id).catch(() => ({ ok: false as const, errore: SENZA_RISPOSTA }));
    if (!chiesta.ok) return errore(chiesta.errore);
    setLeggo('Apro «Critica dal trailer» sul Mac…');
    window.location.href = `vestricritica://leggi?tmdb=${id}&sito=${encodeURIComponent(window.location.origin)}`;
    const inizio = Date.now();
    try {
      for (;;) {
        await new Promise(ok => setTimeout(ok, 2500));
        const r = await specialeCriticaStato(id).catch(() => null);
        if (!r) continue;
        if (!r.ok) return errore(r.errore);
        const c = r.critica;
        if (c.stato === 'errore') return errore(c.messaggio || 'Il Mac non ce l’ha fatta.');
        if (c.stato === 'fatto') {
          setBozza(b => {
            if (!b || b.tmdbId !== id) return b;
            const gia = new Set(b.citazioni.map(x => x.testo.trim().toLowerCase()));
            const nuove = c.citazioni
              .filter(x => !gia.has(x.testo.trim().toLowerCase()))
              .map((x, k) => ({ ...x, fondale: x.fondale || tmdb?.fotogrammi[(b.citazioni.length + k + 1) % Math.max(1, tmdb.fotogrammi.length)] || '' }));
            return { ...b, citazioni: [...b.citazioni, ...nuove], carattere: c.carattere ?? b.carattere };
          });
          di(`${c.messaggio} Controlla frasi e testate, poi salva.`);
          return;
        }
        if (c.stato === 'attesa' && Date.now() - inizio > 25_000) {
          return errore('Il Mac non ha risposto. Serve l’app «Critica dal trailer» su questo Mac, e il browser deve poterla aprire.');
        }
        if (c.stato === 'lavoro' && c.ferma > 240) return errore('Il Mac si è fermato a metà. Riprova.');
        setLeggo(c.messaggio || 'Il Mac lavora…');
      }
    } finally {
      setLeggo(null);
    }
  }

  /** «Riempi dal distributore»: banner, locandina e foto nei posti ancora vuoti della bozza. */
  async function riempiDalDistributore() {
    if (!bozza?.tmdbId) return errore('Prima scegli il film.');
    setCerco(true);
    try {
      const r = await specialeDalDistributore(bozza.tmdbId, paginaDist.trim() || undefined)
        .catch(() => ({ ok: false as const, errore: `${SENZA_RISPOSTA} Se si ripete, apri la pagina del distributore e trascina le immagini a mano.` }));
      if (!r.ok) return errore(r.errore);
      setDist(r);
      const con = (c: { src: string; w: number; h: number } | undefined, posto: Posto) => (c ? { ...c, date: posto } : undefined);
      setBozza(b => {
        if (!b) return b;
        const m = b.materiale ?? {};
        return {
          ...b,
          materiale: {
            ...m,
            banner: {
              orizzontale: m.banner?.orizzontale ?? con(r.banner.orizzontale, POSTO_BANNER),
              verticale: m.banner?.verticale ?? con(r.banner.verticale, POSTO_BANNER),
            },
            locandina: m.locandina ?? con(r.locandina, POSTO_LOCANDINA),
            foto: m.foto?.length ? m.foto : r.foto.map(f => ({ ...f })),
          },
        };
      });
      const presi = [r.banner.orizzontale && 'banner orizzontale', r.banner.verticale && 'banner verticale', r.locandina && 'locandina', r.foto.length && `${r.foto.length} foto`].filter(Boolean);
      di(presi.length ? `Da ${r.distributore}: ${presi.join(', ')}. Controlla che non abbiano già le date, poi salva.` : `Trovato su ${r.distributore}, ma senza immagini da scaricare: apri la pagina.`, presi.length ? 'ok' : 'errore');
    } finally {
      setCerco(false);
    }
  }

  async function salva() {
    if (!bozza) return;
    setSalvo(true);
    try {
      const r = await specialeSalva(bozza).catch(() => ({ ok: false as const, errore: `${SENZA_RISPOSTA} La bozza è ancora qui: non chiudere la pagina.` }));
      if (!r.ok) return errore(r.errore);
      di(bozza.attiva ? 'Salvata: è sul sito.' : 'Salvata, spenta: il sito non la mostra.');
      setBozza(null);
      await carica();
    } finally {
      setSalvo(false);
    }
  }

  async function accendi(x: SpecialeSalvata) {
    const r = await specialeAccendi(x.id, !x.attiva).catch(() => ({ ok: false as const, errore: SENZA_RISPOSTA }));
    if (!r.ok) return errore(r.errore);
    di(x.attiva ? 'Spenta: il sito non la mostra più.' : 'Accesa: è sul sito.');
    await carica();
  }

  async function elimina() {
    if (!daEliminare) return;
    const r = await specialeElimina(daEliminare.id).catch(() => ({ ok: false as const, errore: SENZA_RISPOSTA }));
    if (!r.ok) return errore(r.errore);
    di('Tolta dal sito.');
    setDaEliminare(null);
    if (bozza?.id === daEliminare.id) setBozza(null);
    await carica();
  }

  const titolo = (id: number) => filmDi.get(id)?.titolo ?? `Film ${id} (non più in programma)`;

  return (
    <div className="s-stanza">
      <header className="g-testata">
        <div>
          <p className="g-occhiello">Sito · Home</p>
          <h1 className="g-titolo">Proiezione speciale</h1>
        </div>
        <div className="g-testata__azioni">
          <a className="g-tasto" href="/" target="_blank" rel="noreferrer">Apri il sito</a>
          <button type="button" className="g-tasto" onClick={() => setCandidati(c => c ?? new Map())}>Chi ha le foto?</button>
          {!bozza && <button type="button" className="g-tasto g-tasto--pieno" onClick={() => setBozza(vuota())}>Nuova</button>}
        </div>
      </header>
      <p className="g-testo s-intro">
        Finché il film ha spettacoli in programma, la Home si apre con la sua pagina e la ripropone fra gli altri film:
        il banner dopo Oggi, locandina e foto dopo i prossimi giorni, il trailer verticale dopo Più avanti.
        Le date le scrive il sito dal programma. Dopo l’ultimo spettacolo sparisce da sola.
      </p>

      <section className="g-gruppo s-elenco" aria-label="Le proiezioni speciali">
        {speciali === null && <p className="g-nota">Carico…</p>}
        {speciali?.length === 0 && <p className="g-nota">Nessuna proiezione speciale. «Nuova» per crearne una.</p>}
        {!!speciali?.length && (
          <ul className="s-voci">
            {speciali.map(x => (
              <li key={x.id} className="s-voce" data-spenta={x.attiva ? undefined : ''} aria-current={bozza?.id === x.id || undefined}>
                <div className="s-voce__testo">
                  <b>{titolo(x.tmdbId)}</b>
                  <span className="g-nota">
                    {x.attiva ? <span className="s-accesa">Accesa sul sito</span> : 'Spenta'} · dal <span className="num">{x.inizio.split('-').reverse().join('/')}</span> · {x.citazioni.length} citazioni
                    {x.materiale?.foto?.length ? ` · ${x.materiale.foto.length} foto` : ''}
                  </span>
                </div>
                <div className="s-voce__azioni">
                  <button type="button" className="g-tasto g-tasto--piccolo" onClick={() => void accendi(x)}
                    title={x.attiva ? 'Resta salvata, il sito non la mostra' : 'Torna sul sito'}>{x.attiva ? 'Spegni' : 'Accendi'}</button>
                  <button type="button" className="g-tasto g-tasto--piccolo" onClick={() => { setBozza(daSalvata(x)); setDist(null); }}>Cambia</button>
                  <button type="button" className="g-tasto g-tasto--piccolo g-tasto--allarme" onClick={() => setDaEliminare(x)}>Togli</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {candidati && (
        <ChiHaLeFoto film={film} risposte={candidati} speciali={speciali ?? []}
          controlla={async (ids, ancora) => {
            // Tre alla volta: ogni film sono decine di richieste ai distributori.
            setCandidati(m => { const n = new Map(m); for (const id of ids) n.delete(id); return n; });
            const coda = [...ids];
            const lavora = async () => {
              for (let id = coda.shift(); id !== undefined; id = coda.shift()) {
                const r = await specialeSonda(id, ancora).catch(() => ({ ok: false as const, errore: SENZA_RISPOSTA }));
                const risposta = r.ok ? r.candidato : { errore: r.errore };
                setCandidati(m => new Map(m).set(id, risposta));
              }
            };
            await Promise.all([lavora(), lavora(), lavora()]);
          }}
          scegli={f => { setBozza(vuota(f)); setDist(null); }}
          chiudi={() => setCandidati(null)} />
      )}

      {bozza && (
        <div className="s-editor">
          <Sezione titolo="Il film" nota="Il primo giorno serve alle date: il sito sa solo gli spettacoli che devono ancora venire.">
            <div className="s-riga3">
              <label className="g-campo">
                <span>Film in programma</span>
                <select value={bozza.tmdbId || ''}
                  onChange={e => { const f = filmDi.get(Number(e.target.value)); cambia({ tmdbId: Number(e.target.value), inizio: bozza.inizio || f?.primo.slice(0, 10) || '' }); }}>
                  <option value="">Scegli…</option>
                  {film.map(f => <option key={f.tmdbId} value={f.tmdbId}>{f.titolo} · {f.spettacoli} spettacoli</option>)}
                  {bozza.tmdbId > 0 && !filmDi.has(bozza.tmdbId) && <option value={bozza.tmdbId}>{titolo(bozza.tmdbId)}</option>}
                </select>
              </label>
              <label className="g-campo">
                <span>Primo giorno</span>
                <input type="date" value={bozza.inizio} onChange={e => cambia({ inizio: e.target.value })} />
              </label>
              <label className="g-spunta">
                <input type="checkbox" checked={bozza.attiva} onChange={e => cambia({ attiva: e.target.checked })} /> Accesa sul sito
              </label>
            </div>
            <p className="g-nota">Sul sito: <b className="s-date">{date}</b></p>
          </Sezione>

          <Sezione titolo="La pagina d’apertura" nota="Il fotogramma a tutto schermo, la riga sopra il titolo e il logo della casa.">
            <label className="g-campo">
              <span>Sopra il titolo</span>
              <input value={bozza.sopra} placeholder="Un documentario di …" onChange={e => cambia({ sopra: e.target.value })} />
            </label>
            {tmdb?.regia.length ? (
              <button type="button" className="g-tasto g-tasto--piccolo s-suggerito" onClick={() => cambia({ sopra: `Un film di ${tmdb.regia.join(' e ')}` })}>
                Usa la regia: «Un film di {tmdb.regia.join(' e ')}»
              </button>
            ) : null}

            <div className="s-casa">
              <div className="s-casa__scelte">
                <span className="g-etichetta">Distributore italiano</span>
                <Distributore d={distIt} />
                {distIt?.logo && (
                  <div className="s-loghi">
                    <button type="button" className="s-logo" aria-pressed={bozza.casaLogo === distIt.logo}
                      onClick={() => cambia({ casaLogo: distIt.logo!, casaNome: distIt.nome })} title={`${distIt.nome}: clicca o trascinalo nel riquadro`}
                      {...trascinabile(distIt.logo, distIt.nome)}>
                      <img src={immagineTmdb(distIt.logo, 'w185') ?? ''} alt={distIt.nome} />
                    </button>
                  </div>
                )}
                <span className="g-etichetta">Oppure una casa di produzione (TMDB)</span>
                <div className="s-loghi">
                  {tmdb?.loghiCase.map(c => (
                    <button key={c.logo} type="button" className="s-logo" aria-pressed={bozza.casaLogo === c.logo}
                      onClick={() => cambia({ casaLogo: c.logo, casaNome: c.nome })} title={`${c.nome}: clicca o trascinalo nel riquadro`}
                      {...trascinabile(c.logo, c.nome)}>
                      <img src={immagineTmdb(c.logo, 'w185') ?? ''} alt={c.nome} />
                    </button>
                  ))}
                  {bozza.casaLogo && <button type="button" className="g-tasto g-tasto--piccolo" onClick={() => cambia({ casaLogo: '', casaNome: '' })}>Nessun logo</button>}
                </div>
                <input value={bozza.casaNome} placeholder="Nome della casa" onChange={e => cambia({ casaNome: e.target.value })} aria-label="Nome della casa" />
              </div>
              <Trascina valore={bozza.casaLogo || undefined} etichetta="Trascina un logo (PNG trasparente)" proporzioni="5 / 2" formato="logo"
                onCaricate={([c]) => cambia(c.nome ? { casaLogo: c.src, casaNome: c.nome } : { casaLogo: c.src })} onErrore={errore} />
            </div>

            <span className="g-etichetta">Fotogramma d’apertura</span>
            <Trascina valore={bozza.fondale || undefined} etichetta="Trascina il fotogramma, o sceglilo sotto" proporzioni="16 / 9" formato="fondale"
              onCaricate={([c]) => cambia({ fondale: c.src })} onErrore={errore} />
            <Fotogrammi lista={tmdb?.fotogrammi ?? []} scelto={bozza.fondale} onScegli={p => cambia({ fondale: p })} />
          </Sezione>

          <Sezione titolo="La critica" nota="Una frase per schermata, sul suo fotogramma. «Critica dal trailer» legge le citazioni dal trailer italiano, con critico, testata e carattere. Oppure trascina le immagini qui sotto: una citazione per immagine, poi scrivi frase e testata. L’ordine si cambia trascinando le schede.">
            <div className="s-riga">
              <button type="button" className="g-tasto g-tasto--pieno" onClick={() => void criticaDalTrailer()} disabled={leggo !== null || !bozza.tmdbId}>
                {leggo ?? 'Critica dal trailer'}
              </button>
              {bozza.carattere && (
                <span className="g-nota">
                  Carattere dal trailer: <b>{bozza.carattere.famiglia} {bozza.carattere.peso}</b>{' '}
                  <button type="button" className="g-tasto g-tasto--piccolo" onClick={() => cambia({ carattere: null })}>Usa quello del sito</button>
                </span>
              )}
            </div>
            <Trascina etichetta="Trascina qui le immagini delle citazioni" multipla formato="fondale"
              onCaricate={cs => cambia({ citazioni: [...bozza.citazioni, ...cs.map(c => ({ testo: '', fonte: '', fondale: c.src }))] })} onErrore={errore} />
            <Ordinabili
              voci={bozza.citazioni}
              onOrdina={xs => cambia({ citazioni: xs })}
              chiave={(c, i) => `${i}-${c.fondale}`}
              render={(c, i) => (
                <div className="s-citazione">
                  <Trascina valore={c.fondale || undefined} etichetta="Fotogramma" proporzioni="16 / 9" formato="fondale"
                    onCaricate={([x]) => cit(i, { fondale: x.src })} onErrore={errore} />
                  <div className="s-citazione__testo">
                    <textarea value={c.testo} placeholder="La frase, senza virgolette" rows={3} onChange={e => cit(i, { testo: e.target.value })} aria-label="La frase" />
                    <input value={c.fonte} placeholder="La testata (Variety, Roger Ebert…)" onChange={e => cit(i, { fonte: e.target.value })} aria-label="La testata" />
                    <input value={c.critico ?? ''} placeholder="Il critico (facoltativo)" onChange={e => cit(i, { critico: e.target.value })} aria-label="Il critico" />
                    <Fotogrammi lista={tmdb?.fotogrammi ?? []} scelto={c.fondale} onScegli={p => cit(i, { fondale: p })} piccola />
                  </div>
                </div>
              )}
              onTogli={i => cambia({ citazioni: bozza.citazioni.filter((_, j) => j !== i) })}
            />
            <button type="button" className="g-tasto s-suggerito" onClick={() => cambia({ citazioni: [...bozza.citazioni, { testo: '', fonte: '', fondale: tmdb?.fotogrammi[bozza.citazioni.length + 1] ?? '' }] })}>
              + Citazione senza immagine nuova
            </button>
          </Sezione>

          <Sezione titolo="Il materiale del distributore" nota="Banner, locandina e foto fra gli atti della Home. Se l’immagine ha già le date del distributore, cancellale prima: qui sposti il riquadro dove il sito scrive le tue.">
            <div className="s-riempi">
              <label className="g-campo">
                <span>Pagina del distributore (se non la trova da solo)</span>
                <input value={paginaDist} onChange={e => setPaginaDist(e.target.value)} placeholder="https://iwonderpictures.com/projects/…" />
              </label>
              <button type="button" className="g-tasto g-tasto--pieno" onClick={() => void riempiDalDistributore()} disabled={cerco || !bozza.tmdbId}>
                {cerco ? 'Cerco e scarico…' : 'Riempi dal distributore'}
              </button>
            </div>
            <p className="g-nota">
              Cerca il film fra I Wonder, Lucky Red, BIM, Notorious, Teodora ed Europictures, e mette banner, locandina e foto nei posti ancora vuoti.
              Ci vuole anche un minuto: gli zip del distributore pesano decine di mega.
            </p>
            <Distributore d={distIt} />
            {dist && (
              <div className="g-avviso s-trovato s-link">
                <p>
                  Trovato su <b>{dist.distributore}</b> · <a href={dist.pagina} target="_blank" rel="noreferrer">apri la pagina ↗</a>
                  {dist.trailerVerticale && <> · <a href={dist.trailerVerticale} target="_blank" rel="noreferrer">trailer verticale ↗</a></>}
                </p>
                {dist.avvisi.length > 0 && <ul>{dist.avvisi.map(a => <li key={a}>{a}</li>)}</ul>}
                {dist.voci.length > 0 && (
                  <details>
                    <summary>Tutto il materiale della pagina ({dist.voci.length})</summary>
                    <ul className="s-voci-dist">{dist.voci.map(v => <li key={v.url}><a href={v.url} target="_blank" rel="noreferrer">{v.etichetta || v.url}</a></li>)}</ul>
                  </details>
                )}
              </div>
            )}
            <ConLeDate formato="bannerOrizzontale" nome="Banner orizzontale (schermo grande)" valore={bozza.materiale?.banner?.orizzontale} posto={POSTO_BANNER} date={date} errore={errore}
              onCambia={v => materiale({ banner: { ...bozza.materiale?.banner, orizzontale: v } })} />
            <ConLeDate formato="bannerVerticale" nome="Banner verticale (telefono)" valore={bozza.materiale?.banner?.verticale} posto={POSTO_BANNER} date={date} errore={errore}
              onCambia={v => materiale({ banner: { ...bozza.materiale?.banner, verticale: v } })} />
            <ConLeDate formato="locandina" nome="Locandina" valore={bozza.materiale?.locandina} posto={POSTO_LOCANDINA} date={date} errore={errore}
              onCambia={v => materiale({ locandina: v })} />

            <span className="g-etichetta">Foto di scena</span>
            <Trascina etichetta="Trascina qui le foto di scena (anche tante insieme)" multipla formato="foto"
              onCaricate={cs => materiale({ foto: [...(bozza.materiale?.foto ?? []), ...cs.map(c => ({ ...c }))] })} onErrore={errore} />
            <Ordinabili<FotoDiScena>
              voci={bozza.materiale?.foto ?? []}
              onOrdina={xs => materiale({ foto: xs })}
              chiave={f => f.src}
              render={(f, i) => (
                <div className="s-citazione">
                  <img className="s-foto" src={anteprima(f.src)} alt="" />
                  <div className="s-citazione__testo">
                    <input value={f.chi ?? ''} placeholder="Chi c’è (Da sinistra, …)" aria-label="Chi c’è" onChange={e => materiale({ foto: (bozza.materiale?.foto ?? []).map((x, j) => (j === i ? { ...x, chi: e.target.value } : x)) })} />
                    <input value={f.credito ?? ''} placeholder="Credito (Courtesy of A24)" aria-label="Credito" onChange={e => materiale({ foto: (bozza.materiale?.foto ?? []).map((x, j) => (j === i ? { ...x, credito: e.target.value } : x)) })} />
                  </div>
                </div>
              )}
              onTogli={i => materiale({ foto: (bozza.materiale?.foto ?? []).filter((_, j) => j !== i) })}
            />

            <span className="g-etichetta">Trailer verticale</span>
            <p className="g-nota">Il video è troppo pesante per caricarlo da qui: va messo, già ridotto, nella cartella <code>public/speciali</code> del sito. Qui il suo percorso.</p>
            <div className="g-due">
              <label className="g-campo">
                <span>Video (MP4)</span>
                <input value={bozza.materiale?.trailerVerticale?.src ?? ''} placeholder="/speciali/…/trailer-verticale.mp4"
                  onChange={e => materiale({ trailerVerticale: e.target.value ? { src: e.target.value, poster: bozza.materiale?.trailerVerticale?.poster ?? '' } : undefined })} />
              </label>
              <label className="g-campo">
                <span>Fotogramma d’attesa</span>
                <input value={bozza.materiale?.trailerVerticale?.poster ?? ''} placeholder="/speciali/…/trailer-verticale.jpg" disabled={!bozza.materiale?.trailerVerticale?.src}
                  onChange={e => materiale({ trailerVerticale: { src: bozza.materiale?.trailerVerticale?.src ?? '', poster: e.target.value } })} />
              </label>
            </div>
          </Sezione>

          <div className="g-scheda__piede" data-sporco="">
            <span className="g-nota">{bozza.id ? 'Modifiche non ancora sul sito.' : 'Una proiezione nuova: sul sito solo dopo «Salva».'}</span>
            <div className="g-scheda__azioni">
              <button type="button" className="g-tasto" onClick={() => setBozza(null)}>Annulla</button>
              <button type="button" className="g-tasto g-tasto--pieno" onClick={() => void salva()} disabled={salvo}>{salvo ? 'Salvo…' : bozza.id ? 'Salva le modifiche' : 'Salva e metti sul sito'}</button>
            </div>
          </div>
        </div>
      )}

      {daEliminare && (
        <Finestra titolo="Togliere la proiezione speciale?" onChiudi={() => setDaEliminare(null)}>
          <p className="g-testo">
            {titolo(daEliminare.tmdbId)} sparisce dal sito e da questo elenco, e non si recupera.
            Per toglierla solo per un po’ basta spegnerla: resta salvata. Gli spettacoli su Pretix non cambiano.
          </p>
          <div className="g-finestra__azioni">
            <button type="button" className="g-tasto" onClick={() => setDaEliminare(null)}>Annulla</button>
            <button type="button" className="g-tasto g-tasto--allarme" onClick={() => void elimina()}>Togli</button>
          </div>
        </Finestra>
      )}
    </div>
  );
}

function Sezione({ titolo, nota, children }: { titolo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="g-gruppo s-sezione">
      <div>
        <h2 className="s-sezione__titolo">{titolo}</h2>
        {nota && <p className="g-nota">{nota}</p>}
      </div>
      {children}
    </section>
  );
}

/** I fotogrammi senza scritte del film, da TMDB: un clic per sceglierlo. */
function Fotogrammi({ lista, scelto, onScegli, piccola }: { lista: string[]; scelto: string; onScegli: (p: string) => void; piccola?: boolean }) {
  if (!lista.length) return null;
  return (
    <div className="s-striscia" data-piccola={piccola || undefined} role="listbox" aria-label="Fotogrammi da TMDB">
      {lista.map(p => (
        <button key={p} type="button" role="option" aria-selected={p === scelto} className="s-fotogramma" onClick={() => onScegli(p)}>
          <img src={immagineTmdb(p, 'w300') ?? ''} alt="" loading="lazy" />
        </button>
      ))}
    </div>
  );
}

/** Un'immagine su cui il sito scrive le date: si trascina, si sposta il riquadro, si spengono le date. */
function ConLeDate({ nome, formato, valore, posto, date, onCambia, errore }: {
  nome: string; formato: PostoSito; valore?: ConDate; posto: Posto; date: string; onCambia: (v: ConDate | undefined) => void; errore: (m: string) => void;
}) {
  const metti = (c: Caricata) => onCambia({ src: c.src, w: c.w, h: c.h, date: valore?.date ?? posto });
  return (
    <div className="s-condate">
      <div className="s-condate__capo">
        <span className="g-etichetta">{nome}</span>
        {valore && (
          <div className="s-riga">
            <label className="g-spunta"><input type="checkbox" checked={!!valore.date} onChange={e => onCambia({ ...valore, date: e.target.checked ? posto : undefined })} /> Scrivi le date</label>
            {valore.date && (
              <label className="g-spunta"><input type="checkbox" checked={valore.date.riquadro} onChange={e => onCambia({ ...valore, date: { ...valore.date!, riquadro: e.target.checked } })} /> Con la cornice</label>
            )}
            <button type="button" className="g-tasto g-tasto--piccolo g-tasto--allarme" onClick={() => onCambia(undefined)}>Togli l’immagine</button>
          </div>
        )}
      </div>
      {valore?.date ? <Riquadro src={valore.src} w={valore.w} h={valore.h} posto={valore.date} periodo={date} onCambia={p => onCambia({ ...valore, date: p })} /> : null}
      <Trascina valore={valore && !valore.date ? valore.src : undefined} etichetta={valore ? 'Trascina per sostituire' : `Trascina qui: ${nome.toLowerCase()}`}
        formato={formato} sorgente={valore ? { src: valore.src, w: valore.w, h: valore.h } : undefined}
        onCaricate={([c]) => metti(c)} onErrore={errore} />
    </div>
  );
}

/** Schede che si riordinano trascinandole (o con le frecce). */
function Ordinabili<T>({ voci, onOrdina, onTogli, render, chiave }: {
  voci: T[]; onOrdina: (xs: T[]) => void; onTogli: (i: number) => void; render: (x: T, i: number) => React.ReactNode; chiave: (x: T, i: number) => string;
}) {
  const [preso, setPreso] = useState<number | null>(null);
  const [sopra, setSopra] = useState<number | null>(null);
  if (!voci.length) return null;
  return (
    <ol className="s-ordinabili">
      {voci.map((x, i) => (
        <li key={chiave(x, i)} className="s-scheda" data-sopra={(sopra === i && preso !== i) || undefined}
          onDragOver={e => { if (preso == null) return; e.preventDefault(); setSopra(i); }}
          onDrop={e => { if (preso == null) return; e.preventDefault(); onOrdina(sposta(voci, preso, i)); setPreso(null); setSopra(null); }}>
          <div className="s-scheda__comandi">
            <span className="s-presa" draggable onDragStart={e => { setPreso(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); }}
              onDragEnd={() => { setPreso(null); setSopra(null); }} title="Trascina per cambiare l’ordine" aria-hidden>⠿</span>
            <button type="button" className="s-freccia" onClick={() => onOrdina(sposta(voci, i, i - 1))} disabled={i === 0} aria-label="Su">↑</button>
            <button type="button" className="s-freccia" onClick={() => onOrdina(sposta(voci, i, i + 1))} disabled={i === voci.length - 1} aria-label="Giù">↓</button>
            <button type="button" className="s-freccia" onClick={() => onTogli(i)} aria-label="Togli">×</button>
          </div>
          {render(x, i)}
        </li>
      ))}
    </ol>
  );
}
