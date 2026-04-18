'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Ticket } from 'lucide-react';
import styles from './WeeklyCinemaCalendar.module.css';
import BookingDrawer from '../BookingDrawer/BookingDrawer';
import { getMovieTags, TagInfo } from '@/utils/languageUtils';
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
    return initialSubEvents.map(se => ({
      ...se,
      isSoldOut: availabilityData[se.id] ?? se.isSoldOut
    }));
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

  return (
    <section className={styles.calendarContainer}>
      <div className={styles.calendarWrapper}>
        <div className={styles.header}>
          <div className={styles.titleSection}>
            <h2 className={styles.title}>Programmazione Settimanale</h2>
            <span className={styles.dateRange}>{formatDateRange()}</span>
          </div>
          
          <div className={styles.navigation}>
            <button 
              className={styles.navButton} 
              onClick={handlePrevWeek}
              aria-label="Settimana precedente"
            >
              <ChevronLeft size={20} />
            </button>
            <button 
              className={styles.navButton} 
              onClick={handleNextWeek}
              aria-label="Settimana successiva"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <div className={styles.calendarGrid}>
          {weekDays.map((day) => {
            const dateStr = toLocalDateStr(day);
            const dayScreenings = screeningsByDay[dateStr] || [];
            const isToday = new Date().toDateString() === day.toDateString();
            
            return (
              <div key={dateStr} className={`${styles.dayColumn} ${isToday ? styles.today : ''}`}>
                <div className={styles.dayHeader}>
                  <span className={styles.dayName}>
                    {day.toLocaleDateString('it-IT', { weekday: 'long' })}
                  </span>
                  <span className={styles.dayNumber}>{day.getDate()}</span>
                </div>
                
                <div className={styles.slotsContainer}>
                  {dayScreenings.length > 0 ? (
                    dayScreenings.map((se) => {
                      const time = new Date(se.date_from).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
                      const title = typeof se.name === 'string' ? se.name : se.name.it;
                      const room = se.roomName || 'SALA';
                      
                      const tags = getMovieTags(se.meta_data?.lingua || '', se.meta_data?.sottotitoli || '', se.meta_data?.format || (title.toUpperCase().includes('3D') ? '3D' : ''));

                      const isSoldOut = se.isSoldOut;

                      return (
                        <button 
                          key={se.id} 
                          className={`${styles.movieSlot} ${isSoldOut ? styles.soldOutSlot : ''}`}
                          onClick={() => !isSoldOut ? openBooking(se.id, title) : null}
                          disabled={isSoldOut}
                        >
                          <div className={styles.slotHeader}>
                            <span className={`${styles.slotTime} ${isSoldOut ? styles.strikethroughTime : ''}`}>
                              {time}
                            </span>
                            <div className={styles.tagWrapper}>
                              {tags.map((tag: TagInfo, idx: number) => (
                                <span key={idx} className={`${styles.tag} ${styles[`tag${tag.type.charAt(0).toUpperCase() + tag.type.slice(1)}` as keyof typeof styles]} ${tag.code === 'ITA' ? styles.tagIta : ''}`}>
                                  {tag.code}
                                </span>
                              ))}
                            </div>
                          </div>
                          <span className={styles.slotTitle}>{title}</span>
                          <span className={styles.slotRoom}>{room}</span>

                          
                          {isSoldOut ? (
                            <>
                              <span className={styles.esauritoBadge}>Esaurito</span>
                              <div className={styles.tooltip}>
                                Siamo spiacenti, i posti per questa proiezione sono esauriti.<br/>Scegli un altro orario.
                              </div>
                            </>
                          ) : (
                            <span className={styles.buyHint}>
                              <Ticket size={16} />
                            </span>
                          )}
                        </button>
                      );
                    })
                  ) : (
                    <div className={styles.emptyState}>NESSUNO SPETTACOLO</div>
                  )}
                </div>
              </div>
            );
          })}
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

