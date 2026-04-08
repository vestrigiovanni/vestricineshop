'use client';

import React, { useState, useEffect } from 'react';
import styles from './AdminPanel.module.css';
import { adminSearchMovies, adminGetMovieById, adminScheduleMovie, adminDeleteEvent, adminDeleteEventGroup, adminUpdateEventDate, adminListEvents, adminGetSeatingPlans, adminGetSmartSuggestion, adminCheckConflict, adminGetWeeklySlots, adminBulkScheduleMovie, adminFindNearestSlots } from '@/actions/adminActions';
import { MovieItem, getTMDBImageUrl, getLanguageName } from '@/services/tmdb';
import Image from 'next/image';
import { Calendar, Trash2, Edit3, Plus, Search, Loader2, X, Info, Send, Eraser, Copy, Clock, Ticket, TriangleAlert, ChevronRight, ChevronDown, Monitor, ShoppingBag, ExternalLink } from 'lucide-react';
import { adminListQuotas, adminUpdateQuota, adminDeleteQuota, adminGetQuotaAvailability } from '@/actions/adminActions';

interface AdminDashboardProps {
  initialEvents: any[];
}

const FIXED_ROOMS = [
  { name: 'SALA 1', id: 4081 },
  { name: 'SALA NICCOLINI', id: 5391 },
  { name: 'SALA FOSSATI', id: 5392 },
  { name: 'SALA ARIPALMARIA', id: 5393 },
  { name: 'SALA MARTINO', id: 6550 },
  { name: '24 SALA AGOSTINO FOSSATI', id: 6439 },
  { name: 'SALA CRAVEDI', id: 6983 },
  { name: 'SALA CA\' GRANDA', id: 7354 },
  { name: 'SALA ANORA', id: 7016 },
];

export default function AdminDashboard({ initialEvents }: AdminDashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MovieItem[]>([]);
  const [events, setEvents] = useState(initialEvents);
  const [seatingPlans, setSeatingPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);

  // Form State for Scheduling
  const [selectedMovie, setSelectedMovie] = useState<MovieItem | null>(null);
  const [formState, setFormState] = useState({
    title: '',
    overview: '',
    posterPath: '',
    date: '',
    roomId: FIXED_ROOMS[0].id.toString(),
    language: '',
    subtitles: 'Italiano'
  });
  const [showModal, setShowModal] = useState(false);
  const [quotasState, setQuotasState] = useState<Record<number, any[]>>({});
  const [availabilityState, setAvailabilityState] = useState<Record<number, any>>({});
  const [loadingQuotas, setLoadingQuotas] = useState<Record<number, boolean>>({});
  const [suggestionsOpen, setSuggestionsOpen] = useState<Record<number, boolean>>({});
  const [applyingSuggestion, setApplyingSuggestion] = useState<Record<number, boolean>>({});
  const [scheduledSuggestion, setScheduledSuggestion] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [conflictEndTime, setConflictEndTime] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [weeklySlots, setWeeklySlots] = useState<{ date: string; label: string; isOccupied?: boolean; conflictWith?: string; isMorning?: boolean; isOptimized?: boolean }[]>([]);
  const [loadingWeeklySlots, setLoadingWeeklySlots] = useState(false);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [slotFilter, setSlotFilter] = useState<'all' | 'morning' | 'afternoon' | 'evening'>('all');
  const [loadingBulk, setLoadingBulk] = useState(false);
  const [expandedMovies, setExpandedMovies] = useState<Set<string>>(new Set());
  const [cleaningBuffer, setCleaningBuffer] = useState(0);
  const [nearestSuggestions, setNearestSuggestions] = useState<{ preSuggestion: string | null; postSuggestion: string | null }>({ preSuggestion: null, postSuggestion: null });
  const [showDisplayModal, setShowDisplayModal] = useState(false);
  const [prerollMin, setPrerollMin] = useState(10);
  const [prerollSec, setPrerollSec] = useState(0);
  const [defaultSalaId, setDefaultSalaId] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('defaultSalaId');
    if (saved) setDefaultSalaId(saved);
  }, []);

  const handleSetDefaultSala = (id: string) => {
    setDefaultSalaId(id);
    localStorage.setItem('defaultSalaId', id);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoadingSearch(true);
    setSearchResults([]); // Reset generic results

    try {
      const isId = /^\d+$/.test(searchQuery.trim());
      
      if (isId) {
        // Direct search by TMDB ID
        const movie = await adminGetMovieById(searchQuery.trim());
        if (movie) {
          // Found by ID! Auto-open the scheduling modal as requested
          selectMovieForScheduling(movie);
        } else {
          alert('ID TMDB non trovato');
        }
      } else {
        // Standard Title Search
        const results = await adminSearchMovies(searchQuery);
        setSearchResults(results);
      }
    } catch (error) {
      console.error(error);
      alert('Errore durante la ricerca');
    } finally {
      setLoadingSearch(false);
    }
  };

  const getDefaultProjectionDate = () => {
    const now = new Date();
    // Start with current time + 1 hour as base
    const baseTime = now.getTime() + 60 * 60 * 1000;
    const d = new Date(baseTime);

    // Round up to next full hour if not already clean (0 minutes, 0 seconds)
    if (d.getMinutes() > 0 || d.getSeconds() > 0) {
      d.setHours(d.getHours() + 1);
    }
    d.setMinutes(0, 0, 0);

    // Format to YYYY-MM-DDTHH:mm for datetime-local input (local time)
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const selectMovieForScheduling = async (movie: MovieItem) => {
    setSelectedMovie(movie);
    const isItalian = movie.original_language === 'it';
    const defaultRoom = defaultSalaId || FIXED_ROOMS[0].id.toString();
    setFormState({
      title: movie.title,
      overview: movie.overview,
      posterPath: movie.poster_path || '',
      date: getDefaultProjectionDate(),
      roomId: defaultRoom,
      language: getLanguageName(movie.original_language),
      subtitles: isItalian ? 'Nessuno' : 'Italiano'
    });
    setConflict(null);
    setConflictEndTime(null);
    setSelectedSlots([]);
    setShowModal(true);

    // Carica slot settimanali e suggerimento smart per il film appena selezionato
    try {
      setLoadingWeeklySlots(true);
      const [sug, weekly] = await Promise.all([
        adminGetSmartSuggestion(movie.id.toString(), parseInt(defaultRoom), cleaningBuffer),
        adminGetWeeklySlots(movie.id.toString(), parseInt(defaultRoom), 14, cleaningBuffer)
      ]);
      setScheduledSuggestion(sug);
      setWeeklySlots(weekly);
    } catch (e) {
      console.error('Failed to get slots for new movie', e);
    } finally {
      setLoadingWeeklySlots(false);
    }
  };

  const handleReplica = async (event: any) => {
    let metadata = { tmdbId: '', overview: '', posterPath: '', language: '', subtitles: '' };
    try {
      if (event.comment) {
        metadata = JSON.parse(event.comment);
      }
    } catch (e) {
      console.error('Failed to parse event metadata', e);
    }

    const movie: MovieItem = {
      id: parseInt(metadata.tmdbId) || 0,
      title: event.name?.it || event.name,
      overview: metadata.overview || '',
      poster_path: metadata.posterPath || '',
      backdrop_path: null,
      release_date: '',
      original_language: metadata.language
    };

    setSelectedMovie(movie);
    const replicaLang = metadata.language || 'Italiano';
    const replicaSubtitles = metadata.subtitles
      ? metadata.subtitles
      : replicaLang === 'Italiano' ? 'Nessuno' : 'Italiano';
    
    setFormState({
      title: movie.title,
      overview: movie.overview,
      posterPath: movie.poster_path || '',
      date: getDefaultProjectionDate(),
      roomId: event.seating_plan?.toString() || FIXED_ROOMS[0].id.toString(),
      language: replicaLang,
      subtitles: replicaSubtitles
    });
    setShowModal(true);
    
    // Smart Suggestion
    try {
      const roomToUse = event.seating_plan?.toString() || defaultSalaId || FIXED_ROOMS[0].id.toString();
      const sug = await adminGetSmartSuggestion(movie.id.toString(), parseInt(roomToUse), cleaningBuffer);
      setScheduledSuggestion(sug);
      
      const weekly = await adminGetWeeklySlots(movie.id.toString(), parseInt(roomToUse), 14, cleaningBuffer);
      setWeeklySlots(weekly);
      setSelectedSlots([]); // Reset selection
    } catch (e) {
      console.error('Failed to get smart suggestion', e);
    }
  };

  useEffect(() => {
    // Re-fetch weekly slots if room or buffer changes while modal is open
    if (showModal && selectedMovie) {
      setLoadingWeeklySlots(true);
      Promise.all([
        adminGetSmartSuggestion(selectedMovie.id.toString(), parseInt(formState.roomId), cleaningBuffer),
        adminGetWeeklySlots(selectedMovie.id.toString(), parseInt(formState.roomId), 14, cleaningBuffer)
      ]).then(([sug, weekly]) => {
        setScheduledSuggestion(sug);
        setWeeklySlots(weekly);
      }).catch(console.error)
        .finally(() => setLoadingWeeklySlots(false));
    }
  }, [formState.roomId, showModal, selectedMovie, cleaningBuffer]);

  useEffect(() => {
    if (!showModal || !selectedMovie || !formState.date) return;
 
    const check = async () => {
      setIsValidating(true);
      try {
        const res = await adminCheckConflict(formState.date, selectedMovie.id.toString(), parseInt(formState.roomId), cleaningBuffer);
        if (res.hasConflict) {
          setConflict(res.movieTitle);
          setConflictEndTime(res.conflictEndTime || null);
          
          // Prendi suggerimenti vicini
          const suggestions = await adminFindNearestSlots(formState.date, selectedMovie.id.toString(), parseInt(formState.roomId), cleaningBuffer);
          setNearestSuggestions(suggestions);
        } else {
          setConflict(null);
          setConflictEndTime(null);
          setNearestSuggestions({ preSuggestion: null, postSuggestion: null });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsValidating(false);
      }
    };
 
    const timer = setTimeout(check, 500);
    return () => clearTimeout(timer);
  }, [formState.date, formState.roomId, showModal, selectedMovie, cleaningBuffer]);

  const applySmartSuggestion = (isoDate?: string) => {
    const target = (typeof isoDate === 'string' ? isoDate : null) || scheduledSuggestion;
    if (target) {
      const d = new Date(target);
      const pad = (n: number) => String(n).padStart(2, '0');
      const formatted = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      setFormState(prev => ({ ...prev, date: formatted }));
      setConflict(null);
      setNearestSuggestions({ preSuggestion: null, postSuggestion: null });
    }
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMovie || !formState.roomId) return;

    setLoading(true);
    try {
      if (selectedSlots.length > 0) {
        setLoadingBulk(true);
        const res = await adminBulkScheduleMovie({
          id: selectedMovie.id.toString(),
          title: formState.title,
          overview: formState.overview,
          posterPath: formState.posterPath,
          language: formState.language,
          subtitles: formState.subtitles
        }, selectedSlots, parseInt(formState.roomId), cleaningBuffer);
        alert(res.summary);
      } else {
        if (!formState.date) return;
        await adminScheduleMovie({
          id: selectedMovie.id.toString(),
          title: formState.title,
          overview: formState.overview,
          posterPath: formState.posterPath,
          language: formState.language,
          subtitles: formState.subtitles
        }, formState.date, parseInt(formState.roomId), !!conflict, cleaningBuffer);
        alert(conflict ? 'Spettacolo programmato con successo (Override)!' : 'Spettacolo programmato con successo!');
      }

      const updatedEvents = await adminListEvents();
      setEvents(updatedEvents);

      // Reset form and close modal
      setSelectedMovie(null);
      setShowModal(false);
      setSearchQuery('');
      setSearchResults([]);
    } catch (error) {
      alert('Errore durante la programmazione: ' + error);
    } finally {
      setLoading(false);
      setLoadingBulk(false);
    }
  };

  const toggleSlotSelection = (date: string) => {
    setSelectedSlots(prev => 
      prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]
    );
  };

  const selectAllMornings = () => {
    const mornings = weeklySlots.filter(s => {
      const hour = new Date(s.date).getHours();
      return !s.isOccupied && hour < 14;
    }).map(s => s.date);
    setSelectedSlots(Array.from(new Set([...selectedSlots, ...mornings])));
  };

  const selectAllAfternoons = () => {
    const afterNoons = weeklySlots.filter(s => {
      const hour = new Date(s.date).getHours();
      return !s.isOccupied && hour >= 14 && hour < 18;
    }).map(s => s.date);
    setSelectedSlots(Array.from(new Set([...selectedSlots, ...afterNoons])));
  };

  const selectAllEvenings = () => {
    const evenings = weeklySlots.filter(s => {
      const hour = new Date(s.date).getHours();
      return !s.isOccupied && hour >= 18;
    }).map(s => s.date);
    setSelectedSlots(Array.from(new Set([...selectedSlots, ...evenings])));
  };

  const handleDelete = async (subeventId: number) => {
    if (!confirm('Sei sicuro di voler cancellare questa proiezione?')) return;
    setLoading(true);
    try {
      await adminDeleteEvent(subeventId);
      const updatedEvents = await adminListEvents();
      setEvents(updatedEvents);
    } catch (error) {
      alert('Errore durante la cancellazione');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (title: string, subeventIds: number[]) => {
    if (!confirm(`Sei sicuro di voler eliminare il film "${title}" e tutte le sue ${subeventIds.length} repliche?\n\nQuesta azione è irreversibile.`)) return;
    
    setLoading(true);
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
      setLoading(false);
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
    setLoading(true);
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
      setLoading(false);
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
      setSuggestionsOpen(prev => ({ ...prev, [eventId]: false }));
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
            {FIXED_ROOMS.map(room => (
              <option key={room.id} value={room.id}>{room.name}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => window.open('/admin/cassa', '_blank', 'width=1200,height=800,noopener,noreferrer')}
          className={styles.btnCassaLauncher}
        >
          <ShoppingBag size={18} />
          APRI CASSA
        </button>
        <button 
          onClick={() => setShowDisplayModal(true)}
          className={styles.btnDisplayLauncher}
        >
          <Monitor size={18} />
          INFO ON SCREEN
        </button>
      </div>

      {/* LEFT COLUMN: SEARCH & SCHEDULE */}
      <div className="flex flex-col gap-8">
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.title}>Cerca Film (TMDB)</h2>
          </div>

          <form onSubmit={handleSearch} className={styles.searchBar}>
            <Search size={20} className="ml-2 text-zinc-500" />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Inserisci titolo o ID TMDB..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="submit" className={styles.btnPrimary + ' ' + styles.btn + ' px-4 py-2'} disabled={loadingSearch}>
              {loadingSearch ? <Loader2 className="animate-spin" size={20} /> : 'Cerca'}
            </button>
          </form>

          {searchResults.length > 0 && (
            <div className={styles.searchResultsGrid}>
              {searchResults.map((movie) => (
                <div key={movie.id} className={styles.movieResultCard} onClick={() => selectMovieForScheduling(movie)}>
                  <div className={styles.movieResultPoster}>
                    {movie.poster_path ? (
                      <Image
                        src={getTMDBImageUrl(movie.poster_path, 'w185')}
                        alt={movie.title}
                        fill
                        sizes="185px"
                        style={{ objectFit: 'cover' }}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full bg-zinc-800 text-[10px] text-zinc-500">No Img</div>
                    )}
                  </div>
                  <p className={styles.movieResultTitle}>{movie.title}</p>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>

      {/* MODAL FOR SCHEDULING */}
      {showModal && selectedMovie && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>
                <Calendar size={22} color="#e50914" />
                Programma Spettacolo
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className={styles.modalClose}
                title="Chiudi"
              >
                <X size={20} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <form id="schedule-form" onSubmit={handleSchedule}>
                <div className={styles.modalGrid}>
                  <div className={styles.modalPosterWrapper}>
                    <div className={styles.modalPoster}>
                      {formState.posterPath ? (
                        <Image
                          src={getTMDBImageUrl(formState.posterPath, 'w342')}
                          alt="Poster"
                          fill
                          sizes="140px"
                          style={{ objectFit: 'cover' }}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-zinc-600 text-xs text-center p-4">
                          Nessuna Locandina
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={styles.modalMain}>
                    <div>
                      <h3 className={styles.modalTitle}>{formState.title}</h3>
                      <p className={styles.modalOverview}>{formState.overview}</p>
                    </div>

                    <div className={styles.modalFormGrid}>
                      <div className={styles.formGroup}>
                        <label className={styles.modalLabel}>Inizio Proiezione</label>
                        <div className={styles.inputWithSuggestion}>
                          <input
                            type="datetime-local"
                            value={formState.date}
                            onChange={(e) => setFormState({ ...formState, date: e.target.value })}
                            required
                            className={`${styles.modalInput} ${conflict ? styles.inputError : ''}`}
                          />
                          {scheduledSuggestion && (
                            <div className={styles.suggestionBadge}>
                              <span>Soluzione:</span>
                              <button type="button" onClick={() => applySmartSuggestion()} className={styles.btnUseSuggestion}>Usa</button>
                            </div>
                          )}
                        </div>
                        {conflict && (
                          <div className={styles.inlineConflict}>
                            <TriangleAlert size={14} />
                            <span>
                              Sala occupata da: <strong>{conflict}</strong>
                              {conflictEndTime && (
                                <> (libera alle <strong>{conflictEndTime}</strong>)</>
                              )}
                            </span>
                          </div>
                        )}
                        {conflict && (nearestSuggestions.preSuggestion || nearestSuggestions.postSuggestion) && (
                          <div className={styles.smartSuggestionsRow}>
                            <span className={styles.suggestionLabel}>Suggerimenti:</span>
                            <div className={styles.suggestionButtons}>
                              {nearestSuggestions.preSuggestion && (
                                <button 
                                  type="button" 
                                  onClick={() => applySmartSuggestion(nearestSuggestions.preSuggestion!)}
                                  className={styles.suggestionBtn}
                                >
                                  {new Date(nearestSuggestions.preSuggestion).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                                </button>
                              )}
                              {nearestSuggestions.postSuggestion && (
                                <button 
                                  type="button" 
                                  onClick={() => applySmartSuggestion(nearestSuggestions.postSuggestion!)}
                                  className={styles.suggestionBtn}
                                >
                                  {new Date(nearestSuggestions.postSuggestion).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                        {scheduledSuggestion && !conflict && (
                          <div className={styles.suggestionNotice}>
                            <Clock size={14} />
                            <span>Slot suggerito: {new Date(scheduledSuggestion).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                            <button type="button" onClick={() => applySmartSuggestion()} className={styles.btnUseSuggestion}>Usa</button>
                          </div>
                        )}
                      </div>

                      <div className={styles.formGroup}>
                        <div className="flex justify-between items-center mb-1">
                          <label className={styles.modalLabel}>Scegli Sala</label>
                          {formState.roomId !== defaultSalaId && (
                            <button 
                              type="button" 
                              onClick={() => handleSetDefaultSala(formState.roomId)}
                              className={styles.btnSaveDefault}
                              title="Imposta come sala predefinita"
                            >
                              Salva come default
                            </button>
                          )}
                        </div>
                        <select
                          value={formState.roomId}
                          onChange={(e) => setFormState({ ...formState, roomId: e.target.value })}
                          required
                          className={styles.modalInput}
                        >
                          {FIXED_ROOMS.map((room) => (
                            <option key={room.id} value={room.id}>
                              {room.id.toString() === defaultSalaId ? `⭐ ${room.name}` : room.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.modalLabel}>Lingua</label>
                        <input
                          type="text"
                          value={formState.language}
                          onChange={(e) => setFormState({ ...formState, language: e.target.value })}
                          placeholder="es. Inglese"
                          required
                          className={styles.modalInput}
                        />
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.modalLabel}>Sottotitoli</label>
                        <input
                          type="text"
                          value={formState.subtitles}
                          onChange={(e) => setFormState({ ...formState, subtitles: e.target.value })}
                          placeholder="es. Italiano"
                          required
                          className={styles.modalInput}
                        />
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.modalLabel}>Intervallo Pulizia (min)</label>
                        <div className={styles.bufferToggle}>
                          {[0, 5, 10].map(val => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setCleaningBuffer(val)}
                              className={`${styles.bufferBtn} ${cleaningBuffer === val ? styles.bufferActive : ''}`}
                            >
                              {val}m
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* WEEKLY SUGGESTIONS GRID */}
                {showModal && selectedMovie && (
                  <div className={styles.weeklySlotsSection}>
                    <div className={styles.weeklyHeader}>
                      <h4 className={styles.weeklyTitle}>Slot Settimanali Suggeriti (14 giorni)</h4>
                      <div className={styles.bulkShortcuts}>
                        <div className={styles.filterGroup}>
                          <button type="button" onClick={() => setSlotFilter('all')} className={`${styles.filterBtn} ${slotFilter === 'all' ? styles.filterActive : ''}`}>Tutti</button>
                          <button type="button" onClick={() => setSlotFilter('morning')} className={`${styles.filterBtn} ${slotFilter === 'morning' ? styles.filterActive : ''}`}>Mattine</button>
                          <button type="button" onClick={() => setSlotFilter('afternoon')} className={`${styles.filterBtn} ${slotFilter === 'afternoon' ? styles.filterActive : ''}`}>Pomeriggio</button>
                          <button type="button" onClick={() => setSlotFilter('evening')} className={`${styles.filterBtn} ${slotFilter === 'evening' ? styles.filterActive : ''}`}>Sere</button>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={selectAllMornings} className={styles.shortcutBtn}>Tutte le mattine</button>
                          <button type="button" onClick={selectAllAfternoons} className={styles.shortcutBtn}>I pomeriggi</button>
                          <button type="button" onClick={selectAllEvenings} className={styles.shortcutBtn}>Le sere</button>
                          <button type="button" onClick={() => { setSelectedSlots([]); setSlotFilter('all'); }} className={styles.shortcutBtn}><X size={12} /> Reset</button>
                        </div>
                      </div>
                    </div>
                    
                    <div className={styles.weeklyGrid}>
                      {loadingWeeklySlots ? (
                        <div className={styles.noSlotsFound}>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Calcolo disponibilità in corso...</span>
                        </div>
                      ) : weeklySlots.length === 0 ? (
                        <div className={styles.noSlotsFound}>
                          <Info size={16} />
                          <span>Nessuno slot libero trovato in questa sala per i prossimi 14 giorni.</span>
                        </div>
                      ) : (
                        [...new Set(weeklySlots.map(s => new Date(s.date).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' })))].map(dayLabel => (
                          <div key={dayLabel} className={styles.dayColumn}>
                            <span className={styles.dayLabel}>{dayLabel}</span>
                            <div className={styles.daySlots}>
                              {weeklySlots
                                .filter(s => new Date(s.date).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' }) === dayLabel)
                                .filter(s => {
                                  if (slotFilter === 'all') return true;
                                  const h = new Date(s.date).getHours();
                                  if (slotFilter === 'morning') return h < 14;
                                  if (slotFilter === 'afternoon') return h >= 14 && h < 18;
                                  if (slotFilter === 'evening') return h >= 18;
                                  return true;
                                })
                                .map(slot => (
                                  <button
                                    key={slot.date}
                                    type="button"
                                    onClick={() => !slot.isOccupied && toggleSlotSelection(slot.date)}
                                    className={`${styles.slotBadge} ${selectedSlots.includes(slot.date) ? styles.slotSelected : ''} ${slot.isOccupied ? styles.slotOccupied : ''} ${slot.isMorning ? styles.slotMorning : ''} ${slot.isOptimized ? styles.slotOptimized : ''}`}
                                    title="Slot disponibile – clicca per selezionare"
                                  >
                                    {slot.label}
                                  </button>
                                ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                <div className={styles.modalInfo}>
                  <Info className="text-zinc-500 mt-1 flex-shrink-0" size={18} />
                  <p>
                    Confermando la programmazione, verrà creato un nuovo sub-evento su Pretix.
                    Verranno inoltre configurate automaticamente le quote per <strong>Biglietti Intero</strong> e <strong>Poltrona VIP</strong> con prezzo a zero (0.00 EUR).
                  </p>
                </div>
              </form>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.modalBtnCancel}
                onClick={() => setShowModal(false)}
              >
                Annulla
              </button>
                <button
                 type="submit"
                 form="schedule-form"
                 className={`${styles.modalBtnSubmit} ${selectedSlots.length > 0 ? styles.btnBulkMode : ''} ${(selectedSlots.length === 0 && !!conflict) ? styles.btnOverride : ''}`}
                 disabled={loading || (!formState.roomId) || (selectedSlots.length === 0 && (!formState.date))}
                 title={
                   conflict
                     ? `Orario non disponibile: il film finirebbe in conflitto con "${conflict}"${conflictEndTime ? ` (libero alle ${conflictEndTime})` : ''}`
                     : selectedSlots.length > 0
                       ? `Programma ${selectedSlots.length} spettacoli selezionati`
                       : 'Conferma programmazione'
                 }
               >
                 {loading ? (
                   <Loader2 className="animate-spin" size={20} />
                 ) : selectedSlots.length > 0 ? (
                   <><Send size={18} /> Conferma e Programma {selectedSlots.length} Spettacoli</>
                 ) : conflict ? (
                   <><TriangleAlert size={18} /> PROGRAMMA COMUNQUE</>
                 ) : (
                   <><Calendar size={18} /> Conferma e Programma 1 Spettacolo</>
                 )}
               </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FOR EXTERNAL DISPLAY CONFIGURATION */}
      {showDisplayModal && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modalContent} max-w-[450px]`}>
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

              <button 
                onClick={() => {
                  const totalSeconds = (prerollMin * 60) + prerollSec;
                  window.open(`/display-esterno?preroll=${totalSeconds}`, '_blank');
                  setShowDisplayModal(false);
                }}
                className={`${styles.modalBtnSubmit} ${styles.btnLaunchDisplay}`}
              >
                <Monitor size={20} />
                Lancia Display
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RIGHT COLUMN: CURRENT PROGRAMMING */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.title}>Programmazione Attuale (Pretix)</h2>
          <a
            href="https://pretix.eu/vestri/npkez/"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.btnExternalLink}
          >
            <ExternalLink size={14} />
            VAI A PRETIX
          </a>
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
                                  onClick={() => handleReplica(event)}
                                  title="Copia"
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
    </div>
  );
}
