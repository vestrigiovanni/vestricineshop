'use client';

import { useState, useMemo, useEffect } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Film, Ticket } from 'lucide-react';
import styles from './WeeklyCinemaCalendar.module.css';
import BookingDrawer from '../BookingDrawer/BookingDrawer';
import RatingBadge from '../RatingBadge';
import LanguageBadge from '../LanguageBadge';
import { getTMDBImageUrl } from '@/services/tmdb.utils';

import { useAutoScroll } from '@/context/AutoScrollContext';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(res => res.json());

interface SubEvent {
  id: number;
  name: { it: string } | string;
  date_from: string;
  date_to?: string;
  seating_plan?: number;
  roomName?: string;
  meta_data?: Record<string, string>;
  comment?: string;
  isSoldOut?: boolean;
  calculatedRating?: string;
  tmdbId?: string | null;
  posterPath?: string | null;
}

interface WeeklyCinemaCalendarProps {
  subEvents: SubEvent[];
}

// Helper function to get local YYYY-MM-DD string
const toLocalDateStr = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function WeeklyCinemaCalendar({ subEvents: initialSubEvents }: WeeklyCinemaCalendarProps) {
  const { data: availabilityData } = useSWR('/api/availability', fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true
  });

  const subEvents = useMemo(() => {
    if (!availabilityData) return initialSubEvents;
    return initialSubEvents.map(se => {
      const liveIsSoldOut = availabilityData[se.id] === true || availabilityData[se.id.toString()] === true;
      return {
        ...se,
        isSoldOut: se.isSoldOut || liveIsSoldOut
      };
    });
  }, [initialSubEvents, availabilityData]);

  // Navigation state: start of the currently viewed week (Monday)
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  // Giorno selezionato: unico pannello visibile, su ogni viewport.
  const [selectedDayStr, setSelectedDayStr] = useState<string>(() => {
    const now = new Date();
    return toLocalDateStr(now);
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSubevent, setSelectedSubevent] = useState<{ id: number; title: string } | null>(null);

  const { disableAutoScroll } = useAutoScroll();

  // Generate 7 days of the week
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(currentWeekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [currentWeekStart]);

  // Ensure selectedDayStr is within the current week when week changes
  useEffect(() => {
    const weekDayStrings = weekDays.map(d => toLocalDateStr(d));
    if (!weekDayStrings.includes(selectedDayStr)) {
      setSelectedDayStr(weekDayStrings[0]);
    }
  }, [weekDays, selectedDayStr]);

  const handlePrevWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() - 7);
    setCurrentWeekStart(d);
  };

  const handleNextWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + 7);
    setCurrentWeekStart(d);
  };

  const openBooking = (id: number, title: string) => {
    setSelectedSubevent({ id, title });
    setDrawerOpen(true);
    disableAutoScroll();
  };

  // Group screenings by date string (YYYY-MM-DD) for easy access
  const screeningsByDay = useMemo(() => {
    const groups: Record<string, SubEvent[]> = {};
    const now = new Date();
    const CUTOFF_MINUTES = 2;

    subEvents.forEach(se => {
      const startTime = new Date(se.date_from);
      // Filter out screenings starting in < 2 minutes (or already started)
      if (startTime.getTime() - now.getTime() < CUTOFF_MINUTES * 60 * 1000) {
        return;
      }

      const dateStr = toLocalDateStr(startTime);
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(se);
    });
    // Sort each day's screenings by time
    Object.values(groups).forEach(dayList => {
      dayList.sort((a, b) => new Date(a.date_from).getTime() - new Date(b.date_from).getTime());
    });
    return groups;
  }, [subEvents]);

  const formatDateRange = () => {
    const start = weekDays[0];
    const end = weekDays[6];
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
    return `${start.toLocaleDateString('it-IT', options)} - ${end.toLocaleDateString('it-IT', options)} ${end.getFullYear()}`;
  };

  const selectedScreenings = screeningsByDay[selectedDayStr] || [];
  const selectedDay = weekDays.find(d => toLocalDateStr(d) === selectedDayStr);

  return (
    <section className={styles.calendarContainer}>
      <div className={styles.calendarWrapper}>
        <header className={styles.header}>
          <span className={styles.kicker}>La settimana in sala</span>
          <h2 className={styles.title}>Programmazione</h2>
          <div className={styles.weekNav}>
            <button
              className={styles.navButton}
              onClick={handlePrevWeek}
              aria-label="Settimana precedente"
            >
              <ChevronLeft size={18} />
            </button>
            <span className={styles.dateRange}>{formatDateRange()}</span>
            <button
              className={styles.navButton}
              onClick={handleNextWeek}
              aria-label="Settimana successiva"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </header>

        <div className={styles.dayTabs} role="tablist" aria-label="Giorni della settimana">
          {weekDays.map(day => {
            const dateStr = toLocalDateStr(day);
            const isSelected = selectedDayStr === dateStr;
            const isToday = new Date().toDateString() === day.toDateString();
            const hasShows = (screeningsByDay[dateStr] || []).length > 0;

            return (
              <button
                key={dateStr}
                role="tab"
                aria-selected={isSelected}
                className={`${styles.dayTab} ${isSelected ? styles.dayTabActive : ''} ${isToday ? styles.dayTabToday : ''}`}
                onClick={() => setSelectedDayStr(dateStr)}
              >
                <span className={styles.dayTabName}>
                  {day.toLocaleDateString('it-IT', { weekday: 'short' })}
                </span>
                <span className={styles.dayTabNumber}>{day.getDate()}</span>
                <span className={`${styles.dayTabDot} ${hasShows ? styles.dayTabDotOn : ''}`} aria-hidden="true" />
              </button>
            );
          })}
        </div>

        <div className={styles.dayPanel}>
          <h3 className={styles.dayPanelTitle}>
            {selectedDay?.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
          {selectedScreenings.length > 0 ? (
            <div className={styles.screeningList}>
              {selectedScreenings.map(se => {
                const time = new Date(se.date_from).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
                const title = typeof se.name === 'string' ? se.name : se.name.it;
                const room = se.roomName || 'Sala';
                const isSoldOut = se.isSoldOut;

                return (
                  <button
                    key={se.id}
                    className={`${styles.screeningRow} ${isSoldOut ? styles.screeningSoldOut : ''}`}
                    onClick={() => !isSoldOut && openBooking(se.id, title)}
                    disabled={isSoldOut}
                  >
                    <span className={styles.screeningTime}>{time}</span>
                    <span className={styles.screeningPoster}>
                      {se.posterPath ? (
                        <Image
                          src={getTMDBImageUrl(se.posterPath, 'w185')!}
                          alt=""
                          fill
                          sizes="56px"
                          style={{ objectFit: 'cover' }}
                        />
                      ) : (
                        <Film size={18} aria-hidden="true" />
                      )}
                    </span>
                    <span className={styles.screeningInfo}>
                      <span className={styles.screeningTitle}>{title}</span>
                      <span className={styles.screeningSub}>
                        <span className={styles.screeningRoom}>{room}</span>
                        <RatingBadge rating={se.meta_data?.rating || 'T'} size="xs" />
                        <LanguageBadge
                          language={se.meta_data?.lingua}
                          subtitles={se.meta_data?.sottotitoli}
                          version={se.meta_data?.format}
                          size="xs"
                          showLabel={false}
                        />
                      </span>
                    </span>
                    {isSoldOut ? (
                      <span className={styles.esauritoBadge}>Esaurito</span>
                    ) : (
                      <span className={styles.buyHint}>
                        <Ticket size={15} />
                        Prenota
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyState}>Nessuno spettacolo in programma</div>
          )}
        </div>
      </div>

      <BookingDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        subeventId={selectedSubevent?.id || null}
        movieTitle={selectedSubevent?.title}
      />
    </section>
  );
}

