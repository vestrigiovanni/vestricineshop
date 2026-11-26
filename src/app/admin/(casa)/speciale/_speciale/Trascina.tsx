'use client';

import { useEffect, useRef, useState } from 'react';
import { Crop, ImagePlus, Loader2 } from 'lucide-react';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import { consiglio, FORMATI, giudizio, type Posto } from '@/services/stampa/formati';
import Ritaglia from './Ritaglia';
import s from './Speciale.module.css';

export interface Caricata {
  src: string;
  w: number;
  h: number;
  /** Per i loghi trascinati dalle scelte qui accanto: il nome della casa. */
  nome?: string;
}

/** Il tipo dei trascinamenti fra le parti del gestionale (un logo, una foto già scelta). */
const INTERNO = 'application/x-vestri-immagine';

/**
 * Rende trascinabile un'immagine già pronta (es. i loghi delle case): si
 * trascina il bottone intero, perché Firefox non trascina le immagini dentro
 * un <button>. Nella zona arriva il riferimento così com'è, senza ricaricarla;
 * fuori dal gestionale arriva l'indirizzo dell'originale.
 */
export function trascinabile(ref: string, nome?: string) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData(INTERNO, JSON.stringify({ src: ref, nome }));
      const url = anteprima(ref, 'original');
      const pieno = url.startsWith('/') ? location.origin + url : url;
      e.dataTransfer.setData('text/uri-list', pieno);
      e.dataTransfer.setData('text/plain', pieno);
    },
  };
}

/**
 * Il lato lungo di un'immagine caricata: un banner a tutta larghezza su uno
 * schermo grande Retina (26/11/2026; prima era 2400 e i banner si vedevano molli).
 */
const LATO = 3840;
/** Il limite di una richiesta su Vercel è 4,5 MB: si sta sotto. */
const PESO = 3.9 * 1024 * 1024;

/** C'è del trasparente? Solo allora si tiene il PNG (i loghi); le foto diventano JPEG. */
function trasparente(tela: HTMLCanvasElement): boolean {
  const k = Math.min(1, 256 / Math.max(tela.width, tela.height));
  const p = document.createElement('canvas');
  p.width = Math.max(1, Math.round(tela.width * k));
  p.height = Math.max(1, Math.round(tela.height * k));
  const x = p.getContext('2d')!;
  x.drawImage(tela, 0, 0, p.width, p.height);
  const d = x.getImageData(0, 0, p.width, p.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  return false;
}

const inBlob = (tela: HTMLCanvasElement, tipo: string, q?: number) =>
  new Promise<Blob>((ok, no) => tela.toBlob(b => (b ? ok(b) : no(new Error('Non riesco a preparare l’immagine.'))), tipo, q));

/** Manda al sito un'immagine già pronta (una tela): JPEG 92 o PNG, giù di qualità o di misura solo se supera il limite. */
export async function caricaTela(tela: HTMLCanvasElement, nome: string): Promise<Caricata> {
  const png = trasparente(tela);
  let blob = await inBlob(tela, png ? 'image/png' : 'image/jpeg', 0.92);
  for (const q of [0.88, 0.84, 0.8]) {
    if (png || blob.size <= PESO) break;
    blob = await inBlob(tela, 'image/jpeg', q);
  }
  // Ancora troppo pesante (un PNG enorme): si riduce finché sta nel limite.
  while (blob.size > PESO && tela.width > 800) {
    const piu = document.createElement('canvas');
    piu.width = Math.round(tela.width * 0.8);
    piu.height = Math.round(tela.height * 0.8);
    piu.getContext('2d')!.drawImage(tela, 0, 0, piu.width, piu.height);
    tela = piu;
    blob = await inBlob(tela, png ? 'image/png' : 'image/jpeg', png ? undefined : 0.84);
  }
  const fd = new FormData();
  fd.append('file', new File([blob], nome.replace(/\.\w+$/, '') + (png ? '.png' : '.jpg'), { type: blob.type }));
  fd.append('w', String(tela.width));
  fd.append('h', String(tela.height));
  const r = await fetch('/api/speciale/immagine', { method: 'POST', body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || (r.status === 413 ? 'Immagine troppo pesante anche ridotta.' : 'Caricamento non riuscito.'));
  return j as Caricata;
}

/**
 * Riduce l'immagine nel browser (solo se supera i 3840 px) e la carica. Va
 * bene qualunque immagine che il browser sa aprire (JPEG, PNG, WebP, AVIF,
 * HEIC su Safari): sul sito arriva JPEG, o PNG se ha il trasparente.
 */
export async function carica(file: File): Promise<Caricata> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name || 'Quel file'}: non è un’immagine.`);
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name || 'L’immagine'}: il browser non la sa aprire. Salvala come JPEG o PNG.`);
  }
  const scala = Math.min(1, LATO / Math.max(bmp.width, bmp.height));
  const tela = document.createElement('canvas');
  tela.width = Math.round(bmp.width * scala);
  tela.height = Math.round(bmp.height * scala);
  tela.getContext('2d')!.drawImage(bmp, 0, 0, tela.width, tela.height);
  bmp.close();
  return caricaTela(tela, file.name || 'incollata');
}

/** Un'immagine di un altro sito (trascinata o incollata come link): la scarica il server. */
export async function caricaIndirizzo(url: string): Promise<Caricata> {
  if (url.startsWith('data:image/')) {
    const blob = await (await fetch(url)).blob();
    return carica(new File([blob], 'trascinata', { type: blob.type }));
  }
  const r = await fetch('/api/speciale/immagine/indirizzo', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Non sono riuscito a prendere quell’immagine.');
  return j as Caricata;
}

/**
 * Gli indirizzi d'immagine in quello che si trascina o si incolla da un'altra
 * pagina: prima le <img> dell'HTML (col file più grande del srcset), poi i
 * link, poi il testo se è un indirizzo. Trascinando un'immagine che è anche
 * un link, il link porta alla pagina: per questo l'<img> viene prima.
 */
export function indirizzi(dt: DataTransfer): string[] {
  const out: string[] = [];
  const html = dt.getData('text/html');
  if (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const img of doc.querySelectorAll('img')) {
      const set = img.getAttribute('srcset');
      const grande = set
        ?.split(',').map(p => p.trim().split(/\s+/)).map(([u, d]) => ({ u, n: parseFloat(d) || 1 }))
        .sort((a, b) => b.n - a.n)[0]?.u;
      const u = grande || img.getAttribute('src');
      if (u) out.push(u);
    }
  }
  for (const riga of dt.getData('text/uri-list').split(/\r?\n/)) if (riga && !riga.startsWith('#')) out.push(riga.trim());
  const testo = dt.getData('text/plain').trim();
  if (/^(https?:\/\/|data:image\/)\S+$/.test(testo)) out.push(testo);
  return [...new Set(out.filter(u => /^(https?:\/\/|data:image\/)/.test(u)))];
}

/** Come si vede un riferimento d'immagine nel gestionale: TMDB, file del sito o caricata. */
export function anteprima(ref: string | null | undefined, size = 'w780'): string {
  if (!ref) return '';
  if (ref.startsWith('/speciali/') || ref.startsWith('/api/')) return ref;
  return getTMDBImageUrl(ref, size) || '';
}

// ─── Incolla (⌘V) ────────────────────────────────────────────────────────
// Un solo ascoltatore per la pagina: l'incolla va alla zona sotto il mouse (o
// a quella col fuoco), la più interna se sono una dentro l'altra. Mai mentre
// si scrive in un campo di testo.
const zone = new Map<HTMLElement, (dt: DataTransfer) => void>();
let inAscolto = false;
function ascoltaIncolla() {
  if (inAscolto) return;
  inAscolto = true;
  document.addEventListener('paste', e => {
    const t = e.target as HTMLElement | null;
    if (t && (t.closest('input, textarea, select, [contenteditable="true"]'))) return;
    if (!e.clipboardData) return;
    // Prima la zona sotto il mouse; se il mouse non è su nessuna, quella col fuoco.
    const sotto = [...zone.keys()].filter(z => z.matches(':hover'));
    const attive = sotto.length ? sotto : [...zone.keys()].filter(z => z.contains(document.activeElement));
    const zona = attive.find(z => !attive.some(a => a !== z && z.contains(a)));
    if (!zona) return;
    e.preventDefault();
    zone.get(zona)!(e.clipboardData);
  });
}

interface Props {
  /** L'immagine di adesso, se c'è (si vede nella zona). */
  valore?: string;
  etichetta: string;
  multipla?: boolean;
  /** Proporzioni della cornice, per non far saltare la pagina. */
  proporzioni?: string;
  /** Il posto sul sito: dice le misure consigliate e se l'immagine basta. */
  formato?: Posto;
  /** L'immagine da giudicare e ritagliare quando non si vede nella zona (i banner con le date). */
  sorgente?: { src: string; w?: number; h?: number };
  onCaricate: (c: Caricata[]) => void;
  onErrore: (messaggio: string) => void;
  children?: React.ReactNode;
}

/**
 * Una zona dove mettere le immagini: trascinandole (dal Finder o da un'altra
 * pagina), incollandole (⌘V col mouse sopra), o cliccando per sceglierle.
 * Accanto, le misure consigliate per quel posto e se l'immagine basta; con
 * «Ritaglia» si adatta senza uscire dal gestionale.
 */
export default function Trascina({ valore, etichetta, multipla, proporzioni, formato, sorgente, onCaricate, onErrore, children }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const zona = useRef<HTMLDivElement>(null);
  const [sopra, setSopra] = useState(false);
  const [carico, setCarico] = useState(0);
  const [taglio, setTaglio] = useState(false);
  const f = formato ? FORMATI[formato] : undefined;

  // Le misure vere dell'immagine (per TMDB quelle dell'originale, non dell'anteprima).
  const src = sorgente?.src ?? valore;
  const [dim, setDim] = useState<{ src: string; w: number; h: number } | null>(null);
  useEffect(() => {
    if (!src || (sorgente?.w && sorgente?.h)) return;
    let vivo = true;
    const img = new Image();
    img.onload = () => { if (vivo) setDim({ src, w: img.naturalWidth, h: img.naturalHeight }); };
    img.src = anteprima(src, 'original');
    return () => { vivo = false; };
  }, [src, sorgente?.w, sorgente?.h]);
  const misure = src ? (sorgente?.w && sorgente?.h ? { w: sorgente.w, h: sorgente.h } : dim?.src === src ? dim : null) : null;
  const voto = f && misure ? giudizio(misure.w, misure.h, f) : null;

  async function tutte(lavori: (() => Promise<Caricata>)[]) {
    const scelti = multipla ? lavori : lavori.slice(0, 1);
    if (!scelti.length) return;
    setCarico(scelti.length);
    const fatte: Caricata[] = [];
    for (const lavoro of scelti) {
      try { fatte.push(await lavoro()); } catch (e) { onErrore(e instanceof Error ? e.message : String(e)); }
      setCarico(n => n - 1);
    }
    if (fatte.length) onCaricate(fatte);
  }

  function prendi(dt: DataTransfer | FileList) {
    const interno = 'getData' in dt ? dt.getData(INTERNO) : '';
    if (interno) {
      try {
        const { src: ref, nome } = JSON.parse(interno) as { src: string; nome?: string };
        onCaricate([{ src: ref, w: 0, h: 0, nome }]);
        return;
      } catch { /* si prova come un trascinamento qualsiasi */ }
    }
    const files = [...('files' in dt ? dt.files : dt)].filter(x => x.type.startsWith('image/'));
    if (files.length) { tutte(files.map(x => () => carica(x))); return; }
    const urls = 'getData' in dt ? indirizzi(dt) : [];
    if (urls.length) { tutte(urls.map(u => () => caricaIndirizzo(u))); return; }
    // Una scheda trascinata per riordinarla (porta solo il suo numero): non è un errore.
    if ('getData' in dt && /^\d+$/.test(dt.getData('text/plain'))) return;
    onErrore('Qui non è arrivata un’immagine. Trascina la foto (non il riquadro intorno), o copiala con ⌘C e incollala con ⌘V.');
  }
  const prendiRef = useRef(prendi);
  useEffect(() => { prendiRef.current = prendi; });

  useEffect(() => {
    const el = zona.current;
    if (!el) return;
    ascoltaIncolla();
    zone.set(el, dt => prendiRef.current(dt));
    return () => { zone.delete(el); };
  }, []);

  return (
    <div className={s.trascina}>
      <div
        ref={zona}
        tabIndex={0}
        className={s.zona}
        data-sopra={sopra ? '' : undefined}
        data-piena={valore ? '' : undefined}
        style={proporzioni ? { aspectRatio: proporzioni } : undefined}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setSopra(true); }}
        onDragLeave={() => setSopra(false)}
        onDrop={e => { e.preventDefault(); setSopra(false); prendi(e.dataTransfer); }}
        title="Trascina un’immagine, oppure passa sopra col mouse e incolla con ⌘V"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- anteprima del gestionale, anche di immagini appena caricate */}
        {valore && <img className={s.zonaImg} src={anteprima(valore)} alt="" />}
        {children}
        <div className={s.zonaComandi}>
          <button type="button" className={s.zonaInvito} onClick={() => input.current?.click()}>
            {carico > 0 ? <Loader2 size={18} className={s.gira} /> : <ImagePlus size={18} />}
            <span>{carico > 0 ? `Carico${carico > 1 ? ` (${carico})` : ''}…` : valore ? `Sostituisci: ${etichetta}` : `${etichetta} · o incolla con ⌘V`}</span>
          </button>
          {src && f && !multipla && (
            <button type="button" className={s.zonaInvito} onClick={() => setTaglio(true)} title="Ritaglia e adatta">
              <Crop size={16} /><span>Ritaglia</span>
            </button>
          )}
        </div>
        <input ref={input} type="file" accept="image/*" multiple={multipla} hidden
          onChange={e => { if (e.target.files?.length) prendi(e.target.files); e.target.value = ''; }} />
      </div>
      {f && (
        <p className={s.misura} data-bassa={voto && !voto.ok ? '' : undefined}>
          {voto?.testo ? `${voto.testo} ` : ''}{consiglio(f)} {f.nota}
        </p>
      )}
      {taglio && src && f && (
        <Ritaglia src={src} formato={f} onChiudi={() => setTaglio(false)} onErrore={onErrore}
          onFatto={c => { setTaglio(false); onCaricate([c]); }} />
      )}
    </div>
  );
}
