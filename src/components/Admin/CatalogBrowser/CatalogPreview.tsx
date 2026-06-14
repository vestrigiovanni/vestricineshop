'use client';

import React, { useEffect, useState } from 'react';
import { X, Edit3, Calendar, Check } from 'lucide-react';
import styles from './CatalogBrowser.module.css';
import { adminGetMovieById } from '@/actions/adminActions';
import { catalogSearchTmdb, catalogFixTmdbId, catalogMarkVerified } from '@/actions/catalogActions';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import type { CatalogFilmRow } from './CatalogBrowser';

interface Props {
  film: CatalogFilmRow;
  onClose: () => void;
  onSchedule: (tmdbId: string) => void;
  onFixed: () => void;
}

export default function CatalogPreview({ film, onClose, onSchedule, onFixed }: Props) {
  const [details, setDetails] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [fixMode, setFixMode] = useState(false);
  const [fixQuery, setFixQuery] = useState('');
  const [fixResults, setFixResults] = useState<any[]>([]);
  const [fixing, setFixing] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    if (!film.tmdbId) { setLoading(false); setFixMode(true); setFixQuery(film.title); return; }
    adminGetMovieById(film.tmdbId)
      .then((d) => { if (alive) setDetails(d); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [film.tmdbId, film.title]);

  const runFixSearch = async () => {
    const res = await catalogSearchTmdb(fixQuery || film.title);
    setFixResults(res);
  };

  const applyFix = async (newTmdbId: string) => {
    setFixing(true);
    try {
      await catalogFixTmdbId(film.id, newTmdbId);
      onFixed();
    } finally {
      setFixing(false);
    }
  };

  const [confirming, setConfirming] = useState(false);
  const needsVerify = film.verifyStatus === 'suspect' || film.verifyStatus === 'missing';

  const confirmCorrect = async () => {
    setConfirming(true);
    try {
      await catalogMarkVerified(film.id);
      onFixed();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className={styles.overlay} style={{ zIndex: 1100, background: 'rgba(0,0,0,0.85)' }}>
      <div className={styles.header}>
        <h2>{film.title} {film.year ? `(${film.year})` : ''}</h2>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Chiudi"><X size={22} /></button>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', padding: '1.5rem', overflow: 'auto' }}>
        <div style={{ flex: '0 0 280px' }}>
          {(() => {
            const poster = getTMDBImageUrl(details?.poster_path ?? film.posterPath, 'w500');
            return poster
              ? <img src={poster} alt={film.title} style={{ width: '100%', borderRadius: 12 }} />
              : <div className={styles.noPoster} style={{ borderRadius: 12 }}>Nessun poster</div>;
          })()}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {loading && <p>Carico anteprima da TMDB…</p>}

          {!loading && details && (
            <>
              <p style={{ opacity: 0.75 }}>
                <strong>{details.title}</strong>{details.release_date ? ` · ${details.release_date.slice(0, 4)}` : ''}
                {details.runtime ? ` · ${details.runtime}m` : ''}
              </p>
              {details.director && <p><strong>Regia:</strong> {Array.isArray(details.director) ? details.director.join(', ') : details.director}</p>}
              {details.cast && <p style={{ opacity: 0.8 }}><strong>Cast:</strong> {(Array.isArray(details.cast) ? details.cast : []).slice(0, 5).join(', ')}</p>}
              <p style={{ lineHeight: 1.5, opacity: 0.9 }}>{details.overview || 'Trama non disponibile.'}</p>
            </>
          )}

          {needsVerify && (
            <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#fbbf24' }}>
              {film.tmdbId
                ? 'Questo film è “da verificare”: controlla che poster e dati qui sopra siano il film giusto, poi conferma o correggi.'
                : 'Nessun abbinamento TMDB trovato: cerca il film giusto qui sotto per collegarlo.'}
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            {needsVerify && film.tmdbId && (
              <button
                style={{ background: 'rgba(34,197,94,0.18)', border: '1px solid rgba(34,197,94,0.6)', color: '#fff', borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 600 }}
                disabled={confirming}
                onClick={confirmCorrect}
              >
                <Check size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} /> {confirming ? 'Confermo…' : 'Conferma: è corretto'}
              </button>
            )}
            {film.tmdbId && (
              <button className={styles.surprise} style={{ margin: 0 }} onClick={() => onSchedule(film.tmdbId!)}>
                <Calendar size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Programma
              </button>
            )}
            <button
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer' }}
              onClick={() => { setFixMode((v) => !v); setFixQuery(film.title); }}
            >
              <Edit3 size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} /> ID sbagliato? Correggi
            </button>
          </div>

          {fixMode && (
            <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={fixQuery}
                  onChange={(e) => setFixQuery(e.target.value)}
                  placeholder="Cerca per titolo o incolla un ID TMDB (es. 676819)…"
                  style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 8, padding: '0.45rem 0.6rem' }}
                />
                <button onClick={runFixSearch} className={styles.surprise} style={{ margin: 0 }}>Cerca</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '0.8rem' }}>
                {fixResults.map((m) => {
                  const p = getTMDBImageUrl(m.poster_path, 'w185');
                  return (
                    <button
                      key={m.id}
                      disabled={fixing}
                      onClick={() => applyFix(String(m.id))}
                      style={{ width: 110, background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', cursor: 'pointer', padding: 0, overflow: 'hidden' }}
                      title={`${m.title} (${m.release_date?.slice(0, 4) || 'N/D'})`}
                    >
                      {p ? <img src={p} alt={m.title} style={{ width: '100%', display: 'block' }} /> : <div style={{ height: 150 }} />}
                      <div style={{ fontSize: '0.7rem', padding: '4px' }}>{m.title} ({m.release_date?.slice(0, 4) || 'N/D'})</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
