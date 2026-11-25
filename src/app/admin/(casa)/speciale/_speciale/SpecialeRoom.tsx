'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  specialeAccendi, specialeElenco, specialeElimina, specialeFotogrammi, specialeSalva,
  type DatiSpeciale, type FilmInProgramma, type FotogrammiTmdb,
} from '@/actions/specialeActions';
import type { SpecialeSalvata } from '@/services/speciali';
import { periodo, type Citazione, type ConDate, type FotoDiScena, type Materiale, type Posto } from '@/components/Home/proiezioneSpeciale';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import { useToast } from '@/components/cabina/Toast';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import Trascina, { anteprima, type Caricata } from './Trascina';
import Riquadro from './Riquadro';
import stanza from '../../_stanza.module.css';
import s from './Speciale.module.css';

/**
 * La stanza "Speciale" (25 novembre 2026, chiesta da Giovanni): inserire,
 * cambiare o togliere la proiezione speciale che apre la home, con le foto e
 * la critica da trascinare. Una proiezione speciale vale finché il suo film ha
 * spettacoli in programma; spenta resta salvata, e il sito non la mostra.
 */

const POSTO_BANNER: Posto = { x: 25, y: 76, w: 50, h: 11, riquadro: true };
const POSTO_LOCANDINA: Posto = { x: 20, y: 90, w: 60, h: 4, riquadro: false };

function vuota(film?: FilmInProgramma): DatiSpeciale {
  return {
    tmdbId: film?.tmdbId ?? 0,
    attiva: true,
    inizio: film ? film.primo.slice(0, 10) : '',
    sopra: '',
    casaNome: '',
    casaLogo: '',
    fondale: '',
    citazioni: [],
    materiale: null,
  };
}

function daSalvata(x: SpecialeSalvata): DatiSpeciale {
  return {
    id: x.id, tmdbId: x.tmdbId, attiva: x.attiva, inizio: x.inizio, sopra: x.sopra,
    casaNome: x.casa.nome, casaLogo: x.casa.logo, fondale: x.fondale,
    citazioni: x.citazioni, materiale: x.materiale ?? null,
  };
}

/** Sposta l'elemento `da` al posto `a`. */
function sposta<T>(xs: T[], da: number, a: number): T[] {
  if (a < 0 || a >= xs.length || da === a) return xs;
  const out = [...xs];
  const [x] = out.splice(da, 1);
  out.splice(a, 0, x);
  return out;
}

export default function SpecialeRoom() {
  const toast = useToast();
  const errore = useCallback((m: string) => toast(m, 'alarm'), [toast]);
  const [speciali, setSpeciali] = useState<SpecialeSalvata[] | null>(null);
  const [film, setFilm] = useState<FilmInProgramma[]>([]);
  const [bozza, setBozza] = useState<DatiSpeciale | null>(null);
  const [tmdb, setTmdb] = useState<FotogrammiTmdb | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [daEliminare, setDaEliminare] = useState<SpecialeSalvata | null>(null);

  const carica = useCallback(async () => {
    try {
      const r = await specialeElenco();
      setSpeciali(r.speciali);
      setFilm(r.film);
    } catch (e) {
      errore(e instanceof Error ? e.message : 'Non riesco a leggere le proiezioni speciali.');
      setSpeciali([]);
    }
  }, [errore]);
  useEffect(() => { carica(); }, [carica]);

  // I fotogrammi e i loghi da TMDB del film scelto.
  const tmdbId = bozza?.tmdbId ?? 0;
  useEffect(() => {
    if (!tmdbId) return;
    let vivo = true;
    specialeFotogrammi(tmdbId).then(r => { if (vivo) setTmdb(r); }).catch(() => { if (vivo) setTmdb(null); });
    return () => { vivo = false; };
  }, [tmdbId]);

  const filmDi = useMemo(() => new Map(film.map(f => [f.tmdbId, f])), [film]);
  const scelto = bozza ? filmDi.get(bozza.tmdbId) : undefined;
  // Le date come le scriverà il sito, con quello che c'è in programma adesso.
  const date = scelto && bozza && /^\d{4}-\d{2}-\d{2}$/.test(bozza.inizio) ? periodo(bozza.inizio, scelto.ultimo, new Date()) : 'Dal … al …';

  const cambia = (p: Partial<DatiSpeciale>) => setBozza(b => (b ? { ...b, ...p } : b));
  const materiale = (p: Partial<Materiale>) => setBozza(b => (b ? { ...b, materiale: { ...(b.materiale ?? {}), ...p } } : b));
  const cit = (i: number, p: Partial<Citazione>) => setBozza(b => (b ? { ...b, citazioni: b.citazioni.map((c, j) => (j === i ? { ...c, ...p } : c)) } : b));

  async function salva() {
    if (!bozza) return;
    setSalvo(true);
    try {
      await specialeSalva(bozza);
      toast(bozza.attiva ? 'Salvata: è sul sito.' : 'Salvata, spenta: il sito non la mostra.', 'ok');
      setBozza(null);
      await carica();
    } catch (e) {
      errore(e instanceof Error ? e.message : 'Non sono riuscito a salvarla.');
    } finally {
      setSalvo(false);
    }
  }

  async function accendi(x: SpecialeSalvata) {
    try {
      await specialeAccendi(x.id, !x.attiva);
      toast(x.attiva ? 'Spenta: il sito non la mostra più.' : 'Accesa: è sul sito.', 'ok');
      await carica();
    } catch (e) {
      errore(e instanceof Error ? e.message : 'Non ci sono riuscito.');
    }
  }

  async function elimina() {
    if (!daEliminare) return;
    try {
      await specialeElimina(daEliminare.id);
      toast('Tolta dal sito.', 'ok');
      setDaEliminare(null);
      if (bozza?.id === daEliminare.id) setBozza(null);
      await carica();
    } catch (e) {
      errore(e instanceof Error ? e.message : 'Non ci sono riuscito.');
    }
  }

  const titolo = (id: number) => filmDi.get(id)?.titolo ?? `Film ${id} (non più in programma)`;

  return (
    <div className={stanza.room}>
      <header className={stanza.head}>
        <div>
          <p className={stanza.kicker}>Sito · home</p>
          <h1 className={stanza.title}>Proiezione speciale</h1>
        </div>
        <div className={stanza.headActions}>
          <Button href="/" variant="ghost">Apri il sito</Button>
          {!bozza && <Button variant="fill" onClick={() => setBozza(vuota())}><Plus size={16} /> Nuova</Button>}
        </div>
      </header>
      <p className={stanza.hint}>
        Finché il film ha spettacoli in programma, la home si apre con la sua pagina e la ripropone fra gli altri film:
        il banner dopo Oggi, locandina e foto dopo i prossimi giorni, il trailer verticale dopo Più avanti.
        Le date le scrive il sito dal programma. Dopo l’ultimo spettacolo sparisce da sola.
      </p>

      {/* ─── L'elenco ─── */}
      <section className={`${stanza.panel} ${s.elenco}`}>
        {speciali === null && <p className={stanza.meta}>Carico…</p>}
        {speciali?.length === 0 && <p className={stanza.meta}>Nessuna proiezione speciale. «Nuova» per crearne una.</p>}
        <ul className={stanza.list}>
          {speciali?.map(x => (
            <li key={x.id} className={stanza.item} data-muted={x.attiva ? undefined : ''}>
              <div className={stanza.itemMain}>
                <b>{titolo(x.tmdbId)}</b>
                <span className={stanza.meta}>
                  {x.attiva ? 'Accesa' : 'Spenta'} · dal {x.inizio.split('-').reverse().join('/')} · {x.citazioni.length} citazioni
                  {x.materiale?.foto?.length ? ` · ${x.materiale.foto.length} foto` : ''}
                </span>
              </div>
              <div className={stanza.itemActions}>
                <button type="button" className={stanza.iconBtn} data-on={x.attiva ? '' : undefined} onClick={() => accendi(x)}
                  title={x.attiva ? 'Spegni: resta salvata, il sito non la mostra' : 'Accendi'} aria-label={x.attiva ? 'Spegni' : 'Accendi'}>
                  {x.attiva ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <button type="button" className={stanza.iconBtn} onClick={() => setBozza(daSalvata(x))} title="Cambia" aria-label="Cambia"><Pencil size={16} /></button>
                <button type="button" className={stanza.iconBtn} onClick={() => setDaEliminare(x)} title="Togli" aria-label="Togli"><Trash2 size={16} /></button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ─── L'editor ─── */}
      {bozza && (
        <div className={s.editor}>
          <Sezione titolo="Il film" nota="Il primo giorno serve alle date: il sito sa solo gli spettacoli che devono ancora venire.">
            <div className={s.riga3}>
              <label className={stanza.field}>
                <span>Film in programma</span>
                <select className={s.select} value={bozza.tmdbId || ''}
                  onChange={e => { const f = filmDi.get(Number(e.target.value)); cambia({ tmdbId: Number(e.target.value), inizio: bozza.inizio || f?.primo.slice(0, 10) || '' }); }}>
                  <option value="">Scegli…</option>
                  {film.map(f => <option key={f.tmdbId} value={f.tmdbId}>{f.titolo} · {f.spettacoli} spettacoli</option>)}
                  {bozza.tmdbId > 0 && !filmDi.has(bozza.tmdbId) && <option value={bozza.tmdbId}>{titolo(bozza.tmdbId)}</option>}
                </select>
              </label>
              <label className={stanza.field}>
                <span>Primo giorno</span>
                <input type="date" value={bozza.inizio} onChange={e => cambia({ inizio: e.target.value })} />
              </label>
              <label className={s.spunta}>
                <input type="checkbox" checked={bozza.attiva} onChange={e => cambia({ attiva: e.target.checked })} />
                <span>Accesa sul sito</span>
              </label>
            </div>
            <p className={s.date}>Sul sito: <b>{date}</b></p>
          </Sezione>

          <Sezione titolo="La pagina d’apertura" nota="Il fotogramma a tutto schermo, la riga sopra il titolo e il logo della casa.">
            <label className={stanza.field}>
              <span>Sopra il titolo</span>
              <input value={bozza.sopra} placeholder="Un documentario di …" onChange={e => cambia({ sopra: e.target.value })} />
            </label>
            {tmdb?.regia.length ? (
              <button type="button" className={s.suggerito} onClick={() => cambia({ sopra: `Un film di ${tmdb.regia.join(' e ')}` })}>
                Usa la regia: «Un film di {tmdb.regia.join(' e ')}»
              </button>
            ) : null}

            <div className={s.casa}>
              <div className={s.casaScelte}>
                <span className={stanza.section}>Logo della casa</span>
                <div className={s.chips}>
                  {tmdb?.loghiCase.map(c => (
                    <button key={c.logo} type="button" className={s.chip} data-on={bozza.casaLogo === c.logo ? '' : undefined}
                      onClick={() => cambia({ casaLogo: c.logo, casaNome: c.nome })} title={c.nome}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- logo TMDB */}
                      <img src={getTMDBImageUrl(c.logo, 'w185') || ''} alt={c.nome} />
                    </button>
                  ))}
                  {bozza.casaLogo && <button type="button" className={s.chip} onClick={() => cambia({ casaLogo: '', casaNome: '' })} title="Nessun logo"><X size={14} /></button>}
                </div>
                <input className={s.inputPiccolo} value={bozza.casaNome} placeholder="Nome della casa" onChange={e => cambia({ casaNome: e.target.value })} />
              </div>
              <Trascina valore={bozza.casaLogo || undefined} etichetta="Trascina un logo (PNG trasparente)" proporzioni="5 / 2"
                onCaricate={([c]) => cambia({ casaLogo: c.src })} onErrore={errore} />
            </div>

            <span className={stanza.section}>Fotogramma d’apertura</span>
            <Trascina valore={bozza.fondale || undefined} etichetta="Trascina il fotogramma, o sceglilo sotto" proporzioni="16 / 9"
              onCaricate={([c]) => cambia({ fondale: c.src })} onErrore={errore} />
            <Fotogrammi lista={tmdb?.fotogrammi ?? []} scelto={bozza.fondale} onScegli={p => cambia({ fondale: p })} />
          </Sezione>

          <Sezione titolo="La critica" nota="Una frase per schermata, sul suo fotogramma. Trascina più immagini qui sotto: una citazione per immagine, poi scrivi frase e testata. L’ordine si cambia trascinando le schede.">
            <Trascina etichetta="Trascina qui le immagini delle citazioni" multipla
              onCaricate={cs => cambia({ citazioni: [...bozza.citazioni, ...cs.map(c => ({ testo: '', fonte: '', fondale: c.src }))] })} onErrore={errore} />
            <Ordinabili
              voci={bozza.citazioni}
              onOrdina={xs => cambia({ citazioni: xs })}
              chiave={(c, i) => `${i}-${c.fondale}`}
              render={(c, i) => (
                <div className={s.citazione}>
                  <Trascina valore={c.fondale || undefined} etichetta="Fotogramma" proporzioni="16 / 9"
                    onCaricate={([x]) => cit(i, { fondale: x.src })} onErrore={errore} />
                  <div className={s.citazioneTesto}>
                    <textarea value={c.testo} placeholder="La frase, senza virgolette" rows={3} onChange={e => cit(i, { testo: e.target.value })} />
                    <input value={c.fonte} placeholder="La testata (Variety, Roger Ebert…)" onChange={e => cit(i, { fonte: e.target.value })} />
                    <Fotogrammi lista={tmdb?.fotogrammi ?? []} scelto={c.fondale} onScegli={p => cit(i, { fondale: p })} piccola />
                  </div>
                </div>
              )}
              onTogli={i => cambia({ citazioni: bozza.citazioni.filter((_, j) => j !== i) })}
            />
            <Button variant="ghost" onClick={() => cambia({ citazioni: [...bozza.citazioni, { testo: '', fonte: '', fondale: tmdb?.fotogrammi[bozza.citazioni.length + 1] ?? '' }] })}>
              <Plus size={16} /> Citazione senza immagine nuova
            </Button>
          </Sezione>

          <Sezione titolo="Il materiale del distributore" nota="Banner, locandina e foto fra gli atti della home. Se l’immagine ha già le date del distributore, cancellale prima: qui sposti il riquadro dove il sito scrive le tue.">
            <ConLeDate nome="Banner orizzontale (schermo grande)" valore={bozza.materiale?.banner?.orizzontale} posto={POSTO_BANNER} date={date} errore={errore}
              onCambia={v => materiale({ banner: { ...bozza.materiale?.banner, orizzontale: v } })} />
            <ConLeDate nome="Banner verticale (telefono)" valore={bozza.materiale?.banner?.verticale} posto={POSTO_BANNER} date={date} errore={errore}
              onCambia={v => materiale({ banner: { ...bozza.materiale?.banner, verticale: v } })} />
            <ConLeDate nome="Locandina" valore={bozza.materiale?.locandina} posto={POSTO_LOCANDINA} date={date} errore={errore}
              onCambia={v => materiale({ locandina: v })} />

            <span className={stanza.section}>Foto di scena</span>
            <Trascina etichetta="Trascina qui le foto di scena (anche tante insieme)" multipla
              onCaricate={cs => materiale({ foto: [...(bozza.materiale?.foto ?? []), ...cs.map(c => ({ ...c }))] })} onErrore={errore} />
            <Ordinabili<FotoDiScena>
              voci={bozza.materiale?.foto ?? []}
              onOrdina={xs => materiale({ foto: xs })}
              chiave={f => f.src}
              render={(f, i) => (
                <div className={s.foto}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- anteprima */}
                  <img src={anteprima(f.src)} alt="" />
                  <div className={s.citazioneTesto}>
                    <input value={f.chi ?? ''} placeholder="Chi c’è (Da sinistra, …)" onChange={e => materiale({ foto: (bozza.materiale?.foto ?? []).map((x, j) => (j === i ? { ...x, chi: e.target.value } : x)) })} />
                    <input value={f.credito ?? ''} placeholder="Credito (Courtesy of A24)" onChange={e => materiale({ foto: (bozza.materiale?.foto ?? []).map((x, j) => (j === i ? { ...x, credito: e.target.value } : x)) })} />
                  </div>
                </div>
              )}
              onTogli={i => materiale({ foto: (bozza.materiale?.foto ?? []).filter((_, j) => j !== i) })}
            />

            <span className={stanza.section}>Trailer verticale</span>
            <p className={stanza.hint}>Il video è troppo pesante per caricarlo da qui: va messo, già ridotto, nella cartella <code>public/speciali</code> del sito. Qui il suo percorso.</p>
            <div className={s.riga2}>
              <label className={stanza.field}>
                <span>Video (MP4)</span>
                <input value={bozza.materiale?.trailerVerticale?.src ?? ''} placeholder="/speciali/…/trailer-verticale.mp4"
                  onChange={e => materiale({ trailerVerticale: e.target.value ? { src: e.target.value, poster: bozza.materiale?.trailerVerticale?.poster ?? '' } : undefined })} />
              </label>
              <label className={stanza.field}>
                <span>Fotogramma d’attesa</span>
                <input value={bozza.materiale?.trailerVerticale?.poster ?? ''} placeholder="/speciali/…/trailer-verticale.jpg"
                  disabled={!bozza.materiale?.trailerVerticale?.src}
                  onChange={e => materiale({ trailerVerticale: { src: bozza.materiale?.trailerVerticale?.src ?? '', poster: e.target.value } })} />
              </label>
            </div>
          </Sezione>

          <div className={s.salva}>
            <Button variant="ghost" onClick={() => setBozza(null)}>Annulla</Button>
            <Button variant="fill" onClick={salva} disabled={salvo}>{salvo ? 'Salvo…' : bozza.id ? 'Salva le modifiche' : 'Salva e metti sul sito'}</Button>
          </div>
        </div>
      )}

      <Dialog open={daEliminare != null} onClose={() => setDaEliminare(null)} title="Togliere la proiezione speciale?" showTitle>
        <p className={stanza.text}>
          {daEliminare && titolo(daEliminare.tmdbId)} sparisce dal sito e da questo elenco, e non si recupera.
          Per toglierla solo per un po’ c’è l’occhio: spenta resta salvata. Gli spettacoli su Pretix non cambiano.
        </p>
        <div className={stanza.dialogActions}>
          <Button variant="ghost" onClick={() => setDaEliminare(null)}>Annulla</Button>
          <Button variant="alarm" onClick={elimina}>Togli</Button>
        </div>
      </Dialog>
    </div>
  );
}

function Sezione({ titolo, nota, children }: { titolo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className={`${stanza.panel} ${s.sezione}`}>
      <div>
        <h2 className={s.titoloSezione}>{titolo}</h2>
        {nota && <p className={stanza.hint}>{nota}</p>}
      </div>
      {children}
    </section>
  );
}

/** I fotogrammi senza scritte del film, da TMDB: uno clic per sceglierlo. */
function Fotogrammi({ lista, scelto, onScegli, piccola }: { lista: string[]; scelto: string; onScegli: (p: string) => void; piccola?: boolean }) {
  if (!lista.length) return null;
  return (
    <div className={s.striscia} data-piccola={piccola ? '' : undefined} role="listbox" aria-label="Fotogrammi da TMDB">
      {lista.map(p => (
        <button key={p} type="button" role="option" aria-selected={p === scelto} className={s.fotogramma} data-on={p === scelto ? '' : undefined} onClick={() => onScegli(p)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- miniatura TMDB */}
          <img src={getTMDBImageUrl(p, 'w300') || ''} alt="" loading="lazy" />
        </button>
      ))}
    </div>
  );
}

/** Un'immagine su cui il sito scrive le date: si trascina, si sposta il riquadro, si spengono le date. */
function ConLeDate({ nome, valore, posto, date, onCambia, errore }: {
  nome: string; valore?: ConDate; posto: Posto; date: string; onCambia: (v: ConDate | undefined) => void; errore: (m: string) => void;
}) {
  const metti = (c: Caricata) => onCambia({ src: c.src, w: c.w, h: c.h, date: valore?.date ?? posto });
  return (
    <div className={s.conDate}>
      <div className={s.conDateCapo}>
        <span className={stanza.section}>{nome}</span>
        {valore && (
          <div className={s.conDateComandi}>
            <label className={s.spunta}>
              <input type="checkbox" checked={!!valore.date} onChange={e => onCambia({ ...valore, date: e.target.checked ? posto : undefined })} />
              <span>Scrivi le date</span>
            </label>
            {valore.date && (
              <label className={s.spunta}>
                <input type="checkbox" checked={valore.date.riquadro} onChange={e => onCambia({ ...valore, date: { ...valore.date!, riquadro: e.target.checked } })} />
                <span>Con la cornice</span>
              </label>
            )}
            <button type="button" className={stanza.iconBtn} onClick={() => onCambia(undefined)} title="Togli l’immagine" aria-label="Togli l’immagine"><Trash2 size={15} /></button>
          </div>
        )}
      </div>
      {valore?.date ? (
        <Riquadro src={valore.src} w={valore.w} h={valore.h} posto={valore.date} periodo={date} onCambia={p => onCambia({ ...valore, date: p })} />
      ) : null}
      <Trascina valore={valore && !valore.date ? valore.src : undefined} etichetta={valore ? 'Trascina per sostituire' : `Trascina qui: ${nome.toLowerCase()}`}
        onCaricate={([c]) => metti(c)} onErrore={errore} />
    </div>
  );
}

/** Un elenco di schede che si riordinano trascinandole (o con le frecce). */
function Ordinabili<T>({ voci, onOrdina, onTogli, render, chiave }: {
  voci: T[]; onOrdina: (xs: T[]) => void; onTogli: (i: number) => void; render: (x: T, i: number) => React.ReactNode; chiave: (x: T, i: number) => string;
}) {
  const [preso, setPreso] = useState<number | null>(null);
  const [sopra, setSopra] = useState<number | null>(null);
  if (!voci.length) return null;
  return (
    <ol className={s.ordinabili}>
      {voci.map((x, i) => (
        <li key={chiave(x, i)} className={s.scheda} data-sopra={sopra === i && preso !== i ? '' : undefined}
          onDragOver={e => { if (preso == null) return; e.preventDefault(); setSopra(i); }}
          onDrop={e => { if (preso == null) return; e.preventDefault(); onOrdina(sposta(voci, preso, i)); setPreso(null); setSopra(null); }}>
          <div className={s.schedaComandi}>
            <span className={s.presa} draggable onDragStart={e => { setPreso(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); }}
              onDragEnd={() => { setPreso(null); setSopra(null); }} title="Trascina per cambiare l’ordine"><GripVertical size={16} /></span>
            <button type="button" className={s.freccia} onClick={() => onOrdina(sposta(voci, i, i - 1))} disabled={i === 0} aria-label="Su"><ArrowUp size={14} /></button>
            <button type="button" className={s.freccia} onClick={() => onOrdina(sposta(voci, i, i + 1))} disabled={i === voci.length - 1} aria-label="Giù"><ArrowDown size={14} /></button>
            <button type="button" className={s.freccia} onClick={() => onTogli(i)} aria-label="Togli"><Trash2 size={14} /></button>
          </div>
          {render(x, i)}
        </li>
      ))}
    </ol>
  );
}
