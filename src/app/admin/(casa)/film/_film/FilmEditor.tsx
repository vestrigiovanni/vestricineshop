'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  adminClearMovieMetadata,
  adminDeleteOverride,
  adminGetMovieById,
  adminRefreshMovieAwards,
  upsertMovieOverride,
} from '@/actions/adminActions';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import { useToast } from '@/components/cabina/Toast';
import { LANGUAGE_MAP, SUBTITLE_OPTIONS } from '@/constants/languages';
import { romeClock } from '@/services/scheduling/rome';
import AssetField from './AssetField';
import { formFrom, isDirty, movieIdOf, tmdbImage, toPayload, type Award, type FilmForm, type MovieLike, type OverrideLike } from './form';
import MediaPicker, { type MediaKind } from './MediaPicker';
import styles from './Film.module.css';

export interface Projection {
  pretixId: number;
  roomName?: string | null;
  dateFrom: string | Date;
  startTime?: string | null;
  endTime?: string | null;
  availableSeats?: number | null;
  totalSeats?: number | null;
  isSoldOut?: boolean;
}

interface Props {
  movie: MovieLike;
  override?: OverrideLike;
  projections: Projection[];
  onDirtyChange: (dirty: boolean) => void;
  /** Qualcosa è cambiato sul server: le liste vanno rilette. */
  onSaved: () => void;
  onReloaded: (fresh: MovieLike) => void;
  onClose: () => void;
}

const RATINGS = [
  { value: '', label: 'Come dice TMDB' },
  { value: 'T', label: 'T · per tutti' },
  { value: '6+', label: '6+' },
  { value: '10+', label: '10+' },
  { value: '14+', label: '14+' },
  { value: '18+', label: '18+' },
];

const FIELD: Record<Exclude<MediaKind, 'trailer'>, keyof FilmForm> = {
  poster: 'customPosterPath',
  backdrop: 'customBackdropPath',
  logo: 'customLogoPath',
};

export default function FilmEditor({ movie, override, projections, onDirtyChange, onSaved, onReloaded, onClose }: Props) {
  const toast = useToast();
  const id = movieIdOf(movie);
  const room = projections.find((p) => p.roomName)?.roomName;
  const [saved, setSaved] = useState<FilmForm>(() => formFrom(movie, override, room));
  const [form, setForm] = useState<FilmForm>(saved);
  const [awards, setAwards] = useState<Award[]>(override?.awards?.length ? override.awards : movie.awards ?? []);
  const [picker, setPicker] = useState<MediaKind | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<'awards' | 'reload' | 'delete' | null>(null);
  const [confirm, setConfirm] = useState<'reload' | 'delete' | null>(null);

  const dirty = isDirty(saved, form);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const set = <K extends keyof FilmForm>(key: K, value: FilmForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await upsertMovieOverride(id, toPayload(form));
      if (!res?.success) throw new Error();
      setSaved(form);
      toast(`«${form.customTitle || movie.title}» salvato: sito, app e display lo vedono subito.`, 'ok');
      onSaved();
    } catch {
      toast('Il salvataggio non è stato confermato dal database. Riprova.', 'alarm');
    } finally {
      setSaving(false);
    }
  };

  const reload = async () => {
    setConfirm(null);
    setBusy('reload');
    try {
      await adminClearMovieMetadata(id);
      const fresh = await adminGetMovieById(id);
      if (!fresh) throw new Error();
      toast('Riletto da TMDB.', 'ok');
      onReloaded(fresh as MovieLike);
    } catch {
      toast('TMDB non ha risposto. Riprova fra poco.', 'alarm');
    } finally {
      setBusy(null);
    }
  };

  const removeOverride = async () => {
    setConfirm(null);
    setBusy('delete');
    try {
      await adminDeleteOverride(id);
      toast('Personalizzazioni tolte: torna come lo racconta TMDB.', 'ok');
      onSaved();
      onClose();
    } catch {
      toast('Non sono riuscito a togliere le personalizzazioni.', 'alarm');
    } finally {
      setBusy(null);
    }
  };

  const refreshAwards = async () => {
    setBusy('awards');
    try {
      const res = await adminRefreshMovieAwards(id);
      if (!res.success) throw new Error(res.error);
      const fresh = (await adminGetMovieById(id)) as MovieLike | null;
      setAwards(fresh?.awards ?? []);
      toast(`Premi riletti da MUBI: ${fresh?.awards?.length ?? 0}.`, 'ok');
      onSaved();
    } catch {
      toast('MUBI non ha risposto. Riprova fra poco.', 'alarm');
    } finally {
      setBusy(null);
    }
  };

  const poster = tmdbImage(form.customPosterPath || movie.poster_path, 'w185');
  const hasOverride = Boolean(override && Object.keys(override).length);

  return (
    <section className={styles.editor}>
      <header className={styles.editorHead}>
        <span className={styles.editorPoster}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {poster && <img src={poster} alt="" />}
        </span>
        <div className={styles.editorTitle}>
          <p className={styles.kicker}>{override?.isManualOverride ? 'Scheda personalizzata' : 'Come la racconta TMDB'}</p>
          <h2>{form.customTitle || movie.title}</h2>
          <p className={styles.meta}>
            {[movie.release_date?.slice(0, 4), movie.original_language?.toUpperCase(), `TMDB ${id}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Chiudi la scheda">
          <X size={16} />
        </button>
      </header>

      <div className={styles.editorBody}>
        <fieldset className={styles.group}>
          <legend>Come si presenta</legend>
          <label className={styles.field}>
            <span>Titolo</span>
            <input value={form.customTitle} onChange={(e) => set('customTitle', e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Trama</span>
            <textarea rows={5} value={form.customOverview} onChange={(e) => set('customOverview', e.target.value)} />
          </label>
          <div className={styles.two}>
            <label className={styles.field}>
              <span>Regia</span>
              <input value={form.customDirector} onChange={(e) => set('customDirector', e.target.value)} placeholder="Separati da virgola" />
            </label>
            <label className={styles.field}>
              <span>Cast</span>
              <input value={form.customCast} onChange={(e) => set('customCast', e.target.value)} placeholder="Separati da virgola" />
            </label>
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend>Versione</legend>
          <div className={styles.four}>
            <label className={styles.field}>
              <span>Lingua</span>
              <select value={form.versionLanguage} onChange={(e) => set('versionLanguage', e.target.value)}>
                <option value="ITALIANO">ITALIANO</option>
                {Object.entries(LANGUAGE_MAP)
                  .filter(([k]) => k !== 'it')
                  .map(([k, v]) => <option key={k} value={v}>{v}</option>)}
                {!Object.values(LANGUAGE_MAP).includes(form.versionLanguage) && form.versionLanguage !== 'ITALIANO' && (
                  <option value={form.versionLanguage}>{form.versionLanguage}</option>
                )}
              </select>
            </label>
            <label className={styles.field}>
              <span>Sottotitoli</span>
              <select value={form.subtitles} onChange={(e) => set('subtitles', e.target.value)}>
                {SUBTITLE_OPTIONS.map((o) => <option key={o} value={o}>{o === 'NESSUNO' ? 'Nessuno' : o}</option>)}
                {!SUBTITLE_OPTIONS.includes(form.subtitles) && <option value={form.subtitles}>{form.subtitles}</option>}
              </select>
            </label>
            <label className={styles.field}>
              <span>Età</span>
              <select value={form.customRating} onChange={(e) => set('customRating', e.target.value)}>
                {RATINGS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              <span>Sala</span>
              <input value={form.customRoomName} onChange={(e) => set('customRoomName', e.target.value)} />
            </label>
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend>Immagini</legend>
          <div className={styles.assets}>
            <AssetField kind="poster" label="Locandina" value={form.customPosterPath} fallback={movie.poster_path} onChange={(v) => set('customPosterPath', v)} onPick={() => setPicker('poster')} />
            <AssetField kind="backdrop" label="Sfondo" value={form.customBackdropPath} fallback={movie.backdrop_path} onChange={(v) => set('customBackdropPath', v)} onPick={() => setPicker('backdrop')} />
            <AssetField kind="logo" label="Logo" value={form.customLogoPath} fallback={movie.logo_path} onChange={(v) => set('customLogoPath', v)} onPick={() => setPicker('logo')} />
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend>Trailer</legend>
          <div className={styles.two}>
            <AssetField kind="trailer" label="Trailer" value={form.customTrailerUrl} onChange={(v) => set('customTrailerUrl', v)} onPick={() => setPicker('trailer')} />
            <label className={styles.field}>
              <span>Come si chiama sul sito</span>
              <input value={form.customTrailerTitle} onChange={(e) => set('customTrailerTitle', e.target.value)} placeholder="Trailer ufficiale" />
            </label>
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend>Premi</legend>
          <div className={styles.awardsHead}>
            <label className={styles.field}>
              <span>MUBI (id o slug)</span>
              <input value={form.mubiId} onChange={(e) => set('mubiId', e.target.value)} />
            </label>
            <Button variant="outline" onClick={refreshAwards} disabled={busy !== null}>
              {busy === 'awards' ? 'Leggo MUBI…' : 'Aggiorna i premi'}
            </Button>
          </div>
          {awards.length === 0 ? (
            <p className={styles.hint}>Nessun premio salvato. “Aggiorna i premi” li legge da MUBI.</p>
          ) : (
            <ul className={styles.awards}>
              {awards.map((a, i) => (
                <li key={`${a.type}-${i}`}>
                  <b>{a.label || a.type}</b>
                  {a.year ? <span> · {a.year}</span> : null}
                  {a.details && <p>{a.details}</p>}
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        {projections.length > 0 && (
          <fieldset className={styles.group}>
            <legend>In sala · {projections.length}</legend>
            <ul className={styles.projections}>
              {projections.map((p) => (
                <li key={p.pretixId}>
                  <span className={styles.mono}>
                    {new Date(p.dateFrom).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Rome' })}
                  </span>
                  <span className={styles.clock}>{p.startTime || romeClock(new Date(p.dateFrom))}</span>
                  <span>{p.roomName || 'Sala'}</span>
                  <span className={styles.mono}>
                    {p.isSoldOut ? 'esaurito' : `${p.availableSeats ?? '?'} / ${p.totalSeats ?? '?'} liberi`}
                  </span>
                </li>
              ))}
            </ul>
          </fieldset>
        )}

        <label className={styles.killSwitch}>
          <input type="checkbox" checked={form.manualSoldOut} onChange={(e) => set('manualSoldOut', e.target.checked)} />
          <span>
            <b>Tutto esaurito a mano</b>
            Il sito mostra il film esaurito qualunque cosa dica Pretix.
          </span>
        </label>
      </div>

      <footer className={styles.saveBar} data-dirty={dirty || undefined}>
        <span className={styles.hint}>{dirty ? 'Modifiche non salvate' : 'Tutto salvato'}</span>
        <span className={styles.saveActions}>
          <Button variant="ghost" onClick={() => setConfirm('reload')} disabled={busy !== null}>
            {busy === 'reload' ? 'Rileggo…' : 'Rileggi da TMDB'}
          </Button>
          {hasOverride && (
            <Button variant="alarm" onClick={() => setConfirm('delete')} disabled={busy !== null}>
              Togli le personalizzazioni
            </Button>
          )}
          <Button variant="fill" onClick={save} disabled={saving || !dirty}>
            {saving ? 'Salvo…' : 'Salva'}
          </Button>
        </span>
      </footer>

      {picker && (
        <MediaPicker
          movieId={id}
          kind={picker}
          current={picker === 'trailer' ? form.customTrailerUrl : form[FIELD[picker]] as string}
          onSelect={(v) => (picker === 'trailer' ? set('customTrailerUrl', v) : set(FIELD[picker], v))}
          onClose={() => setPicker(null)}
        />
      )}

      {confirm === 'reload' && (
        <Dialog open onClose={() => setConfirm(null)} title="Rileggere da TMDB?" showTitle>
          <p className={styles.text}>
            Butto la copia locale dei dati di TMDB e la rileggo. Le tue personalizzazioni restano;
            {dirty ? ' le modifiche non salvate in questa scheda invece si perdono.' : ' nella scheda torni a vedere quelle salvate.'}
          </p>
          <div className={styles.dialogActions}>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Annulla</Button>
            <Button variant="fill" onClick={reload}>Rileggi</Button>
          </div>
        </Dialog>
      )}

      {confirm === 'delete' && (
        <Dialog open onClose={() => setConfirm(null)} title="Togliere le personalizzazioni?" showTitle>
          <p className={styles.text}>Titolo, trama, immagini, trailer e lingua tornano quelli di TMDB, su sito, app e display.</p>
          <div className={styles.dialogActions}>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Annulla</Button>
            <Button variant="alarm" onClick={removeOverride}>Togli</Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
