"use client";

import React, { useState, useEffect } from 'react';
import styles from './EventList.module.css';

interface Event {
  name: { it?: string, en?: string };
  slug: string;
  date_from: string;
  id?: string;
}

export default function EventList() {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Per modificare l'orario
  const [editingEvent, setEditingEvent] = useState<string | null>(null);
  const [newDateFrom, setNewDateFrom] = useState('');

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/pretix/events/');
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || data.detail || 'Errore configurazione Pretix.');
      }
      
      setEvents(data.results || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const cancelEvent = async (slug: string) => {
    if (!confirm('Sei sicuro di voler cancellare questo evento?')) return;
    
    try {
      const res = await fetch(`/api/admin/pretix/events/${slug}/`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Cancellazione fallita');
      fetchEvents();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const startEditTime = (e: Event) => {
    setEditingEvent(e.slug);
    // Remove trailing 'Z' and simplify for datetime-local input
    setNewDateFrom(e.date_from.slice(0, 16));
  };

  const saveEditTime = async (slug: string) => {
    try {
      const res = await fetch(`/api/admin/pretix/events/${slug}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_from: new Date(newDateFrom).toISOString() }),
      });
      if (!res.ok) throw new Error('Modifica orario fallita');
      setEditingEvent(null);
      fetchEvents();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const blockSeats = async (slug: string) => {
    const seatsToBlock = prompt("Inserisci gli ID o nomi dei posti da bloccare (separati da virgola):", "A1,A2");
    if (!seatsToBlock) return;
    
    try {
      const seatsArray = seatsToBlock.split(',').map(s => s.trim());
      const res = await fetch(`/api/admin/pretix/events/${slug}/seats/bulk_block/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seats: seatsArray }),
      });
      if (!res.ok) throw new Error('Blocco posti fallito');
      alert('Posti bloccati con successo!');
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (isLoading) return <p>Caricamento eventi in corso...</p>;
  if (error) return <div className={styles.errorBox}><p>Impossibile connettersi all'API di Pretix.</p><p className={styles.errDetail}>{error}</p><p>Assicurati che `PRETIX_API_TOKEN` sia configurato.</p></div>;

  if (events.length === 0) return <p>Nessun evento presente in Pretix.</p>;

  return (
    <ul className={styles.eventList}>
      {events.map(event => (
        <li key={event.slug} className={styles.eventItem}>
          <div className={styles.eventInfo}>
            <span className={styles.eventName}>{event.name.it || event.name.en || 'Evento senza nome'}</span>
            
            {editingEvent === event.slug ? (
              <div className={styles.editRow}>
                <input 
                  type="datetime-local" 
                  value={newDateFrom} 
                  onChange={(e) => setNewDateFrom(e.target.value)} 
                  className={styles.inputTime}
                />
                <button onClick={() => saveEditTime(event.slug)} className={styles.saveBtn}>Salva</button>
                <button onClick={() => setEditingEvent(null)} className={styles.cancelBtn}>Annulla</button>
              </div>
            ) : (
              <span className={styles.eventTime}>{new Date(event.date_from).toLocaleString('it-IT')}</span>
            )}
          </div>

          <div className={styles.actions}>
            {!editingEvent && (
              <>
                <button onClick={() => startEditTime(event)} className={styles.actionBtn}>Modifica Orario</button>
                <button onClick={() => blockSeats(event.slug)} className={styles.actionBtn}>Blocca Posti</button>
                <button onClick={() => cancelEvent(event.slug)} className={`${styles.actionBtn} ${styles.dangerBtn}`}>Cancella</button>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
