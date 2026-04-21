'use client';

import React, { useState, useEffect } from 'react';
import styles from './RoomManagementModal.module.css';
import { 
  adminGetSeatingPlans, 
  adminToggleHideSeatingPlan, 
  adminToggleFavoriteSeatingPlan, 
  adminUpdateRoomMetadata,
  adminSyncMirror,
  adminCreateSeatingPlan,
  adminBulkHideSeatingPlans
} from '@/actions/adminActions';
import { 
  X, 
  Eye, 
  EyeOff, 
  Star, 
  Grid, 
  Plus, 
  Loader2, 
  Edit3, 
  Check, 
  PlusCircle, 
  Search,
  RefreshCw
} from 'lucide-react';

interface Room {
  id: number;
  name: string;
  internalName: string;
  isHidden: boolean;
  isFavorite: boolean;
}

interface RoomManagementModalProps {
  onClose: () => void;
  onUpdate: () => void;
}

export default function RoomManagementModal({ onClose, onUpdate }: RoomManagementModalProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [numRows, setNumRows] = useState(5);
  const [numCols, setNumCols] = useState(10);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const loadRooms = async () => {
    setLoading(true);
    try {
      const data = await adminGetSeatingPlans({ includeHidden: true });
      setRooms(data);
    } catch (error) {
      console.error('Error loading rooms:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRooms();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await adminSyncMirror();
      await loadRooms();
      onUpdate();
    } catch (error) {
      alert('Errore durante la sincronizzazione');
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleHide = async (id: number) => {
    try {
      await adminToggleHideSeatingPlan(id);
      setRooms(rooms.map(r => r.id === id ? { ...r, isHidden: !r.isHidden } : r));
      onUpdate();
    } catch (error) {
      console.error('Toggle Hide error:', error);
    }
  };

  const handleToggleFav = async (id: number) => {
    try {
      await adminToggleFavoriteSeatingPlan(id);
      setRooms(rooms.map(r => r.id === id ? { ...r, isFavorite: !r.isFavorite } : r));
      onUpdate();
    } catch (error) {
      console.error('Toggle Favorite error:', error);
    }
  };

  const handleUpdateAlias = async (id: number, alias: string) => {
    try {
      await adminUpdateRoomMetadata(id, { internalName: alias });
      onUpdate();
    } catch (error) {
      console.error('Update alias error:', error);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      await adminCreateSeatingPlan(newRoomName.trim(), numRows, numCols);
      setCreateSuccess(`✅ Sala "${newRoomName.toUpperCase().trim()}" creata con successo! (${numRows} file × ${numCols} posti = ${numRows * numCols} posti totali)`);
      setNewRoomName('');
      setNumRows(5);
      setNumCols(10);
      await loadRooms();
      onUpdate();
    } catch (error: any) {
      const pretixMsg = error?.message || 'Errore sconosciuto';
      setCreateError(`❌ Pretix ha rifiutato la richiesta: ${pretixMsg}`);
      console.error('[RoomModal] Errore creazione sala:', pretixMsg);
    } finally {
      setCreating(false);
    }
  };

  const handleBulkHide = async () => {
    if (!confirm('Sei sicuro di voler nascondere TUTTE le sale nel dropdown principale?')) return;
    try {
      await adminBulkHideSeatingPlans();
      await loadRooms();
      onUpdate();
    } catch (error) {
      console.error('Bulk hide error:', error);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>
            <Grid size={24} className="text-white" />
            Gestione Sale Cinema
          </h2>
          <div className="flex items-center gap-2">
            <button 
              className={`${styles.actionBtn} ${styles.bulkHideBtn}`}
              onClick={handleBulkHide}
              title="Nascondi Tutte le Sale"
            >
              <EyeOff size={18} />
              <span className="text-xs font-bold">NASCONDI TUTTE</span>
            </button>
            <button 
              className={styles.actionBtn} 
              onClick={handleSync} 
              disabled={syncing}
              title="Sincronizza con Pretix"
            >
              {syncing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            </button>
            <button className={styles.btnClose} onClick={onClose}>
              <X size={24} />
            </button>
          </div>
        </div>

        <div className={styles.modalBody}>
          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 gap-4">
              <Loader2 size={40} className="animate-spin text-zinc-600" />
              <p className="text-zinc-500 italic">Caricamento registro sale...</p>
            </div>
          ) : (
            <div className={styles.roomList}>
              {rooms.map(room => (
                <div key={room.id} className={styles.roomRow}>
                  <div className={styles.roomInfo}>
                    <div className={styles.roomNameRow}>
                      <input 
                        type="text" 
                        defaultValue={room.internalName} 
                        className={styles.aliasInput}
                        onBlur={(e) => handleUpdateAlias(room.id, e.target.value)}
                        placeholder="Aggiungi Alias..."
                      />
                      {room.isFavorite && <Star size={14} className="fill-amber-500 text-amber-500" />}
                    </div>
                    <span className={styles.originalName}>ORIGINALE: {room.name || 'Senza Nome'} (ID: {room.id})</span>
                  </div>

                  <div className={styles.roomActions}>
                    <button 
                      className={`${styles.actionBtn} ${room.isFavorite ? styles.actionBtnFav : ''}`}
                      onClick={() => handleToggleFav(room.id)}
                      title="Segna come Preferita"
                    >
                      <Star size={18} className={room.isFavorite ? 'fill-current' : ''} />
                    </button>
                    <button 
                      className={`${styles.actionBtn} ${room.isHidden ? styles.actionBtnActive : ''}`}
                      onClick={() => handleToggleHide(room.id)}
                      title={room.isHidden ? 'Rendi Visibile' : 'Nascondi Sala'}
                    >
                      {room.isHidden ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              ))}

              <div className={styles.createSection}>
                <h3>
                  <PlusCircle size={18} />
                  Crea Nuova Sala su Pretix
                </h3>
                <form className={styles.createForm} onSubmit={handleCreate}>
                  <input 
                    type="text" 
                    placeholder="Nome sala (es: SALA 1)" 
                    className={styles.createInput}
                    value={newRoomName}
                    onChange={e => { setNewRoomName(e.target.value); setCreateError(null); setCreateSuccess(null); }}
                    required
                    style={{ flex: '1 1 auto' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                    <label style={{ fontSize: '0.7rem', color: '#888', whiteSpace: 'nowrap' }}>File:</label>
                    <input
                      type="number"
                      min={1} max={50}
                      value={numRows}
                      onChange={e => setNumRows(Math.max(1, Math.min(50, parseInt(e.target.value) || 5)))}
                      className={styles.createInput}
                      style={{ width: '60px', textAlign: 'center', flexShrink: 0 }}
                      title="Numero di file (righe)"
                    />
                    <label style={{ fontSize: '0.7rem', color: '#888', whiteSpace: 'nowrap' }}>Posti/fila:</label>
                    <input
                      type="number"
                      min={1} max={50}
                      value={numCols}
                      onChange={e => setNumCols(Math.max(1, Math.min(50, parseInt(e.target.value) || 10)))}
                      className={styles.createInput}
                      style={{ width: '60px', textAlign: 'center', flexShrink: 0 }}
                      title="Posti per fila (colonne)"
                    />
                  </div>
                  <button className={styles.createBtn} disabled={creating || !newRoomName.trim()} style={{ flexShrink: 0 }}>
                    {creating ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                    {creating ? 'CREAZIONE...' : `CREA (${numRows * numCols} posti)`}
                  </button>
                </form>
                {createError && (
                  <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#3f0000', border: '1px solid #c0392b', borderRadius: '8px', color: '#ff6b6b', fontSize: '0.8rem', wordBreak: 'break-word' }}>
                    {createError}
                  </div>
                )}
                {createSuccess && (
                  <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#003f1a', border: '1px solid #27ae60', borderRadius: '8px', color: '#6bff9e', fontSize: '0.8rem' }}>
                    {createSuccess}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
