'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import s from './Speciale.module.css';

export interface Caricata {
  src: string;
  w: number;
  h: number;
}

/** Il lato lungo di un'immagine caricata: oltre, sul sito, non si vede differenza. */
const LATO = 2400;

/**
 * Riduce l'immagine nel browser e la carica. Le foto del distributore arrivano
 * anche a 6000 px e 13 MB: ridotte a 2400 px pesano meno di un mega, e passano
 * dal limite delle richieste. I PNG restano PNG (i loghi hanno il trasparente).
 */
export async function carica(file: File): Promise<Caricata> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error(`${file.name}: solo JPEG, PNG o WebP.`);
  const bmp = await createImageBitmap(file);
  const scala = Math.min(1, LATO / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scala), h = Math.round(bmp.height * scala);
  const tela = document.createElement('canvas');
  tela.width = w;
  tela.height = h;
  tela.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const png = file.type === 'image/png';
  const blob = await new Promise<Blob>((ok, no) =>
    tela.toBlob(b => (b ? ok(b) : no(new Error('Non riesco a preparare l’immagine.'))), png ? 'image/png' : 'image/jpeg', 0.86));
  const fd = new FormData();
  fd.append('file', new File([blob], file.name.replace(/\.\w+$/, png ? '.png' : '.jpg'), { type: blob.type }));
  fd.append('w', String(w));
  fd.append('h', String(h));
  const r = await fetch('/api/speciale/immagine', { method: 'POST', body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Caricamento non riuscito.');
  return j as Caricata;
}

/** Come si vede un riferimento d'immagine nel gestionale: TMDB, file del sito o caricata. */
export function anteprima(ref: string | null | undefined, size = 'w780'): string {
  if (!ref) return '';
  if (ref.startsWith('/speciali/') || ref.startsWith('/api/')) return ref;
  return getTMDBImageUrl(ref, size) || '';
}

interface Props {
  /** L'immagine di adesso, se c'è. */
  valore?: string;
  etichetta: string;
  multipla?: boolean;
  /** Proporzioni della cornice, per non far saltare la pagina. */
  proporzioni?: string;
  onCaricate: (c: Caricata[]) => void;
  onErrore: (messaggio: string) => void;
  children?: React.ReactNode;
}

/**
 * Una zona dove trascinare le immagini (o cliccare per sceglierle). Mentre
 * caricano lo dice; se sopra c'è già un'immagine, trascinarne un'altra la
 * sostituisce.
 */
export default function Trascina({ valore, etichetta, multipla, proporzioni, onCaricate, onErrore, children }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [sopra, setSopra] = useState(false);
  const [carico, setCarico] = useState(0);

  async function prendi(files: FileList | File[]) {
    const lista = [...files].filter(f => f.type.startsWith('image/'));
    if (!lista.length) { onErrore('Lì vanno immagini (JPEG, PNG o WebP).'); return; }
    const scelte = multipla ? lista : lista.slice(0, 1);
    setCarico(scelte.length);
    const fatte: Caricata[] = [];
    for (const f of scelte) {
      try { fatte.push(await carica(f)); } catch (e) { onErrore(e instanceof Error ? e.message : String(e)); }
      setCarico(n => n - 1);
    }
    if (fatte.length) onCaricate(fatte);
  }

  return (
    <div
      className={s.zona}
      data-sopra={sopra ? '' : undefined}
      data-piena={valore ? '' : undefined}
      style={proporzioni ? { aspectRatio: proporzioni } : undefined}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setSopra(true); }}
      onDragLeave={() => setSopra(false)}
      onDrop={e => { e.preventDefault(); setSopra(false); if (e.dataTransfer.files.length) prendi(e.dataTransfer.files); }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- anteprima del gestionale, anche di immagini appena caricate */}
      {valore && <img className={s.zonaImg} src={anteprima(valore)} alt="" />}
      {children}
      <button type="button" className={s.zonaInvito} onClick={() => input.current?.click()}>
        {carico > 0 ? <Loader2 size={18} className={s.gira} /> : <ImagePlus size={18} />}
        <span>{carico > 0 ? `Carico${carico > 1 ? ` (${carico})` : ''}…` : valore ? `Sostituisci: ${etichetta}` : etichetta}</span>
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple={multipla} hidden
        onChange={e => { if (e.target.files?.length) prendi(e.target.files); e.target.value = ''; }} />
    </div>
  );
}
