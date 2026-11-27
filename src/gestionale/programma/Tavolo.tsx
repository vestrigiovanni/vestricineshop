'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { aggancia, filmDaTmdb, genera, trovaPosti } from '@/programma/azioni';
import type { SlotProposal } from '@/programma/planning';
import type { Intensity, ScheduledShow } from '@/programma/motore/engine';
import { MINUTES_PER_DAY, OPENING_MINUTE, addDaysISO, daysBetweenISO, formatClock } from '@/programma/motore/times';
import { useAvviso } from '../Avviso';
import Barra from './Barra';
import type { TavoloData } from './carica';
import {
  addShow, draftBlocksOn, findDraft, mergeRegenerated, rebase, regenerateRequest, replaceShow, showFromSlot, showsFor, unlockedIn, visibleSlots, withoutCommitted,
} from './draft';
import { minuteAt, place, ticks } from './geometry';
import { dayShort, periodLabel } from './labels';
import PannelloBozza from './PannelloBozza';
import PannelloSpettacolo, { type MoveIntent } from './PannelloSpettacolo';
import { SPANS, shiftFrom, spanBetween, toSearch, type Span } from './query';
import Riempi from './Riempi';
import Tabellone from './Tabellone';
import type { CatalogItem } from './types';
import { useCommit } from './useCommit';
import { useDraft } from './useDraft';
import { findBlock, type TavoloBlock, type TavoloDay } from './week';

const SALA_RICORDATA = 'programma:sala';

function posti(b: TavoloBlock): string {
  if (b.soldOut) return 'esaurito';
  if (b.sold === null || b.total === null) return '';
  return `${b.sold}/${b.total}`;
}

const durata = (f: CatalogItem | null) => (f ? f.runtime ?? f.durationMin ?? 0 : 0);

/**
 * La stanza Programma: la settimana di una sala come una timeline. Sopra ci
 * sono gli spettacoli già in sala (da Pretix), la bozza (salvata nel database,
 * `PlanningDraft`) e, quando scegli un film, i posti dove ci sta. Si mette in
 * bozza trascinando, cliccando un posto acceso o con «Riempi i buchi»; poi
 * «Manda in sala» la crea su Pretix. Dalla v1 (`_tavolo/Tavolo.tsx`).
 */
export default function Tavolo({ data }: { data: TavoloData }) {
  const router = useRouter();
  const di = useAvviso();
  const [scelto, setScelto] = useState<string | null>(null);
  const [intento, setIntento] = useState<MoveIntent | null>(null);
  const [trascino, setTrascino] = useState<string | null>(null);
  const [film, setFilm] = useState<CatalogItem | null>(null);
  const [riempi, setRiempi] = useState(false);
  const [rimescolo, setRimescolo] = useState(false);
  const [posti_, setPosti] = useState<{ chiave: string; slots: SlotProposal[]; reason?: string } | null>(null);
  /** Dove hai afferrato il blocco, in minuti dal suo inizio: il film non salta al rilascio. */
  const presa = useRef(0);
  /** I film del catalogo che si stanno trascinando, per riconoscerli al rilascio. */
  const filmVisti = useRef(new Map<string, CatalogItem>());
  const pannelloRef = useRef<HTMLElement>(null);

  const { week, roomId } = data;
  const { draft, savedAt, update, discard } = useDraft(roomId, data.from);
  const commit = useCommit(roomId, creati => {
    update(d => withoutCommitted(d, creati));
    router.refresh();
  });

  const trovato = scelto && week ? findBlock(week, scelto) : null;
  const inBozza = scelto?.startsWith('d:') && draft ? findDraft(draft, scelto) : null;
  const giorniUtili = week ? week.days.filter(d => !d.isPast).map(d => d.date) : [];

  // ── I posti accesi per il film scelto ──────────────────────────────────
  const chiavePosti = film?.tmdbId && roomId !== null ? `${film.tmdbId}@${roomId}@${data.from}@${data.days}` : null;
  useEffect(() => {
    if (!chiavePosti || !film?.tmdbId || roomId === null) return;
    let via = false;
    trovaPosti({ seatingPlanId: roomId, tmdbId: film.tmdbId, fromDate: data.from, maxDays: data.days, horizonDays: data.days })
      .then(r => { if (!via) setPosti({ chiave: chiavePosti, slots: r.days.flatMap(d => d.slots), reason: r.reason }); })
      .catch(() => { if (!via) setPosti({ chiave: chiavePosti, slots: [], reason: 'Non sono riuscito a leggere la sala.' }); });
    return () => { via = true; };
  }, [chiavePosti, film?.tmdbId, roomId, data.from, data.days]);

  const accesi = useMemo(
    () => (draft && film && posti_?.chiave === chiavePosti ? visibleSlots(posti_.slots, draft, durata(film)) : []),
    [draft, film, posti_, chiavePosti],
  );
  const cercoPosti = Boolean(film && chiavePosti && posti_?.chiave !== chiavePosti);

  // ── Navigazione ────────────────────────────────────────────────────────
  const vai = (x: Partial<{ room: number; from: string; days: Span; onlyEmpty: boolean }>, sostituisci = false) => {
    if (roomId === null) return;
    const q = { room: roomId, from: data.from, days: data.days, onlyEmpty: data.onlyEmpty, ...x };
    setScelto(null);
    setIntento(null);
    const url = `/admin/programma${toSearch(q)}`;
    if (sostituisci) router.replace(url);
    else router.push(url);
  };

  // La sala scelta l'ultima volta, se l'indirizzo non ne dice una.
  useEffect(() => {
    if (data.roomFromParam) return;
    let ricordata: string | null = null;
    try { ricordata = localStorage.getItem(SALA_RICORDATA); } catch { /* niente memoria del browser */ }
    const id = Number(ricordata);
    if (id && id !== roomId && data.rooms.some(r => r.id === id)) {
      router.replace(`/admin/programma${toSearch({ room: id, from: data.from, days: data.days, onlyEmpty: data.onlyEmpty })}`);
    }
  }, [data.roomFromParam, data.rooms, data.from, data.days, data.onlyEmpty, roomId, router]);

  useEffect(() => {
    const via = () => setTrascino(null);
    window.addEventListener('dragend', via);
    return () => window.removeEventListener('dragend', via);
  }, []);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      setScelto(null);
      setIntento(null);
      setFilm(null);
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  // Su uno schermo stretto il pannello sta sotto la settimana: ci si porta lì.
  useEffect(() => {
    if (scelto && window.matchMedia('(max-width: 1100px)').matches) pannelloRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [scelto]);

  const scegliSala = (id: number) => {
    try { localStorage.setItem(SALA_RICORDATA, String(id)); } catch { /* vale per questa visita */ }
    vai({ room: id });
  };

  const chiudi = () => { setScelto(null); setIntento(null); };

  const scegliFilm = (f: CatalogItem | null) => {
    setFilm(f);
    if (f) {
      if (f.tmdbId) filmVisti.current.set(f.tmdbId, f);
      setScelto(null);
    }
  };

  // ── Bozza: mettere, spostare ───────────────────────────────────────────
  const minutoGlobale = (giorno: string, minuto: number) => daysBetweenISO(data.from, giorno) * MINUTES_PER_DAY + minuto;

  const agganciaQui = async (show: ScheduledShow, voluto: number) => {
    if (roomId === null || !draft) return null;
    const r = await aggancia(show, voluto, { seatingPlanId: roomId, startDate: data.from, days: data.days, otherShows: showsFor(draft, data.from) });
    if (!r.show) di(r.reason ?? 'Qui non c’è spazio.', 'errore');
    return r.show;
  };

  const metti = async (f: CatalogItem, giorno: string, minuto: number) => {
    const d = durata(f);
    if (!f.tmdbId || d <= 0) return di('Di questo film non conosco la durata: non so dove metterlo.', 'errore');
    const m = Math.max(minuto, OPENING_MINUTE);
    const start = minutoGlobale(giorno, m);
    const bozza: ScheduledShow = {
      tmdbId: f.tmdbId, title: f.title, runtime: d, posterPath: f.posterPath ?? undefined,
      day: giorno, date: giorno, time: formatClock(m), endTime: formatClock(m + d),
      startMinute: start, endMinute: start + d, band: 'evening', locked: true,
    };
    const posto = await agganciaQui(bozza, start);
    if (!posto) return;
    update(x => addShow(x, posto, f));
    di(`«${f.title}» in bozza, ${dayShort(posto.day)} alle ${posto.time}.`);
  };

  const spostaBozza = async (key: string, giorno: string, minuto: number) => {
    const show = draft ? findDraft(draft, key) : null;
    if (!show) return;
    const posto = await agganciaQui(rebase(show, data.from), minutoGlobale(giorno, Math.max(minuto, OPENING_MINUTE)));
    if (!posto) return;
    update(d => replaceShow(d, key, posto));
    setScelto(null);
  };

  const prendiPosto = (s: SlotProposal) => {
    if (!film?.tmdbId) return;
    update(d => addShow(d, showFromSlot({ tmdbId: film.tmdbId!, title: film.title, runtime: durata(film), posterPath: film.posterPath ?? undefined }, s), film));
    di(`«${film.title}» in bozza, ${dayShort(s.day)} alle ${s.time}.`);
  };

  const lascia = (e: React.DragEvent<HTMLDivElement>, giorno: TavoloDay) => {
    e.preventDefault();
    const cosa = e.dataTransfer.getData('text/plain') || trascino;
    setTrascino(null);
    if (!cosa || !week || giorno.isPast) return;
    const r = e.currentTarget.getBoundingClientRect();
    const asse = week.axis.end - week.axis.start;
    const minuto = minuteAt((e.clientX - r.left) / r.width - presa.current / asse, week.axis);
    presa.current = 0;
    if (cosa.startsWith('film:')) {
      const f = filmVisti.current.get(cosa.slice(5));
      if (f) void metti(f, giorno.date, minuto);
      return;
    }
    if (cosa.startsWith('d:')) return void spostaBozza(cosa, giorno.date, minuto);
    setScelto(cosa);
    setIntento({ day: giorno.date, time: formatClock(minuto) });
  };

  const afferra = (e: React.DragEvent<HTMLElement>, key: string, start: number, end: number) => {
    const r = e.currentTarget.getBoundingClientRect();
    presa.current = ((e.clientX - r.left) / r.width) * (end - start);
    e.dataTransfer.setData('text/plain', key);
    e.dataTransfer.effectAllowed = 'move';
    setTrascino(key);
  };

  const replica = async (tmdbId: string) => {
    const f = await filmDaTmdb(tmdbId).catch(() => null);
    if (!f) return di('Non riesco a leggere questo film.', 'errore');
    scegliFilm(f as CatalogItem);
    di('Scegli uno dei posti accesi, o trascina il film sul giorno.');
  };

  // `?tmdb=` accende i posti di quel film (dal Catalogo, dalla scheda Film),
  // poi si toglie dall'indirizzo perché un ricaricamento non lo ripeta.
  const tmdbFatto = useRef<string | null>(null);
  useEffect(() => {
    if (!data.tmdb || tmdbFatto.current === data.tmdb || roomId === null) return;
    tmdbFatto.current = data.tmdb;
    filmDaTmdb(data.tmdb)
      .then(f => {
        if (!f) throw new Error('film non trovato');
        const item = f as CatalogItem;
        if (item.tmdbId) filmVisti.current.set(item.tmdbId, item);
        setFilm(item);
        setScelto(null);
        di('Scegli uno dei posti accesi, o trascina il film sul giorno.');
      })
      .catch(() => di('Non riesco a leggere questo film.', 'errore'));
    router.replace(`/admin/programma${toSearch({ room: roomId, from: data.from, days: data.days, onlyEmpty: data.onlyEmpty })}`);
  }, [data.tmdb, data.from, data.days, data.onlyEmpty, roomId, router, di]);

  const sciolti = draft ? unlockedIn(draft, data.from, data.days) : 0;

  /** Rimescola gli spettacoli messi dal motore; i tuoi restano dove li hai messi. */
  const rimescola = async () => {
    if (!draft || roomId === null) return;
    setRimescolo(true);
    try {
      const req = regenerateRequest(draft, data.from, data.days);
      const r = await genera({
        seatingPlanId: roomId, startDate: data.from, days: data.days, intensity: (draft.intensity as Intensity) || 'normal',
        films: req.films, locked: req.locked, seed: Math.floor(Math.random() * 1_000_000),
      });
      update(d => mergeRegenerated(d, data.from, data.days, r.shows));
      di('Rimescolato: quelli che hai messo tu sono rimasti dov’erano.');
    } catch {
      di('Non sono riuscito a rimescolare. Riprova.', 'errore');
    } finally {
      setRimescolo(false);
    }
  };

  const cambiato = (resta?: boolean) => {
    if (!resta) chiudi();
    router.refresh();
  };

  const giaInBozza = useMemo(() => new Set(draft?.shows.map(s => s.tmdbId) ?? []), [draft]);
  const esistentiIl = (giorno: string) => week?.days.find(d => d.date === giorno)?.blocks.map(b => ({ start: b.start, end: b.end })) ?? [];

  const pannello =
    trovato && roomId !== null ? (
      <PannelloSpettacolo
        key={`${trovato.block.key}@${intento?.day ?? ''}${intento?.time ?? ''}`}
        block={trovato.block}
        day={trovato.day}
        targetDays={giorniUtili}
        roomId={roomId}
        from={data.from}
        intent={intento}
        onChiudi={chiudi}
        onCambiato={cambiato}
        onReplica={replica}
        repliche={week && trovato.block.tmdbId
          ? week.days.flatMap(d => d.blocks
            .filter(b => b.touchable && b.pretixId !== null && b.tmdbId === trovato.block.tmdbId)
            .map(b => ({ pretixId: b.pretixId!, label: `${dayShort(d.date)} ${b.time}` })))
          : []}
      />
    ) : inBozza && draft && roomId !== null ? (
      <PannelloBozza key={scelto!} show={inBozza} draft={draft} roomId={roomId} from={data.from} targetDays={giorniUtili} esistentiIl={esistentiIl} update={update} onScegli={setScelto} />
    ) : null;

  const titolo = data.days === 1 ? 'La giornata' : data.days === 7 ? 'La settimana' : 'Il periodo';

  return (
    <div className="p-stanza">
      <header className="g-testata">
        <div>
          <p className="g-occhiello">Programma · {periodLabel(data.from, data.days)}</p>
          <h1 className="g-titolo">{titolo}</h1>
        </div>
        <div className="g-testata__azioni">
          <button type="button" className="g-tasto" aria-pressed={data.onlyEmpty} data-acceso={data.onlyEmpty || undefined} onClick={() => vai({ onlyEmpty: !data.onlyEmpty }, true)}>Solo vuote</button>
          {sciolti > 0 && <button type="button" className="g-tasto" onClick={() => void rimescola()} disabled={rimescolo}>{rimescolo ? 'Rimescolo…' : 'Rimescola'}</button>}
          <button type="button" className="g-tasto g-tasto--pieno" onClick={() => setRiempi(true)} disabled={!draft || roomId === null}>Riempi i buchi</button>
        </div>
      </header>

      <div className="p-comandi">
        <select value={roomId ?? ''} onChange={e => scegliSala(Number(e.target.value))} aria-label="Sala">
          {data.rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <div className="p-periodo">
          <button type="button" className="g-tasto g-tasto--piccolo g-tasto--tondo" onClick={() => vai({ from: shiftFrom(data.from, data.days, -1) })} aria-label="Periodo precedente">‹</button>
          <label><span className="g-etichetta">dal</span><input type="date" value={data.from} onChange={e => e.target.value && vai({ from: e.target.value })} /></label>
          <label>
            <span className="g-etichetta">al</span>
            <input type="date" value={addDaysISO(data.from, data.days - 1)} min={data.from} max={addDaysISO(data.from, 29)}
              onChange={e => { const n = e.target.value ? spanBetween(data.from, e.target.value) : null; if (n) vai({ days: n }); }} />
          </label>
          <button type="button" className="g-tasto g-tasto--piccolo g-tasto--tondo" onClick={() => vai({ from: shiftFrom(data.from, data.days, 1) })} aria-label="Periodo successivo">›</button>
        </div>
        <div className="g-scelta" role="group" aria-label="Quanti giorni">
          {SPANS.map(s => <button key={s.value} type="button" className="g-scelta__voce" aria-pressed={data.days === s.value} onClick={() => vai({ days: s.value })}>{s.label}</button>)}
        </div>
      </div>

      {film && (
        <div className="p-acceso" role="status">
          <span>
            <b>{film.title}</b>{' '}
            {cercoPosti ? '· cerco dove ci sta…' : accesi.length
              ? `· ${accesi.length} ${accesi.length === 1 ? 'posto acceso' : 'posti accesi'}: clicca quello che vuoi, o trascinalo sul giorno`
              : `· ${posti_?.reason ?? 'nessun posto libero in questo periodo'}`}
          </span>
          <button type="button" className="g-tasto g-tasto--piccolo" onClick={() => setFilm(null)}>Lascia stare</button>
        </div>
      )}

      {!week ? (
        <div className="g-vuoto">
          <p className="g-vuoto__titolo">{data.rooms.length === 0 ? 'Pretix non risponde' : 'Nessuna sala scelta'}</p>
          <p className="g-nota">{data.rooms.length === 0 ? 'Non trovo le sale su Pretix: riprova fra poco.' : 'Scegli una sala qui sopra.'}</p>
        </div>
      ) : (
        <div className="p-tavolo">
          <div className="p-settimana">
            <div className="p-righello" aria-hidden>
              <span />
              <div>{ticks(week.axis).map(t => <span key={t.minute} style={{ left: `${t.left}%` }}>{t.label}</span>)}</div>
            </div>

            {week.days.map(giorno => {
              const bozze = draft ? draftBlocksOn(draft, giorno.date) : [];
              const qui = accesi.filter(s => s.day === giorno.date);
              return (
                <div key={giorno.date} className="p-giorno" data-passato={giorno.isPast || undefined} data-weekend={giorno.isWeekend || undefined}>
                  <span className="p-giorno__nome">{dayShort(giorno.date)}</span>

                  <div
                    className="p-binario"
                    data-bersaglio={trascino && !giorno.isPast ? '' : undefined}
                    onDragOver={e => { if (trascino && !giorno.isPast) e.preventDefault(); }}
                    onDrop={e => lascia(e, giorno)}
                    onClick={e => { if (e.target === e.currentTarget) chiudi(); }}
                  >
                    {giorno.gaps.map(g => {
                      const p = place(g.start, g.end, week.axis);
                      return <span key={`b-${g.start}`} className="p-buco" style={{ left: `${p.left}%`, width: `${p.width}%` }} title={`Libero ${g.from}–${g.to}`} />;
                    })}
                    {giorno.blocks.map(b => {
                      const p = place(b.start, b.end, week.axis);
                      return (
                        <button key={b.key} type="button" className="p-blocco" style={{ left: `${p.left}%`, width: `${p.width}%` }}
                          aria-pressed={scelto === b.key}
                          data-fermo={!b.touchable || undefined}
                          data-spento={(data.onlyEmpty && b.sold !== 0) || undefined}
                          data-esaurito={b.soldOut || undefined}
                          draggable={b.touchable}
                          onDragStart={e => afferra(e, b.key, b.start, b.end)}
                          onDragEnd={() => setTrascino(null)}
                          onClick={() => { setScelto(b.key); setIntento(null); }}
                          title={`${b.time} ${b.title}${posti(b) ? ` · ${posti(b)}` : ''}`}>
                          <span className="p-blocco__ora num">{b.time}</span>
                          <span className="p-blocco__titolo">{b.title}</span>
                        </button>
                      );
                    })}
                    {bozze.map(b => {
                      const p = place(b.start, b.end, week.axis);
                      return (
                        <button key={b.key} type="button" className="p-blocco" data-bozza="" data-motore={!b.show.locked || undefined}
                          style={{ left: `${p.left}%`, width: `${p.width}%` }}
                          aria-pressed={scelto === b.key}
                          draggable={!giorno.isPast}
                          onDragStart={e => afferra(e, b.key, b.start, b.end)}
                          onDragEnd={() => setTrascino(null)}
                          onClick={() => { setScelto(b.key); setIntento(null); }}
                          title={`In bozza: ${b.show.time} ${b.show.title}`}>
                          <span className="p-blocco__ora num">{b.show.time}</span>
                          <span className="p-blocco__titolo">{b.show.title}</span>
                        </button>
                      );
                    })}
                    {qui.map(s => {
                      const p = place(s.start, s.end, week.axis);
                      return (
                        <button key={`p-${s.day}-${s.time}`} type="button" className="p-posto num" style={{ left: `${p.left}%`, width: `${p.width}%` }}
                          onClick={() => prendiPosto(s)} title={`Metti «${film?.title}» alle ${s.time}`}>
                          + {s.time}
                        </button>
                      );
                    })}
                  </div>

                  <ol className="p-elenco">
                    {giorno.blocks.length === 0 && bozze.length === 0 && qui.length === 0 && <li className="g-nota">Nessuno spettacolo</li>}
                    {giorno.blocks.map(b => (
                      <li key={b.key}>
                        <button type="button" onClick={() => { setScelto(b.key); setIntento(null); }} data-spento={(data.onlyEmpty && b.sold !== 0) || undefined}>
                          <span className="num">{b.time}</span><span>{b.title}</span><span className="g-nota num">{posti(b)}</span>
                        </button>
                      </li>
                    ))}
                    {bozze.map(b => (
                      <li key={b.key}>
                        <button type="button" data-bozza="" onClick={() => setScelto(b.key)}>
                          <span className="num">{b.show.time}</span><span>{b.show.title}</span><span className="g-nota">bozza</span>
                        </button>
                      </li>
                    ))}
                    {qui.map(s => (
                      <li key={`p-${s.time}`}>
                        <button type="button" data-posto="" onClick={() => prendiPosto(s)}>
                          <span className="num">{s.time}</span><span>+ {film?.title}</span><span className="g-nota">metti qui</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}

            <p className="g-nota p-piede num">
              {week.totalShows} {week.totalShows === 1 ? 'spettacolo' : 'spettacoli'} in sala · {week.filmGaps} {week.filmGaps === 1 ? 'buco dove ci sta un film' : 'buchi dove ci sta un film'} · Esc chiude
            </p>
          </div>

          <aside className="p-lato" ref={pannelloRef}>
            {pannello ?? (
              <div className="p-scaffale">
                <p className="g-etichetta">La libreria</p>
                <p className="g-nota">Scegli un film per accendere i posti dove ci sta, o trascinalo sul giorno.</p>
                <Tabellone modo="lista" scelti={giaInBozza} tmdbScelto={film?.tmdbId ?? null} onScegli={f => scegliFilm(f.tmdbId === film?.tmdbId ? null : f)}
                  onTrascina={f => { if (f.tmdbId) filmVisti.current.set(f.tmdbId, f); presa.current = 0; setTrascino(`film:${f.tmdbId}`); }} />
              </div>
            )}
          </aside>
        </div>
      )}

      {riempi && draft && roomId !== null && (
        <Riempi roomId={roomId} from={data.from} days={data.days} draft={draft} preset={film} update={update} onChiudi={() => setRiempi(false)} />
      )}

      {draft && <Barra draft={draft} savedAt={savedAt} commit={commit} onButta={() => void discard()} />}
    </div>
  );
}
