'use client';

import { useEffect, useState } from 'react';
import Finestra from '../Finestra';
import { immagineTmdb } from '../immagini';
import type { Media } from '../tmdb/leggi';
import { mediaFilm } from './azioni';

export type Tipo = 'locandina' | 'fondale' | 'logo' | 'trailer';

const TITOLI: Record<Tipo, string> = {
  locandina: 'Scegli la locandina',
  fondale: 'Scegli il fondale',
  logo: 'Scegli il logo',
  trailer: 'Scegli il trailer',
};

/** Le immagini e i trailer del film su TMDB: un clic e il campo è scelto. */
export default function Scegli({ tmdbId, tipo, attuale, onScelto, onChiudi }: {
  tmdbId: string;
  tipo: Tipo;
  attuale: string;
  onScelto: (valore: string) => void;
  onChiudi: () => void;
}) {
  const [media, setMedia] = useState<Media | null>(null);
  const [errore, setErrore] = useState('');
  const [lingua, setLingua] = useState<'it' | 'en'>('it');

  useEffect(() => {
    let via = false;
    mediaFilm(tmdbId).then(r => {
      if (via) return;
      if (!r.ok) return setErrore(r.errore);
      setMedia(r.media);
      if (!r.media.video.it.length) setLingua('en');
    });
    return () => { via = true; };
  }, [tmdbId]);

  const scegli = (v: string) => {
    onScelto(v);
    onChiudi();
  };

  const immagini = !media ? [] : tipo === 'locandina' ? media.locandine : tipo === 'fondale' ? media.fondali : media.loghi;

  return (
    <Finestra titolo={TITOLI[tipo]} onChiudi={onChiudi} larga>
      {!media && !errore && <p className="g-nota">Sfoglio TMDB…</p>}
      {errore && <p className="g-errore">{errore}</p>}

      {media && tipo === 'trailer' && (
        <>
          <div className="g-scelta" role="group" aria-label="Lingua del trailer">
            {(['it', 'en'] as const).map(l => (
              <button key={l} type="button" className="g-scelta__voce" aria-pressed={lingua === l} onClick={() => setLingua(l)}>
                {l === 'it' ? 'Italiano' : 'Inglese'} <span className="num">{media.video[l].length}</span>
              </button>
            ))}
          </div>
          {media.video[lingua].length === 0 ? (
            <p className="g-nota">Nessun trailer in questa lingua.</p>
          ) : (
            <div className="g-griglia" data-tipo="fondale">
              {media.video[lingua].map(v => (
                <button key={v.key} type="button" className="g-griglia__voce" aria-current={attuale.includes(v.key) || undefined}
                  onClick={() => scegli(`https://www.youtube.com/watch?v=${v.key}`)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`https://img.youtube.com/vi/${v.key}/mqdefault.jpg`} alt="" loading="lazy" />
                  <span>{v.name}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {media && tipo !== 'trailer' && (immagini.length === 0 ? (
        <p className="g-nota">TMDB non ha immagini di questo tipo per questo film.</p>
      ) : (
        <div className="g-griglia" data-tipo={tipo}>
          {immagini.map(i => (
            <button key={i.file_path} type="button" className="g-griglia__voce" aria-current={attuale === i.file_path || undefined} onClick={() => scegli(i.file_path)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={immagineTmdb(i.file_path, tipo === 'locandina' ? 'w342' : 'w500') ?? ''} alt="" loading="lazy" />
              <span>{i.iso_639_1 ? i.iso_639_1.toUpperCase() : 'senza scritte'}{i.width ? ` · ${i.width}px` : ''}</span>
            </button>
          ))}
        </div>
      ))}
    </Finestra>
  );
}
