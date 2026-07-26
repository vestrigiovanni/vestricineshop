'use client';

import React, { useState, useEffect } from 'react';
import styles from './AdminPanel.module.css';
import {
  adminDeleteEvent,
  adminDeleteEventGroup,
  adminUpdateEventDate,
  adminListEvents,
  adminGetSeatingPlans,
  adminListQuotas,
  adminGetQuotaAvailability,
  adminGetEmptyProjections,
} from '@/actions/adminActions';
import { Calendar, Trash2, Edit3, Loader2, X, Info, Clock, Ticket, TriangleAlert, ChevronRight, ChevronDown, Monitor, ShoppingBag, ExternalLink, QrCode, Settings, BookOpen, Wand2 } from 'lucide-react';
import dynamic from 'next/dynamic';
const TicketRecoveryButton = dynamic(() => import('./TicketRecovery'), { ssr: false });
const CatalogBrowser = dynamic(() => import('./CatalogBrowser/CatalogBrowser'), { ssr: false });
import RoomManagementModal from './RoomManagementModal';


interface AdminDashboardProps {
  initialEvents: any[];
}

export default function AdminDashboard({ initialEvents }: AdminDashboardProps) {
  const [events, setEvents] = useState(initialEvents);
  const [seatingPlans, setSeatingPlans] = useState<any[]>([]);

  // Form State for Scheduling
  const initPlans = async () => {
    try {
      const plans = await adminGetSeatingPlans();
      setSeatingPlans(plans);

    } catch (err) {
      console.error('Error fetching initial data:', err);
    }
  };

  useEffect(() => {
    initPlans();
  }, []);

  const [showCatalog, setShowCatalog] = useState(false);
  const [quotasState, setQuotasState] = useState<Record<number, any[]>>({});
  const [availabilityState, setAvailabilityState] = useState<Record<number, any>>({});
  const [loadingQuotas, setLoadingQuotas] = useState<Record<number, boolean>>({});
  const [applyingSuggestion, setApplyingSuggestion] = useState<Record<number, boolean>>({});

  const [expandedMovies, setExpandedMovies] = useState<Set<string>>(new Set());
  const [showDisplayModal, setShowDisplayModal] = useState(false);
  const [defaultSalaId, setDefaultSalaId] = useState<string | null>(null);
  const [prerollMin, setPrerollMin] = useState<number>(0);
  const [prerollSec, setPrerollSec] = useState<number>(0);
  const [showCleaningModal, setShowCleaningModal] = useState(false);
  const [emptyProjections, setEmptyProjections] = useState<any[]>([]);
  const [loadingCleaning, setLoadingCleaning] = useState(false);
  const [showRoomModal, setShowRoomModal] = useState(false);

  const availableSeatingPlans = seatingPlans;
  useEffect(() => {
    const saved = localStorage.getItem('defaultSalaId');
    if (saved) setDefaultSalaId(saved);
  }, []);

  const handleSetDefaultSala = (id: string) => {
    setDefaultSalaId(id);
    localStorage.setItem('defaultSalaId', id);
  };

  /**
   * Apre il wizard di programmazione già puntato su un film.
   *
   * Sostituisce `selectMovieForScheduling`, `handleSelectFromCatalog` e
   * `handleReplica`: erano tre strade che finivano tutte nello stesso modale,
   * e ora sono lo stesso link con parametri diversi.
   */
  const openPlanner = (tmdbId: string | number, roomId?: string | number) => {
    const params = new URLSearchParams({ tmdb: String(tmdbId) });
    if (roomId) params.set('room', String(roomId));
    window.location.href = `/admin/programmazione?${params.toString()}`;
  };

  /** Replica di uno spettacolo esistente: stesso film, stessa sala. */
  const openPlannerFor = (event: any) => {
    let tmdbId = '';
    try {
      if (event.comment) tmdbId = JSON.parse(event.comment)?.tmdbId ?? '';
    } catch {
      /* commento non JSON */
    }
    if (!tmdbId) {
      alert('Questo spettacolo non ha un id TMDB nei metadati: aprilo dal catalogo.');
      return;
    }
    openPlanner(tmdbId, event.seating_plan);
  };

  const handleDelete = async (subeventId: number) => {
    if (!confirm('Sei sicuro di voler cancellare questa proiezione?')) return;
    try {
      await adminDeleteEvent(subeventId);
      const updatedEvents = await adminListEvents();
      setEvents(updatedEvents);
    } catch (error) {
      alert('Errore durante la cancellazione');
    } finally {
    }
  };

  const handleDeleteGroup = async (title: string, subeventIds: number[]) => {
    if (!confirm(`Sei sicuro di voler eliminare il film "${title}" e tutte le sue ${subeventIds.length} repliche?\n\nQuesta azione è irreversibile.`)) return;

    try {
      const res = await adminDeleteEventGroup(subeventIds);
      if (res.details && res.details.length > 0) {
        alert(`${res.summary}\n\nAlcuni errori:\n${res.details.join('\n')}`);
      } else {
        alert('Film e repliche eliminati con successo!');
      }

      const updatedEvents = await adminListEvents();
      setEvents(updatedEvents);
    } catch (error) {
      alert('Errore durante l\'eliminazione del gruppo');
    } finally {
    }
  };

  const handleUpdateDate = async (subeventId: number, currentDate: string) => {
    const d = new Date(currentDate);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const defaultValue = `${year}-${month}-${day}T${hours}:${minutes}`;

    const newDate = prompt('Inserisci la nuova data e ora (YYYY-MM-DDTHH:MM):', defaultValue);
    if (!newDate) return;
    try {
      await adminUpdateEventDate(subeventId, newDate);
      const updatedEvents = await adminListEvents();
      setEvents(updatedEvents);
      alert('Orario aggiornato con successo!');
    } catch (error: any) {
      console.error(error);
      if (error.message.includes('403')) {
        alert('⚠️ AZIONE NEGATA: Questa proiezione ha già dei biglietti emessi or è "in uso". Per motivi di sicurezza, Pretix non consente lo spostamento di eventi con vendite attive.');
      } else {
        alert('Errore durante l\'aggiornamento: ' + error.message);
      }
    } finally {
    }
  };

  const handleCheckAvailability = async (subeventId: number) => {
    setLoadingQuotas(prev => ({ ...prev, [subeventId]: true }));
    try {
      const quotas = await adminListQuotas(subeventId);
      setQuotasState(prev => ({ ...prev, [subeventId]: quotas }));

      const availabilities: Record<number, any> = {};
      for (const q of quotas) {
        const avail = await adminGetQuotaAvailability(q.id);
        availabilities[q.id] = avail;
      }
      setAvailabilityState(prev => ({ ...prev, ...availabilities }));
    } catch (error) {
      console.error('Error checking availability:', error);
    } finally {
      setLoadingQuotas(prev => ({ ...prev, [subeventId]: false }));
    }
  };

  // Hierarchy Logic: Group events by movie title
  const groupedEvents = React.useMemo(() => {
    const groups: Record<string, any[]> = {};
    events.forEach(event => {
      const title = event.name.it || event.name;
      if (!groups[title]) groups[title] = [];
      groups[title].push(event);
    });

    return Object.entries(groups).map(([title, items]) => ({
      title,
      items: items.sort((a, b) => new Date(a.date_from).getTime() - new Date(b.date_from).getTime())
    })).sort((a, b) => {
      const aMin = new Date(a.items[0].date_from).getTime();
      const bMin = new Date(b.items[0].date_from).getTime();
      return aMin - bMin;
    });
  }, [events]);

  const toggleMovieExpand = (title: string) => {
    setExpandedMovies(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  // Calcola gli ID degli eventi che si sovrappongono nel tempo
  const getOverlappingIds = (evts: any[]): Set<number> => {
    const overlapping = new Set<number>();
    for (let i = 0; i < evts.length; i++) {
      for (let j = i + 1; j < evts.length; j++) {
        const a = evts[i];
        const b = evts[j];
        const aStart = new Date(a.date_from).getTime();
        const aEnd = a.date_to ? new Date(a.date_to).getTime() : aStart;
        const bStart = new Date(b.date_from).getTime();
        const bEnd = b.date_to ? new Date(b.date_to).getTime() : bStart;
        if (aStart < bEnd && aEnd > bStart) {
          overlapping.add(a.id);
          overlapping.add(b.id);
        }
      }
    }
    return overlapping;
  };

  const overlappingIds = getOverlappingIds(events);

  // Genera fino a 6 slot liberi (±15 min, arrotondati) per un dato evento
  const getSuggestedSlots = (event: any): Date[] => {
    const duration = event.date_to
      ? new Date(event.date_to).getTime() - new Date(event.date_from).getTime()
      : 2 * 60 * 60 * 1000; // fallback 2h

    const base = new Date(event.date_from);
    // Arrotonda ai 5 minuti più vicini
    const roundTo5 = (d: Date): Date => {
      const ms = 5 * 60 * 1000;
      return new Date(Math.round(d.getTime() / ms) * ms);
    };
    const baseRounded = roundTo5(base);
    const step = 5 * 60 * 1000;

    const candidates: Date[] = [];
    // Genera slot in finestra ±3 ore in passi da 5 min
    for (let delta = -36; delta <= 36; delta++) {
      if (delta === 0) continue;
      candidates.push(new Date(baseRounded.getTime() + delta * step));
    }
    // Ordina per distanza dalla base
    candidates.sort((a, b) =>
      Math.abs(a.getTime() - baseRounded.getTime()) - Math.abs(b.getTime() - baseRounded.getTime())
    );

    const others = events.filter((e: any) => e.id !== event.id);
    const free: Date[] = [];
    for (const cand of candidates) {
      const cStart = cand.getTime();
      const cEnd = cStart + duration;
      // Escludi slot nel passato
      if (cStart < Date.now()) continue;
      const conflicts = others.some((o: any) => {
        const oStart = new Date(o.date_from).getTime();
        const oEnd = o.date_to ? new Date(o.date_to).getTime() : oStart;
        return cStart < oEnd && cEnd > oStart;
      });
      if (!conflicts) {
        free.push(cand);
        if (free.length >= 6) break;
      }
    }
    return free;
  };

  const handleApplySuggestion = async (eventId: number, newDate: Date) => {
    if (!confirm(`Sposta la proiezione alle ${newDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} del ${newDate.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}?`)) return;
    setApplyingSuggestion(prev => ({ ...prev, [eventId]: true }));
    try {
      // Format as YYYY-MM-DDTHH:mm (local)
      const pad = (n: number) => String(n).padStart(2, '0');
      const formatted = `${newDate.getFullYear()}-${pad(newDate.getMonth() + 1)}-${pad(newDate.getDate())}T${pad(newDate.getHours())}:${pad(newDate.getMinutes())}`;
      await adminUpdateEventDate(eventId, formatted);
      const updatedEvents = await adminListEvents();
      setEvents(updatedEvents);
    } catch (error: any) {
      if (error.message?.includes('403')) {
        alert('⚠️ AZIONE NEGATA: Questa proiezione ha già dei biglietti emessi. Non è possibile spostarla.');
      } else {
        alert('Errore: ' + error.message);
      }
    } finally {
      setApplyingSuggestion(prev => ({ ...prev, [eventId]: false }));
    }
  };

  const handleOpenCleaningModal = async () => {
    setShowCleaningModal(true);
    setLoadingCleaning(true);
    try {
      const data = await adminGetEmptyProjections();
      setEmptyProjections(data);
    } catch (e) {
      alert('Errore caricamento proiezioni vuote.');
    } finally {
      setLoadingCleaning(false);
    }
  };

  const handleDeleteEmptyProjection = async (subeventId: number) => {
    if (!confirm('Attenzione: eliminerai definitivamente questa proiezione da Pretix. Procedere?')) return;
    try {
      await adminDeleteEvent(subeventId);
      setEmptyProjections(prev => prev.filter(p => p.id !== subeventId));
      const updatedEvents = await adminListEvents();
      setEvents(updatedEvents);
    } catch (error: any) {
      alert('Errore durante la cancellazione: ' + error.message);
    }
  };

  return (
    <div className={styles.dashboard}>
      {/* TOP BAR */}
      <div className={styles.topBar}>
        <div className={styles.defaultSalaContainer}>
          <label className={styles.defaultSalaLabel}>SALA DEFAULT:</label>
          <select
            className={styles.defaultSalaSelect}
            value={defaultSalaId || ''}
            onChange={(e) => handleSetDefaultSala(e.target.value)}
          >
            <option value="">Nessuna (Default)</option>
            {availableSeatingPlans.map(room => (
              <option key={room.id} value={room.id}>
                {room.isFavorite ? '⭐' : ''} [{room.id}] {room.internalName || room.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.topBarActions}>
          <a
            href="/admin/programmazione"
            className={`${styles.toolBtn} ${styles.toolBtnPurple}`}
            title="Scegli sala e periodo, poi i film: il calendario lo costruisce il cinema"
          >
            <Wand2 size={18} />
            <span>PROGRAMMA</span>
          </a>

          <button
            onClick={() => setShowRoomModal(true)}
            className={`${styles.toolBtn} ${styles.toolBtnDark}`}
          >
            <Settings size={18} />
            <span>GESTISCI SALE</span>
          </button>

          <a
            href="/admin/cassa"
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.toolBtn} ${styles.toolBtnGreen}`}
          >
            <ShoppingBag size={18} />
            APRI CASSA
          </a>

          <TicketRecoveryButton />

          <button
            onClick={() => setShowDisplayModal(true)}
            className={`${styles.toolBtn} ${styles.toolBtnDark}`}
          >
            <Monitor size={18} />
            INFO ON SCREEN
          </button>

          <a
            href="/admin/movies-control"
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.toolBtn} ${styles.toolBtnRed}`}
          >
            <Settings size={18} />
            TORRE DI CONTROLLO
          </a>
        </div>
      </div>

      {/* PROGRAMMAZIONE: un solo ingresso, il wizard. */}
      <div className="flex flex-col gap-8">
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.title}>Programmazione</h2>
            <div className={styles.headerActions}>
              <a href="/admin/movies-control" target="_blank" rel="noopener noreferrer" className={styles.btnActionIcon} title="Gestisci Overrides">
                <Settings size={18} />
              </a>
              <button
                type="button"
                className={styles.btnActionIcon}
                title="Gestisci il catalogo film"
                onClick={() => setShowCatalog(true)}
              >
                <BookOpen size={18} />
              </button>
            </div>
          </div>

          <a href="/admin/programmazione" className={`${styles.btn} ${styles.btnPrimary} ${styles.scheduleEntry}`}>
            <Wand2 size={20} />
            <span>
              <b>Programma spettacoli</b>
              Scegli sala e periodo, poi i film: orari, pause e repliche li calcola il cinema
            </span>
          </a>
        </section>

      </div>







      {/* RIGHT COLUMN: CURRENT PROGRAMMING */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.title}>Programmazione Attuale (Pretix)</h2>
          <div className={styles.programmingActions}>
            <button
              onClick={handleOpenCleaningModal}
              className={styles.btnExternalLink}
              style={{ backgroundColor: '#dc2626', color: 'white', borderColor: '#b91c1c' }}
            >
              <Trash2 size={14} />
              PULIZIA PROIEZIONI
            </button>
            <a
              href="https://pretix.eu/vestri/npkez/"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.btnExternalLink}
            >
              <ExternalLink size={14} />
              VAI A PRETIX
            </a>
            <a
              href="https://pretix.eu/control/event/vestri/npkez/webcheckin/"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.btnExternalLink}
            >
              <QrCode size={14} />
              WEB CHECK-IN
            </a>
          </div>
        </div>

        <div className={styles.eventList}>
          {groupedEvents.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-zinc-500 gap-4">
              <Info size={40} strokeWidth={1} />
              <p className="italic">Nessuna proiezione programmata.</p>
            </div>
          ) : (
            groupedEvents.map((group) => {
              const isExpanded = expandedMovies.has(group.title);
              const nextSubevent = group.items[0];
              const totalCount = group.items.length;
              const hasConflicts = group.items.some(e => overlappingIds.has(e.id));

              return (
                <div key={group.title} className={styles.movieGroup}>
                  <div
                    className={`${styles.movieRow} ${isExpanded ? styles.movieRowExpanded : ''}`}
                    onClick={() => toggleMovieExpand(group.title)}
                  >
                    <div className={styles.movieRowMain}>
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      <div className={styles.movieRowDesc}>
                        <h3 className={styles.movieRowTitle}>
                          {group.title}
                          {totalCount > 1 && <span className={styles.badgeCount}>{totalCount} Repliche</span>}
                          {hasConflicts && <span className={styles.badgeConflictSmall}><TriangleAlert size={10} /> Conflitto</span>}
                        </h3>
                        <p className={styles.movieRowUpcoming}>
                          Prossima: {new Date(nextSubevent.date_from).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} • {new Date(nextSubevent.date_from).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <div className={styles.movieRowActions}>
                      <button
                        className={styles.btnDeleteGroup}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteGroup(group.title, group.items.map(i => i.id));
                        }}
                        title="Elimina film e tutte le repliche"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className={styles.subeventList}>
                      {group.items.map((event: any) => {
                        const isOverlapping = overlappingIds.has(event.id);
                        return (
                          <div key={event.id} className={`${styles.eventRow}${isOverlapping ? ' ' + styles.eventRowOverlap : ''}`}>
                            <div className={styles.eventDetails}>
                              <div className={styles.eventMeta}>
                                <span className={styles.metaBadge}>
                                  <Calendar size={12} />
                                  {new Date(event.date_from).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                                </span>
                                <span className={styles.metaBadge}>
                                  <Clock size={12} />
                                  {new Date(event.date_from).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {isOverlapping && (
                                  <span className={styles.overlapLabel}>
                                    <TriangleAlert size={10} /> Conflitto
                                  </span>
                                )}
                              </div>

                              {isOverlapping && (
                                <div className={styles.suggestionPanel}>
                                  <div className={styles.suggestionHeader}>
                                    <Clock size={12} />
                                    <span>Risolvi Sovrapposizione:</span>
                                  </div>
                                  <div className={styles.suggestionSlots}>
                                    {getSuggestedSlots(event).length === 0 ? (
                                      <span className={styles.suggestionEmpty}>Nessun orario libero trovato</span>
                                    ) : (
                                      getSuggestedSlots(event).map((slot, idx) => (
                                        <button
                                          key={idx}
                                          className={styles.suggestionSlot}
                                          onClick={() => handleApplySuggestion(event.id, slot)}
                                          disabled={applyingSuggestion[event.id]}
                                        >
                                          {applyingSuggestion[event.id] ? <Loader2 size={10} className="animate-spin" /> : <Clock size={10} />}
                                          <span>{slot.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                                        </button>
                                      ))
                                    )}
                                  </div>
                                </div>
                              )}

                              {quotasState[event.id] && (
                                <div className={styles.quotaGrid}>
                                  {quotasState[event.id].map((q: any) => (
                                    <span key={q.id} className={styles.quotaBadge}>
                                      <Ticket size={10} />
                                      {q.name.it}: <strong>{availabilityState[q.id]?.available_number ?? '...'}</strong> / {q.size ?? '∞'}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className={styles.actions}>
                              <button
                                className={styles.btnActionIcon}
                                onClick={() => handleCheckAvailability(event.id)}
                                disabled={loadingQuotas[event.id]}
                                title="Disponibilità"
                              >
                                {loadingQuotas[event.id] ? <Loader2 className="animate-spin" size={14} /> : <Ticket size={14} />}
                              </button>
                              <button
                                className={styles.btnActionIcon}
                                onClick={() => openPlannerFor(event)}
                                title="Replica: apre la programmazione con questo film già scelto"
                              >
                                <Calendar size={14} />
                              </button>
                              <button
                                className={styles.btnActionIcon}
                                onClick={() => handleUpdateDate(event.id, event.date_from)}
                                title="Sposta"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                className={`${styles.btnActionIcon} ${styles.btnActionDanger}`}
                                onClick={() => handleDelete(event.id)}
                                title="Elimina"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>





      {/* La programmazione vive tutta in /admin/programmazione: qui non c'è
          più un modale che duplichi orari, conflitti e slot. */}

      {/* 2. EXTERNAL DISPLAY CONFIGURATION MODAL */}
      {showDisplayModal && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modalContent} ${styles.displayModalConfig}`}>
            <div className={styles.modalHeader}>
              <h2>
                <Monitor size={22} color="#0f172a" />
                Configurazione Display Esterno
              </h2>
              <button
                onClick={() => setShowDisplayModal(false)}
                className={styles.modalClose}
              >
                <X size={20} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <p className="text-sm text-zinc-500 mb-6">
                Configura il tempo di "preroll" (trailer e pubblicità) prima dell'inizio ufficiale del film.
              </p>

              <div className={styles.prerollInputs}>
                <div className={styles.prerollField}>
                  <label className={styles.modalLabel}>Minuti</label>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={prerollMin}
                    onChange={(e) => setPrerollMin(parseInt(e.target.value) || 0)}
                    className={styles.prerollInput}
                  />
                </div>
                <span className="text-2xl font-bold mt-6">:</span>
                <div className={styles.prerollField}>
                  <label className={styles.modalLabel}>Secondi</label>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={prerollSec}
                    onChange={(e) => setPrerollSec(parseInt(e.target.value) || 0)}
                    className={styles.prerollInput}
                  />
                </div>
              </div>

              <a
                href={`/display-esterno?preroll=${(prerollMin * 60) + prerollSec}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShowDisplayModal(false)}
                className={`${styles.modalBtnSubmit} ${styles.btnLaunchDisplay}`}
              >
                <Monitor size={20} />
                Lancia Display
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 3. CLEANING MODAL */}
      {showCleaningModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} style={{ maxWidth: '600px' }}>
            <div className={styles.modalHeader}>
              <h2>
                <Trash2 size={22} color="#dc2626" />
                Pulizia Proiezioni Vuote
              </h2>
              <button
                onClick={() => setShowCleaningModal(false)}
                className={styles.modalClose}
                title="Chiudi"
              >
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalBody} style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {loadingCleaning ? (
                <div className="flex flex-col items-center justify-center p-12 gap-4">
                  <Loader2 size={36} className="animate-spin text-red-600" />
                  <p className="text-zinc-600 font-medium">Calcolo proiezioni con 0 biglietti venduti in corso... Questa operazione richiede di controllare una ad una tutte le proiezioni future su Pretix.</p>
                </div>
              ) : emptyProjections.length === 0 ? (
                <div className="p-12 text-center text-zinc-500 flex flex-col items-center gap-4">
                  <Info size={40} className="text-zinc-400" />
                  <p>Non ci sono proiezioni vuote future.<br />Tutti gli spettacoli in programma hanno almeno un biglietto venduto o bloccato.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {emptyProjections.map(proj => {
                    const title = proj.name.it || proj.name;
                    const d = new Date(proj.date_from);
                    const dateStr = d.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' });
                    const timeStr = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

                    let runtime = 120;
                    try {
                      if (proj.comment) {
                        const metadata = JSON.parse(proj.comment);
                        if (metadata.runtime) runtime = metadata.runtime;
                      }
                    } catch (e) { }

                    const replicaCount = events.filter(e => (e.name.it || e.name) === title).length;

                    return (
                      <div key={proj.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.75rem', backgroundColor: '#fff', marginBottom: '0.75rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', textAlign: 'left', flex: 1, minWidth: 0 }}>
                          <p style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0f172a', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, backgroundColor: '#f1f5f9', color: '#475569', padding: '0.2rem 0.5rem', borderRadius: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.2rem', letterSpacing: '0.5px' }}>
                              <Clock size={12} /> {runtime} MIN
                            </span>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, backgroundColor: replicaCount > 1 ? '#eff6ff' : '#f8fafc', color: replicaCount > 1 ? '#2563eb' : '#64748b', border: `1px solid ${replicaCount > 1 ? '#bfdbfe' : '#e2e8f0'}`, padding: '0.2rem 0.5rem', borderRadius: '0.4rem', letterSpacing: '0.5px' }}>
                              {replicaCount} {replicaCount === 1 ? 'REPLICA' : 'REPLICHE'}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexShrink: 0 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'right' }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e293b' }}>{dateStr}</span>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>{timeStr}</span>
                          </div>

                          <button
                            onClick={() => handleDeleteEmptyProjection(proj.id)}
                            style={{
                              padding: '0.6rem',
                              backgroundColor: '#f8fafc',
                              color: '#94a3b8',
                              border: '1px solid #e2e8f0',
                              borderRadius: '0.5rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s'
                            }}
                            title="Elimina proiezione vuota"
                            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#fef2f2'; e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fecaca'; }}
                            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. ROOM MANAGEMENT MODAL */}
      {showRoomModal && (
        <RoomManagementModal
          onClose={() => setShowRoomModal(false)}
          onUpdate={() => initPlans()}
        />
      )}


      {showCatalog && (
        <CatalogBrowser
          onSelectFilm={(tmdbId: string) => openPlanner(tmdbId)}
          onClose={() => setShowCatalog(false)}
        />
      )}

    </div>
  );
}
