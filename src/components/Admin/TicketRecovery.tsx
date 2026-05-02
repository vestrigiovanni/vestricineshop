'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Printer, Download, Eye, Loader2, X, Search, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { getTicketsByDateAction, startBatchPrintingAction } from '@/actions/ticketRecoveryActions';
import styles from './TicketRecovery.module.css';

interface TicketPosition {
  id: number;
  show_time: string;
  item_name: string;
  order_code: string;
  customer_name: string;
  customer_email: string;
  seat_name: string;
  downloads: {
    output: string;
    url: string;
  }[];
}

export default function TicketRecoveryButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [tickets, setTickets] = useState<TicketPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date('2026-05-02'));
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Abort controller ref for surgical fetching
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchTickets = useCallback(async (date: Date) => {
    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setTickets([]); // Clear previous results immediately for UI feedback
    
    try {
      const dateStr = date.toISOString().split('T')[0];
      const data = await getTicketsByDateAction(dateStr);
      setTickets(data);
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error(error);
      alert('Errore nel recupero dei biglietti.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpen = () => {
    setIsOpen(true);
  };

  useEffect(() => {
    if (isOpen) {
      fetchTickets(selectedDate);
    }
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [selectedDate, isOpen, fetchTickets]);

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
  };

  const formatDateLabel = (date: Date) => {
    return date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const handlePrint = (url: string) => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      if (iframe.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      }
    };
  };

  const handleBatchPrint = async () => {
    if (tickets.length === 0) return;
    setBatchLoading(true);
    try {
      const ids = tickets.map(t => t.id.toString());
      const downloadUrl = await startBatchPrintingAction(ids);
      if (downloadUrl) {
        handlePrint(downloadUrl);
      }
    } catch (error) {
      console.error(error);
      alert('Errore durante la stampa batch.');
    } finally {
      setBatchLoading(false);
    }
  };

  const filteredTickets = tickets.filter(t => 
    t.order_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.customer_email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <button className="pretix-button" onClick={handleOpen}>
        <CalendarIcon size={18} />
        Recupero Biglietti
      </button>

      {isOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <div className={styles.headerLeft}>
                <h2>Recupero Biglietti</h2>
              </div>
              
              <div className={styles.dateNavigation}>
                <button onClick={() => changeDate(-1)} className={styles.navBtn} disabled={loading}>
                  <ChevronLeft size={24} />
                </button>
                <div className={styles.currentDate}>
                  <CalendarIcon size={18} />
                  <span suppressHydrationWarning>{mounted ? formatDateLabel(selectedDate) : ''}</span>
                </div>
                <button onClick={() => changeDate(1)} className={styles.navBtn} disabled={loading}>
                  <ChevronRight size={24} />
                </button>
              </div>

              <button onClick={() => setIsOpen(false)} className={styles.closeBtn}>
                <X size={24} />
              </button>
            </div>

            <div className={styles.modalActions}>
              <div className={styles.searchWrapper}>
                <Search size={18} className={styles.searchIcon} />
                <input 
                  type="text" 
                  placeholder="Cerca ordine, film, nome o email..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={styles.searchInput}
                />
              </div>
              <button 
                onClick={handleBatchPrint} 
                disabled={batchLoading || tickets.length === 0 || loading}
                className={styles.batchBtn}
              >
                {batchLoading ? <Loader2 className={styles.spin} size={18} /> : <Printer size={18} />}
                Stampa Tutti ({tickets.length})
              </button>
            </div>

            <div className={styles.tableWrapper}>
              {loading ? (
                <div className={styles.loaderCenter}>
                  <Loader2 className={styles.spin} size={48} />
                  <p suppressHydrationWarning>Interrogazione Pretix in corso per il {mounted ? formatDateLabel(selectedDate) : ''}...</p>
                </div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Orario</th>
                      <th>Film</th>
                      <th>Posto</th>
                      <th>Cliente</th>
                      <th>Ordine</th>
                      <th style={{ textAlign: 'right' }}>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTickets.length > 0 ? (
                      filteredTickets.map((ticket) => (
                        <tr key={ticket.id}>
                          <td className={styles.timeCell}>{ticket.show_time}</td>
                          <td className={styles.movieCell}>{ticket.item_name}</td>
                          <td>{ticket.seat_name ? <span className={styles.seatBadge}>{ticket.seat_name}</span> : '-'}</td>
                          <td>
                            <div className={styles.customerInfo}>
                              <span className={styles.customerName}>{ticket.customer_name}</span>
                              <span className={styles.customerEmail}>{ticket.customer_email}</span>
                            </div>
                          </td>
                          <td><code className={styles.code}>{ticket.order_code}</code></td>
                          <td style={{ textAlign: 'right' }}>
                            <div className={styles.rowActions}>
                              <button 
                                onClick={() => window.open(ticket.downloads.find(d => d.output === 'pdf')?.url, '_blank')}
                                title="Anteprima"
                              >
                                <Eye size={18} />
                              </button>
                              <a 
                                href={ticket.downloads.find(d => d.output === 'pdf')?.url} 
                                download 
                                title="Scarica"
                              >
                                <Download size={18} />
                              </a>
                              <button 
                                onClick={() => handlePrint(ticket.downloads.find(d => d.output === 'pdf')?.url || '')}
                                title="Stampa"
                              >
                                <Printer size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className={styles.empty}>Nessun biglietto trovato per questa data.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
