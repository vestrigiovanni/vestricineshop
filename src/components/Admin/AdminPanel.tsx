'use client';

import React, { useState, useEffect } from 'react';
import styles from './AdminPanel.module.css';
import { 
  adminSearchMovies, 
  adminGetMovieById, 
  adminScheduleMovie, 
  adminDeleteEvent, 
  adminDeleteEventGroup, 
  adminUpdateEventDate, 
  adminListEvents, 
  adminGetSeatingPlans, 
  adminGetSmartSuggestion, 
  adminCheckConflict, 
  adminGetWeeklySlots, 
  adminBulkScheduleMovie, 
  adminFindNearestSlots, 
  adminListQuotas, 
  adminUpdateQuota, 
  adminDeleteQuota, 
  adminGetQuotaAvailability, 
  adminGetEmptyProjections,
  adminClearCache
} from '@/actions/adminActions';
import { MovieItem, getTMDBImageUrl, getLanguageName } from '@/services/tmdb';
import Image from 'next/image';
import { Calendar, Trash2, Edit3, Plus, Search, Loader2, X, Info, Send, Eraser, Copy, Clock, Ticket, TriangleAlert, ChevronRight, ChevronDown, Monitor, ShoppingBag, ExternalLink, QrCode, Grid, PlusCircle, MinusCircle, EyeOff, FilePlus, Eye, Star, Archive, RotateCcw, Settings } from 'lucide-react';
import RoomManagementModal from './RoomManagementModal';

import { ITEM_INTERO_ID, ITEM_VIP_ID } from '@/constants/pretix';

interface AdminDashboardProps {
  initialEvents: any[];
}

export default function AdminDashboard({ initialEvents }: AdminDashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MovieItem[]>([]);
  const [events, setEvents] = useState(initialEvents);
  const [seatingPlans, setSeatingPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Form State for Scheduling
  const [selectedMovie, setSelectedMovie] = useState<MovieItem | null>(null);
  const [formState, setFormState] = useState({
    title: '',
    overview: '',
    posterPath: '',
    date: '',
    roomId: '', // Inizialmente vuoto
    language: '',
    subtitles: 'Italiano'
  });

  const initPlans = async () => {
    try {
      const plans = await adminGetSeatingPlans();
      setSeatingPlans(plans);
      
      if (plans.length > 0) {
        setFormState(prev => ({ ...prev, roomId: plans[0].id.toString() }));
      }
    } catch (err) {
      console.error('Error fetching initial data:', err);
    }
  };

  useEffect(() => {
    initPlans();
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await adminClearCache();
      const updatedEvents = await adminListEvents();
      setEvents(updatedEvents);
      await initPlans();
      alert('Sincronizzazione completata! I dati sono stati aggiornati da Pretix.');
    } catch (error) {
      console.error('Sync error:', error);
      alert('Errore durante la sincronizzazione.');
    } finally {
      setIsSyncing(false);
    }
  };


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
  const [defaultSalaId, setDefaultSalaId] = useState<string | null>(null);
  const [selectedMovieRuntime, setSelectedMovieRuntime] = useState<number | null>(null);
  const [prerollMin, setPrerollMin] = useState<number>(0);
  const [prerollSec, setPrerollSec] = useState<number>(0);
  const [showCleaningModal, setShowCleaningModal] = useState(false);
  const [emptyProjections, setEmptyProjections] = useState<any[]>([]);
  const [loadingCleaning, setLoadingCleaning] = useState(false);
  const [showRoomModal, setShowRoomModal] = useState(false);
  
  const availableSeatingPlans = seatingPlans;
  const isColliding = (date1: string, date2: string) => {
    const runtime = selectedMovieRuntime || 120;
    const buffer = 10; // Parametro fisso richiesto dall'utente
    const s1 = new Date(date1).getTime();
    const e1 = s1 + (runtime + buffer) * 60000;
    const s2 = new Date(date2).getTime();
    const e2 = s2 + (runtime + buffer) * 60000;
    return s1 < e2 && e1 > s2;
  };

  const hasCollisionWithSelected = (candidateDate: string, currentSelected: string[]) => {
    return currentSelected.some(selectedDate => isColliding(candidateDate, selectedDate));
  };

  const internalCollisions = React.useMemo(() => {
    if (selectedSlots.length < 2) return [];
    const results: { a: string; b: string }[] = [];
    for (let i = 0; i < selectedSlots.length; i++) {
      for (let j = i + 1; j < selectedSlots.length; j++) {
        if (isColliding(selectedSlots[i], selectedSlots[j])) {
          results.push({ a: selectedSlots[i], b: selectedSlots[j] });
        }
      }
    }
    return results;
  }, [selectedSlots, selectedMovieRuntime]);


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
    
    // Get the first available room
    const defaultRoom = defaultSalaId || (availableSeatingPlans.length > 0 ? availableSeatingPlans[0].id.toString() : '');

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
      const details = await adminGetMovieById(movie.id.toString());
      if (details?.runtime) setSelectedMovieRuntime(details.runtime);

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
      roomId: event.seating_plan?.toString() || (availableSeatingPlans.length > 0 ? availableSeatingPlans[0].id.toString() : ''),
      language: replicaLang,
      subtitles: replicaSubtitles
    });
    setShowModal(true);

    // Smart Suggestion
    try {
      setLoadingWeeklySlots(true);
      const details = await adminGetMovieById(movie.id.toString());
      if (details?.runtime) setSelectedMovieRuntime(details.runtime);

      const roomToUse = event.seating_plan?.toString() || defaultSalaId || (availableSeatingPlans.length > 0 ? availableSeatingPlans[0].id.toString() : '');
      const sug = await adminGetSmartSuggestion(movie.id.toString(), parseInt(roomToUse), cleaningBuffer);
      setScheduledSuggestion(sug);

      const weekly = await adminGetWeeklySlots(movie.id.toString(), parseInt(roomToUse), 14, cleaningBuffer);
      setWeeklySlots(weekly);
      setSelectedSlots([]); // Reset selection
    } catch (e) {
      console.error('Failed to get smart suggestion', e);
    } finally {
      setLoadingWeeklySlots(false);
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
        // Always update the detected runtime displayed in the modal header
        if (res.runtime && res.runtime > 0) setSelectedMovieRuntime(res.runtime);
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

    // ── CLIENT-SIDE TRACCIAMENTO ──────────────────────────────────────────────
    const [rawDate, rawTime] = formState.date.split('T');
    console.log('[handleSchedule] ▶ Invio programmazione (TECNICA STRINGA CRUDA)', {
      movie: formState.title,
      rawDate,
      rawTime,
      roomId: formState.roomId,
      conflict,
      override: !!conflict,
      selectedSlots: selectedSlots.length
    });

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
        const errorDetails = res.details && res.details.length > 0 
          ? `\n\nDettagli errori:\n${res.details.join('\n')}` 
          : '';
        alert(`${res.summary}${errorDetails}`);
      } else {
        if (!formState.date) {
          console.warn('[handleSchedule] ⚠️ Nessuna data selezionata, skip.');
          return;
        }
        const result = await adminScheduleMovie({
          id: selectedMovie.id.toString(),
          title: formState.title,
          overview: formState.overview,
          posterPath: formState.posterPath,
          language: formState.language,
          subtitles: formState.subtitles
        }, rawDate, rawTime, parseInt(formState.roomId), !!conflict, cleaningBuffer);
        console.log('[handleSchedule] ✅ Risposta server:', result);
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
      console.error('[handleSchedule] ❌ Errore:', error);
      alert('Errore durante la programmazione: ' + error);
    } finally {
      setLoading(false);
      setLoadingBulk(false);
    }
  };

  const toggleSlotSelection = (date: string) => {
    setSelectedSlots(prev => {
      // Se lo slot è già selezionato, lo rimuoviamo (Reset)
      if (prev.includes(date)) return prev.filter(d => d !== date);

      // Se lo slot collide con uno già selezionato, impediamo la selezione
      if (hasCollisionWithSelected(date, prev)) {
        console.warn('[Collision] Impossibile selezionare slot: collisione rilevata.');
        return prev;
      }

      return [...prev, date];
    });
  };

  const selectAllMornings = () => {
    const mornings = weeklySlots.filter(s => {
      const hour = new Date(s.date).getHours();
      return !s.isOccupied && hour < 14;
    });

    setSelectedSlots(prev => {
      let newSelection = [...prev];
      mornings.forEach(slot => {
        if (!hasCollisionWithSelected(slot.date, newSelection)) {
          newSelection.push(slot.date);
        }
      });
      return newSelection;
    });
  };

  const selectAllAfternoons = () => {
    const afternoons = weeklySlots.filter(s => {
      const hour = new Date(s.date).getHours();
      return !s.isOccupied && hour >= 14 && hour < 18;
    });

    setSelectedSlots(prev => {
      let newSelection = [...prev];
      afternoons.forEach(slot => {
        if (!hasCollisionWithSelected(slot.date, newSelection)) {
          newSelection.push(slot.date);
        }
      });
      return newSelection;
    });
  };

  const selectAllEvenings = () => {
    const evenings = weeklySlots.filter(s => {
      const hour = new Date(s.date).getHours();
      return !s.isOccupied && hour >= 18;
    });

    setSelectedSlots(prev => {
      let newSelection = [...prev];
      evenings.forEach(slot => {
        if (!hasCollisionWithSelected(slot.date, newSelection)) {
          newSelection.push(slot.date);
        }
      });
      return newSelection;
    });
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
    setLoading(true); // Usiamo il loading globale in modo sicuro
    try {
      await adminDeleteEvent(subeventId);
      setEmptyProjections(prev => prev.filter(p => p.id !== subeventId));
      const updatedEvents = await adminListEvents();
      setEvents(updatedEvents);
    } catch (error: any) {
      alert('Errore durante la cancellazione: ' + error.message);
    } finally {
      setLoading(false);
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

        <button
          onClick={() => setShowRoomModal(true)}
          className={styles.btnCassaLauncher}
          style={{ backgroundColor: '#222', color: 'white', border: '1px solid #444', marginRight: '1rem' }}
        >
          <Settings size={18} />
          <span>GESTISCI SALE</span>
        </button>

        <a
          href="/admin/cassa"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.btnCassaLauncher}
        >
          <ShoppingBag size={18} />
          APRI CASSA
        </a>

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
                        src={getTMDBImageUrl(movie.poster_path, 'w185')!}
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







      {/* RIGHT COLUMN: CURRENT PROGRAMMING */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.title}>Programmazione Attuale (Pretix)</h2>
          <div className="flex flex-col gap-2 items-end">
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





      {/* MODAL SECTION: Moved outside grid flow to prevent layout breakage and ensure visibility */}
      
      {/* 1. SCHEDULING MODAL */}
      {showModal && selectedMovie && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>
                <Calendar size={22} color="#e50914" />
                Programma Spettacolo
                {selectedMovieRuntime && (
                  <span className="ml-4 text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-1 rounded-full">
                    Durata rilevata per calcolo: {selectedMovieRuntime} min
                  </span>
                )}
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
                          src={getTMDBImageUrl(formState.posterPath, 'w342')!}
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
                          {availableSeatingPlans
                            .map((room) => (
                              <option key={room.id} value={room.id}>
                                [{room.id}] {room.id.toString() === defaultSalaId ? `⭐ ${room.internalName || room.name}` : (room.internalName || room.name)}
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
                        [...new Set(weeklySlots.map(s => new Date(s.date).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' })))].map(dayLabel => {
                          const slotsForDay = weeklySlots
                            .filter(s => new Date(s.date).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' }) === dayLabel)
                            .filter(s => {
                              if (slotFilter === 'all') return true;
                              const h = new Date(s.date).getHours();
                              if (slotFilter === 'morning') return h < 14;
                              if (slotFilter === 'afternoon') return h >= 14 && h < 18;
                              if (slotFilter === 'evening') return h >= 18;
                              return true;
                            });

                          return (
                            <div key={dayLabel} className={styles.dayColumn}>
                              <span className={styles.dayLabel}>{dayLabel}</span>
                              <div className={styles.daySlots}>
                                {slotsForDay.length === 0 ? (
                                  <div className="text-[10px] text-zinc-400 italic py-2 text-center bg-zinc-100/50 rounded border border-dashed border-zinc-200">
                                    Sala occupata: nessun buco disponibile
                                  </div>
                                ) : (
                                  slotsForDay.map(slot => {
                                    const isSelected = selectedSlots.includes(slot.date);
                                    const isCollidingAsCandidate = !isSelected && hasCollisionWithSelected(slot.date, selectedSlots);
                                    const isDisabled = slot.isOccupied || isCollidingAsCandidate;

                                    return (
                                      <button
                                        key={slot.date}
                                        type="button"
                                        onClick={() => !isDisabled && toggleSlotSelection(slot.date)}
                                        className={`${styles.slotBadge} ${isSelected ? styles.slotSelected : ''} ${isDisabled ? styles.slotOccupied : ''} ${slot.isMorning ? styles.slotMorning : ''} ${slot.isOptimized ? styles.slotOptimized : ''}`}
                                        title={
                                          slot.isOccupied
                                            ? 'Slot già occupato da un altro film'
                                            : isCollidingAsCandidate
                                              ? 'Collisione: troppo vicino a uno slot già selezionato'
                                              : 'Slot disponibile – clicca per selezionare'
                                        }
                                        disabled={isDisabled}
                                      >
                                        {slot.label}
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          );
                        })

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
                className={`${styles.modalBtnSubmit} ${selectedSlots.length > 0 ? styles.btnBulkMode : ''} ${(selectedSlots.length === 0 && !!conflict) ? styles.btnOverride : ''} ${internalCollisions.length > 0 ? styles.btnDisabled : ''}`}
                disabled={loading || (!formState.roomId) || (selectedSlots.length === 0 && (!formState.date)) || internalCollisions.length > 0}
                title={
                  internalCollisions.length > 0
                    ? `Conflitto rilevato: lo spettacolo delle ${new Date(internalCollisions[0].a).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} finisce alle ${new Date(new Date(internalCollisions[0].a).getTime() + ((selectedMovieRuntime || 120) + 10) * 60000).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} (inclusa pulizia). Rimuovi le sovrapposizioni per procedere.`
                    : conflict
                      ? `Orario non disponibile: il film finirebbe in conflitto con "${conflict}"${conflictEndTime ? ` (libero alle ${conflictEndTime})` : ''}`
                      : selectedSlots.length > 0
                        ? `Programma ${selectedSlots.length} spettacoli selezionati`
                        : 'Conferma programmazione'
                }
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : internalCollisions.length > 0 ? (
                  <><TriangleAlert size={18} /> CONFLITTO RILEVATO</>
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


    </div>
  );
}
