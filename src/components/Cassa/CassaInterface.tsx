'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  Clock,
  History,
  X,
  ArrowLeft,
  Printer,
  Download,
  CheckCircle,
  RotateCcw,
  Loader2,
  Search,
  RefreshCw,
  Ticket,
} from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

import styles from './CassaInterface.module.css';
import ThermalTicket, { parseSeatName, ThermalTicketData } from './ThermalTicket';
import TicketPDF from '../TicketPDF';
import RatingBadge from '../RatingBadge';
import { isVM18, isVM14 } from '@/utils/ratingUtils';
import {
  cassaGetSeats,
  cassaExecuteSale,
  cassaGetRecentSales,
  cassaCleanupOldPDFs,
  cassaGetScreenings,
  CassaScreening,
  CassaTicketRecord,
  CassaSeat,
  CassaOrderResult,
  cassaFindAlternatives,
} from '@/actions/cassaActions';

interface CassaInterfaceProps {
  screenings: CassaScreening[];
  initialRecentSales: CassaTicketRecord[];
}

type Step = 'film' | 'seat' | 'confirm' | 'success';

function formatScreeningLabel(dateFrom: string): string {
  const d = new Date(dateFrom);
  return d.toLocaleString('it-IT', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatTime(dateFrom: string): string {
  return new Date(dateFrom).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateFrom: string): string {
  return new Date(dateFrom).toLocaleDateString('it-IT', { 
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' 
  });
}

function formatSaleTime(isoDate: string): string {
  return new Date(isoDate).toLocaleString('it-IT', { 
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
  });
}

export default function CassaInterface({ screenings, initialRecentSales }: CassaInterfaceProps) {
  const [step, setStep] = useState<Step>('film');
  const [selectedScreening, setSelectedScreening] = useState<CassaScreening | null>(null);
  const [seats, setSeats] = useState<CassaSeat[]>([]);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [selectedSeats, setSelectedSeats] = useState<CassaSeat[]>([]);
  const [prezzoFisico, setPrezzoFisico] = useState('0.00');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CassaOrderResult | null>(null);
  const [recentSales, setRecentSales] = useState<CassaTicketRecord[]>(initialRecentSales);
  const [showHistory, setShowHistory] = useState(false);
  const [reprintRecord, setReprintRecord] = useState<CassaTicketRecord | null>(null);
  const [clock, setClock] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [showTestTicket, setShowTestTicket] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const [viewDate, setViewDate] = useState(() => {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - (offset * 60 * 1000));
    return local.toISOString().split('T')[0];
  });
  const [displayScreenings, setDisplayScreenings] = useState<CassaScreening[]>(screenings);
  const [fetchingScreenings, setFetchingScreenings] = useState(false);
  const [isDefaultView, setIsDefaultView] = useState(true);

  // Alternatives search
  const [altScreenings, setAltScreenings] = useState<CassaScreening[]>([]);
  const [isSearchingAlt, setIsSearchingAlt] = useState(false);
  const [searchingMovieTitle, setSearchingMovieTitle] = useState('');
  const [showAltModal, setShowAltModal] = useState(false);

  // Global Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);
  const [globalResults, setGlobalResults] = useState<CassaScreening[]>([]);
  const [activeShortcut, setActiveShortcut] = useState<string | null>(null);
  const [ratingAlert, setRatingAlert] = useState<string | null>(null);

  const normalize = (s: string) => 
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const filteredLocal = displayScreenings.filter(s => 
    normalize(s.movieTitle).includes(normalize(searchQuery))
  );

  useEffect(() => {
    if (searchQuery.length < 2) {
      setGlobalResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingGlobal(true);
      try {
        const results = await cassaFindAlternatives(searchQuery);
        // Only keep results not already in displayScreenings (local view)
        const uniqueGlobal = results.filter(gr => 
          !displayScreenings.some(ls => ls.subeventId === gr.subeventId)
        );
        setGlobalResults(uniqueGlobal);
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearchingGlobal(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, displayScreenings]);

  const ticketPdfRef = useRef<HTMLDivElement>(null);
  const reprintTicketRef = useRef<HTMLDivElement>(null);
  const reprintTicketPdfRef = useRef<HTMLDivElement>(null);
  const lastProcessedOrderId = useRef<string | null>(null);

  const clearAllOrderData = useCallback(() => {
    setResult(null);
    setSelectedSeats([]);
    // lastProcessedOrderId.current = null; // Don't clear this, it's used for comparison
    console.log('[CASSA] State Reset: current order and seats cleared.');
  }, []);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchDateScreenings = useCallback(async (date: string) => {
    setFetchingScreenings(true);
    try {
      const data = await cassaGetScreenings(date);
      setDisplayScreenings(data);
    } catch (e) {
      console.error(e);
    } finally {
      setFetchingScreenings(false);
    }
  }, []);

  useEffect(() => {
    if (isDefaultView) setDisplayScreenings(screenings);
    else fetchDateScreenings(viewDate);
  }, [viewDate, isDefaultView, screenings, fetchDateScreenings]);

  const handleNextDay = useCallback(() => {
    setIsDefaultView(false);
    const d = new Date(viewDate);
    d.setDate(d.getDate() + 1);
    setViewDate(d.toISOString().split('T')[0]);
  }, [viewDate]);

  const handlePrevDay = useCallback(() => {
    setIsDefaultView(false);
    const d = new Date(viewDate);
    d.setDate(d.getDate() - 1);
    setViewDate(d.toISOString().split('T')[0]);
  }, [viewDate]);

  const handleResetToToday = () => {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - (offset * 60 * 1000));
    const today = local.toISOString().split('T')[0];
    setViewDate(today);
    setIsDefaultView(true);
  };

  const handleSelectScreening = useCallback(async (screening: CassaScreening) => {
    // ── Eccezione VIP ──────────────────────────────────────────────────────────
    // Se la proiezione è sold-out, blocchiamo l'accesso standard MA lasciamo
    // passare l'operatore per poter vendere l'eventuale Poltrona VIP.
    // Lo stato "ESAURITO" rimane invariato per il pubblico.
    // Se isSoldOut la apriremo comunque; la selezione verrà limitata al VIP.
    // ──────────────────────────────────────────────────────────────────────────
    setSelectedScreening(screening);
    setStep('seat');
    setSelectedSeats([]);
    setLoadingSeats(true);
    try {
      const fetchedSeats = await cassaGetSeats(screening.subeventId);
      setSeats(fetchedSeats);
      
      // Controllo Rating Censura (VM18 / VM14)
      if (isVM18(screening.rating)) {
        setRatingAlert('🔞 ATTENZIONE: Film Vietato ai Minori di 18 Anni. CONTROLLARE DOCUMENTO D\'IDENTITÀ.');
      } else if (isVM14(screening.rating)) {
        setRatingAlert('⚠️ ATTENZIONE: Film Vietato ai Minori di 14 Anni.');
      } else {
        setRatingAlert(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSeats(false);
    }
  }, []);

  const handleFindAlternatives = async (screening: CassaScreening) => {
    setIsSearchingAlt(true);
    setSearchingMovieTitle(screening.movieTitle);
    setShowAltModal(true);
    setAltScreenings([]);
    try {
      const results = await cassaFindAlternatives(screening.movieTitle, screening.subeventId);
      setAltScreenings(results);
    } catch (e) {
      console.error(e);
      alert('Impossibile trovare alternative.');
    } finally {
      setIsSearchingAlt(false);
    }
  };

  const handleSelectAlternative = (alt: CassaScreening) => {
    handleSelectScreening(alt);
    setShowAltModal(false);
  };

  const handleSelectSeat = (seat: CassaSeat) => {
    // ── Eccezione VIP ──────────────────────────────────────────────────────────
    // Il posto VIP è selezionabile anche se la proiezione è sold-out.
    // Viene bloccato solo se già occupato/venduto (isBlocked).
    // ──────────────────────────────────────────────────────────────────────────
    if (seat.isBlocked) return;
    // Se la proiezione è sold-out, consentiamo solo la selezione del VIP
    if (selectedScreening?.isSoldOut && !seat.isVip) return;
    setSelectedSeats(prev => {
      const exists = prev.find(s => s.guid === seat.guid);
      if (exists) return prev.filter(s => s.guid !== seat.guid);
      if (prev.length >= 10) { alert('Massimo 10 posti'); return prev; }
      return [...prev, seat];
    });
  };

  const handleConfirmSale = useCallback(async () => {
    if (!selectedScreening || selectedSeats.length === 0) return;
    
    // Safety check: Clear previous result before starting
    if (parseFloat(prezzoFisico) === 0) {
      if (!confirm('Il prezzo è 0.00. Procedere con Scontrino di Cortesia?')) return;
    }
    
    setResult(null);
    setLoading(true);

    try {
      const orderResult = await cassaExecuteSale({
        subeventId: selectedScreening.subeventId,
        seats: selectedSeats.map(s => ({ guid: s.guid, name: s.name, row: s.row, seat: s.seat, isVip: s.isVip })),
        movieTitle: selectedScreening.movieTitle,
        screening: formatScreeningLabel(selectedScreening.dateFrom),
        roomName: selectedScreening.roomName,
        prezzoFisico,
        runtime: selectedScreening.runtime,
        director: selectedScreening.director,
        cast: selectedScreening.cast,
        backdropPath: selectedScreening.backdropPath,
        logoPath: selectedScreening.logoPath,
        tagline: selectedScreening.tagline,
        genres: selectedScreening.genres,
        year: selectedScreening.year,
        rating: selectedScreening.rating,
      });

      // Validation: Check if the new ID is valid and NOT the same as the previous one
      if (!orderResult?.orderCode) {
        throw new Error('Errore di sincronizzazione ordine: ID non ricevuto.');
      }
      
      if (orderResult.orderCode === lastProcessedOrderId.current) {
        throw new Error('Errore di sincronizzazione ordine: Rilevato ID duplicato.');
      }

      lastProcessedOrderId.current = orderResult.orderCode;
      setResult(orderResult);
      setStep('success');
      setRecentSales(await cassaGetRecentSales(30));
      
      // Refresh current screening list to update sold out status/availability
      await fetchDateScreenings(viewDate);
    } catch (e: any) {
      alert('Errore: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedScreening, selectedSeats, prezzoFisico, viewDate, fetchDateScreenings]);

  const buildTicketData = useCallback((
    record?: CassaTicketRecord,
    screening?: CassaScreening | null,
  ): ThermalTicketData | null => {
    if (!record) return null;
    return {
      movieTitle: record.movieTitle,
      screening: record.screening,
      roomName: record.room,
      rowLabel: record.rowLabel,
      seatLabel: record.seatLabel,
      seatName: record.seatName,
      orderCode: record.orderCode,
      qrValue: record.qrValue,
      price: record.price,
      printDate: formatSaleTime(record.date),
      // Campi arricchiti per il layout avanzato (logo, orario fine)
      logoPath: screening?.logoPath,
      duration: screening?.runtime,
      dateFrom: screening?.dateFrom,
      rating: record.rating || screening?.rating,
    };
  }, []);

  // ─── PRINT HANDLERS ────────────────────────────────────────────────────────

  /**
   * handlePrint — Invia i biglietti alla stampante termica via API server-side.
   * Usa lpr direttamente, bypassando completamente il browser print dialog.
   * Fallback a window.print() se l'API non è disponibile.
   */
  // Cattura un elemento DOM come PNG via html2canvas e lo invia all'API di stampa
  const captureAndPrint = useCallback(async (elementId: string, orderCode: string): Promise<boolean> => {
    const element = document.getElementById(elementId);
    if (!element) {
      console.warn(`[PRINT] Elemento non trovato: ${elementId}`);
      return false;
    }
    // Attendi caricamento immagini dentro l'elemento
    const imgs = element.querySelectorAll('img');
    await Promise.all(Array.from(imgs).map(img =>
      img.complete ? Promise.resolve() : new Promise<void>(res => {
        img.onload = () => res();
        img.onerror = () => res();
        setTimeout(res, 5000); // timeout sicurezza
      })
    ));
    // Buffer per il rendering
    await new Promise(res => setTimeout(res, 400));

    const canvas = await html2canvas(element, {
      scale: 1, // 1:1 capture since we set width to 384px (printer pixels)
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      allowTaint: false,
      imageTimeout: 10000,
    });
    const imageData = canvas.toDataURL('image/png');

    const res = await fetch('/api/print/thermal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData, orderCode }),
    });
    const json = await res.json();
    if (!json.ok) console.error('[PRINT] API error:', json.error);
    else console.log('[PRINT] ✅', json.message);
    return json.ok;
  }, []);

  const handlePrint = useCallback(async () => {
    if (!result?.records?.length) return;
    setIsPrinting(true);
    try {
      let allOk = true;
      for (let i = 0; i < result.records.length; i++) {
        const ok = await captureAndPrint(`thermal-capture-${i}`, result.records[i].orderCode);
        if (!ok) allOk = false;
      }
      if (!allOk) {
        console.warn('[PRINT] Alcuni biglietti non stampati — fallback window.print()');
        window.print();
      }
    } catch (err) {
      console.error('[PRINT] Errore:', err);
      window.print();
    } finally {
      setIsPrinting(false);
    }
  }, [result, captureAndPrint]);

  const handlePrintTest = async () => {
    setIsPrinting(true);
    try {
      const ok = await captureAndPrint('thermal-capture-test', 'TEST');
      if (ok) alert('✅ Test di stampa inviato! Controlla la stampante.');
      else alert('❌ Errore durante il test di stampa.');
    } catch (err: any) {
      alert('❌ Errore: ' + err.message);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownloadTicket = useCallback(async () => {
    if (!result || !result.records.length || !selectedScreening) return;
    setGeneratingPdf(true);
    try {
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [148, 105] });

      
      for (let i = 0; i < result.records.length; i++) {
        const element = document.getElementById(`ticket-pdf-current-${i}`);
        if (!element) continue;
        
        // Ensure all images are loaded before capturing
        const images = element.querySelectorAll('img');
        await Promise.all(Array.from(images).map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise(resolve => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        }));
        
        // Small buffer to ensure rendering is complete after image load
        await new Promise(resolve => setTimeout(resolve, 500));

        const canvas = await html2canvas(element, { 
          scale: 4, 
          useCORS: true, 
          backgroundColor: '#000000', 
          logging: false,
          allowTaint: false,
          imageTimeout: 15000
        });
        
        const imgData = canvas.toDataURL('image/jpeg', 1.0);
        if (i > 0) pdf.addPage([148, 105], 'landscape');
        pdf.addImage(imgData, 'JPEG', 0, 0, 148, 105);
      }
      pdf.save(`biglietto_vestricinema_${result.orderCode}.pdf`);
    } catch (e) {
      console.error(e);
      alert('Errore PDF.');
    } finally {
      setGeneratingPdf(false);
    }
  }, [result, selectedScreening]);

  const handleReprint = (record: CassaTicketRecord) => setReprintRecord(record);
  const handleReprintClose = () => setReprintRecord(null);

  const handleNewSale = useCallback(() => {
    clearAllOrderData();
    setStep('film'); 
    setSelectedScreening(null); 
    setPrezzoFisico('0.00'); 
    setSeats([]);
  }, [clearAllOrderData]);

  const autoSelectSeats = useCallback((count: number) => {
    // Sort logic: rows first (ascending), then seat number (ascending)
    const available = [...seats]
      .filter(s => !s.isBlocked && !s.isVip)
      .sort((a, b) => {
        const rowA = parseInt(a.row.replace(/\D/g, '')) || 0;
        const rowB = parseInt(b.row.replace(/\D/g, '')) || 0;
        if (rowA !== rowB) return rowA - rowB;
        const seatA = parseInt(a.seat.replace(/\D/g, '')) || 0;
        const seatB = parseInt(b.seat.replace(/\D/g, '')) || 0;
        return seatA - seatB;
      });

    const toSelect = available.slice(0, count);
    setSelectedSeats(toSelect);
  }, [seats]);

  const triggerShortcutEffect = useCallback((id: string) => {
    setActiveShortcut(id);
    setTimeout(() => setActiveShortcut(null), 150);
  }, []);

  const handlePriceKey = useCallback((key: string) => {
    setPrezzoFisico(prev => {
      if (prev === '0.00' || prev === '0') return key;
      if (key === '.' && prev.includes('.')) return prev;
      return prev + key;
    });
  }, []);

  const handlePriceBackspace = useCallback(() => {
    setPrezzoFisico(prev => {
      if (prev === '0.00') return '0.00';
      if (prev.length <= 1) return '0.00';
      return prev.slice(0, -1);
    });
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Evita shortcut se l'utente sta scrivendo nella barra di ricerca
      if (document.activeElement?.tagName === 'INPUT' && 
          (document.activeElement as HTMLInputElement).placeholder.toLowerCase().includes('cerca')) {
        return;
      }

      if (step === 'film') {
        if (e.key.toLowerCase() === 'r') {
          e.preventDefault();
          window.location.reload();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleNextDay();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handlePrevDay();
        } else if (/[1-9]/.test(e.key)) {
          const index = parseInt(e.key) - 1;
          if (filteredLocal[index]) {
            e.preventDefault();
            handleSelectScreening(filteredLocal[index]);
          }
        }
      } else if (step === 'seat') {
        if (/[1-9]/.test(e.key)) {
          e.preventDefault();
          autoSelectSeats(parseInt(e.key));
        } else if (e.key === 'Enter') {
          if (selectedSeats.length > 0) {
            e.preventDefault();
            setStep('confirm');
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setStep('film');
        }
      } else if (step === 'confirm') {
        if (/[0-9]/.test(e.key)) {
          e.preventDefault();
          handlePriceKey(e.key);
        } else if (e.key === '.' || e.key === ',') {
          e.preventDefault();
          handlePriceKey('.');
        } else if (e.key === 'Backspace') {
          if (document.activeElement?.tagName !== 'INPUT') {
            e.preventDefault();
            handlePriceBackspace();
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          triggerShortcutEffect('emit');
          handleConfirmSale();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          triggerShortcutEffect('back');
          setStep('seat');
        }
      } else if (step === 'success') {
        if (e.key === 'Enter') {
          e.preventDefault();
          triggerShortcutEffect('pdf');
          handleDownloadTicket();
        } else if (e.key.toLowerCase() === 'p') {
          e.preventDefault();
          triggerShortcutEffect('thermal');
          handlePrint();
        } else if (e.key === 'Escape' || e.key === 'Backspace') {
          e.preventDefault();
          triggerShortcutEffect('new');
          handleNewSale();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    step, 
    filteredLocal, 
    handleNextDay, 
    handlePrevDay, 
    handleSelectScreening, 
    selectedSeats, 
    autoSelectSeats, 
    handlePriceKey, 
    handlePriceBackspace, 
    handleConfirmSale, 
    handleDownloadTicket, 
    handlePrint, 
    handleNewSale, 
    triggerShortcutEffect
  ]);

  const STEPS: { id: Step; label: string }[] = [
    { id: 'film', label: 'Film' }, { id: 'seat', label: 'Posto' },
    { id: 'confirm', label: 'Conferma' }, { id: 'success', label: 'Stampa' },
  ];
  const stepIndex = STEPS.findIndex(s => s.id === step);

  return (
    <>
      {/* ── Div nascosti off-screen per la cattura html2canvas ─────────── */}
      <div style={{ position: 'fixed', top: 0, left: '-9999px', pointerEvents: 'none', zIndex: -1 }}>

        {/* Test ticket — sempre renderizzato per il pulsante "Test di Stampa" */}
        <div id="thermal-capture-test" style={{ width: 576, background: 'white' }}>
          <ThermalTicket data={{
            movieTitle: 'TEST STAMPA',
            screening: 'OGGI, 21:00',
            roomName: 'SALA TEST',
            rowLabel: '5', seatLabel: '12', seatName: 'Fila 5, Posto 12',
            orderCode: 'TEST99',
            qrValue: 'https://vestricinema.it',
            price: '0.00',
            printDate: '20/04/2026, 21:40:00',
          }} />
        </div>

        {/* Biglietti vendita corrente */}
        {result?.records && selectedScreening && result.records.map((rec, idx) => (
          <div key={`capture-${rec.id}`} id={`thermal-capture-${idx}`} style={{ width: 576, background: 'white' }}>
            <ThermalTicket data={buildTicketData(rec, selectedScreening)!} />
          </div>
        ))}

        {/* Biglietto ristampa */}
        {reprintRecord && (
          <div id="thermal-capture-reprint" style={{ width: 576, background: 'white' }}>
            <ThermalTicket data={buildTicketData(reprintRecord)!} />
          </div>
        )}
      </div>

      <div style={{ position: 'fixed', top: 0, left: '-9999px', pointerEvents: 'none' }}>
        {result?.records && selectedScreening && result.records.map((rec, idx) => (
          <TicketPDF key={`ticket-pdf-${rec.id}`} id={`ticket-pdf-current-${idx}`} backdropIndex={idx} data={{
            movieTitle: rec.movieTitle, posterPath: selectedScreening.posterPath,
            backdropPath: selectedScreening.backdropPath, logoPath: selectedScreening.logoPath,
            date: selectedScreening.dateFrom, duration: selectedScreening.runtime,
            director: selectedScreening.director, cast: selectedScreening.cast,
            roomName: rec.room, seatName: rec.seatName, rowLabel: rec.rowLabel, seatLabel: rec.seatLabel,
            tmdbId: selectedScreening.tmdbId || undefined, orderCode: rec.orderCode,
            qrSecret: rec.qrValue, purchaseDate: formatSaleTime(rec.date),
            tagline: selectedScreening.tagline, genres: selectedScreening.genres,
            year: selectedScreening.year, rating: selectedScreening.rating,
          }} />
        ))}
      </div>

      <div className={styles.posRoot}>
        <header className={styles.topBar}>
          <div className={styles.topBarLeft}>
            <div className={styles.posLogo}>VESTRICINEMA</div>
            <div className={styles.separator} />
            <span className={styles.posSubtitle}>CASSA RAPIDA</span>
          </div>
          <div className={styles.topBarRight}>
            <span className={styles.clock}>{clock}</span>
            <button className={styles.btnRefresh} onClick={() => window.location.reload()}><RefreshCw size={14} /> Aggiorna</button>
            <button className={styles.btnPrintTest} onClick={handlePrintTest} disabled={isPrinting}>{isPrinting ? <Loader2 size={14} className={styles.loadingSpinner} /> : <Printer size={14} />} Test di Stampa</button>
            <button className={styles.btnHistory} onClick={() => setShowHistory(true)}><History size={15} /> Ultime Vendite ({recentSales.length})</button>
          </div>
        </header>

        <div className={styles.stepBar}>
          {STEPS.map((s, i) => (
            <div key={s.id} className={`${styles.stepItem} ${i === stepIndex ? styles.stepItemActive : ''} ${i < stepIndex ? styles.stepItemDone : ''}`}>
              <span className={`${styles.stepNumber} ${i === stepIndex ? styles.stepNumberActive : ''} ${i < stepIndex ? styles.stepNumberDone : ''}`}>
                {i < stepIndex ? '✓' : i + 1}
              </span>
              {s.label}
            </div>
          ))}
        </div>

        <div className={styles.content}>
          {step === 'film' && (
            <>
              <div className={styles.searchContainer}>
                <input
                  type="search"
                  className={styles.searchInput}
                  placeholder="Cerca film per titolo..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <Search className={styles.searchIcon} size={20} />
              </div>

              <div className={styles.dateNav}>
                <div className={styles.dateInfo}>
                  <p className={styles.sectionTitle}>{isDefaultView ? 'Spettacoli di oggi' : 'Spettacoli del giorno'}</p>
                  <h2 className={styles.currentDateDisplay}>{new Date(viewDate).toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</h2>
                </div>
                <div className={styles.dateControls}>
                  {!isDefaultView && <button className={styles.btnToday} onClick={handleResetToToday}>Torna a Oggi</button>}
                  <div className={styles.arrowGroup}>
                    <button className={styles.navArrow} onClick={handlePrevDay}><ChevronLeft size={20} /></button>
                    <button className={styles.navArrow} onClick={handleNextDay}><ChevronRight size={20} /></button>
                  </div>
                </div>
              </div>
              <div className={styles.screeningGrid}>
                {fetchingScreenings ? (
                  <div className={styles.emptyState}><Loader2 size={40} className={styles.loadingSpinner} /><span>Caricamento...</span></div>
                ) : filteredLocal.length === 0 && globalResults.length === 0 ? (
                  <div className={styles.noResults}>
                    <Search size={48} opacity={0.2} />
                    <span>Nessun film trovato con questo nome</span>
                  </div>
                ) : (
                  <>
                    {filteredLocal.map((s) => (
                      <button
                        key={s.subeventId}
                        className={`${styles.screeningCard} ${s.isSoldOut ? styles.screeningCardSoldOutVip : ''}`}
                        onClick={() => handleSelectScreening(s)}
                      >
                        <div className={styles.cardHeader}>
                          {s.isSoldOut ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                              <span className={styles.soldOutBadge}>ESAURITO</span>
                              {s.isVipAvailable && (
                                <span className={styles.vipAvailBadge}>⭐ VIP disponibile</span>
                              )}
                            </div>
                          ) : (
                            <div className={styles.availBadge}>{s.availableSeats} posti liberi</div>
                          )}
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            {s.rating && <RatingBadge id={s.rating} size="sm" />}
                            <div className={styles.btnFindAltIcon} onClick={(e) => { e.stopPropagation(); handleFindAlternatives(s); }} title="Prossimi Spettacoli">
                              <Clock size={14} />
                            </div>
                          </div>
                        </div>
                        <div className={`${styles.screeningTime} ${s.isSoldOut ? styles.screeningTimeSoldOut : ''}`}>{formatTime(s.dateFrom)}</div>
                        <div className={`${styles.screeningTitle} ${s.isSoldOut ? styles.screeningTitleSoldOut : ''}`}>{s.movieTitle}</div>
                        <div className={styles.screeningMeta}><span>{s.roomName}</span><span>{formatDate(s.dateFrom)}</span><span>{s.runtime} min</span></div>
                      </button>
                    ))}

                    {globalResults.length > 0 && (
                      <div className={styles.globalSection} style={{ gridColumn: '1 / -1' }}>
                        <p className={styles.sectionTitle}>
                          Risultati Globali <span className={styles.globalBadge}>Prossimamente</span>
                        </p>
                      </div>
                    )}

                    {globalResults.map((s) => (
                      <button
                        key={s.subeventId}
                        className={`${styles.screeningCard} ${s.isSoldOut ? styles.screeningCardSoldOutVip : ''}`}
                        onClick={() => handleSelectScreening(s)}
                      >
                        <div className={styles.cardHeader}>
                          {s.isSoldOut ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                              <span className={styles.soldOutBadge}>ESAURITO</span>
                              {s.isVipAvailable && (
                                <span className={styles.vipAvailBadge}>⭐ VIP disponibile</span>
                              )}
                            </div>
                          ) : (
                            <div className={styles.availBadge}>{s.availableSeats} posti liberi</div>
                          )}
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            {s.rating && <RatingBadge id={s.rating} size="sm" />}
                            <div className={styles.btnFindAltIcon} onClick={(e) => { e.stopPropagation(); handleFindAlternatives(s); }} title="Prossimi Spettacoli">
                              <Clock size={14} />
                            </div>
                          </div>
                        </div>
                        <div className={`${styles.screeningTime} ${s.isSoldOut ? styles.screeningTimeSoldOut : ''}`}>{formatTime(s.dateFrom)}</div>
                        <div className={`${styles.screeningTitle} ${s.isSoldOut ? styles.screeningTitleSoldOut : ''}`}>{s.movieTitle}</div>
                        <div className={styles.screeningMeta}><span>{s.roomName}</span><span>{formatDate(s.dateFrom)}</span><span>{s.runtime} min</span></div>
                      </button>
                    ))}
                    
                    {isSearchingGlobal && (
                      <div className={styles.seatLoader} style={{ gridColumn: '1 / -1' }}>
                        <Loader2 size={20} className={styles.loadingSpinner} /> Ricerca globale in corso...
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {step === 'seat' && selectedScreening && (
            <div className={styles.seatSection}>
              <div className={styles.selectedInfo}>
                <div className={styles.selectedInfoContent}>
                  <button className={styles.btnBack} onClick={() => setStep('film')}>
                    <ArrowLeft size={16} /> Cambia film
                    <span className={styles.kbdHint}>ESC</span>
                  </button>
                  <div>
                    <div className={styles.selectedInfoTitle}>
                      {selectedScreening.movieTitle}
                      {selectedScreening.rating && <RatingBadge id={selectedScreening.rating} size="sm" className={styles.modalBadge} />}
                    </div>
                    <div className={styles.selectedInfoMeta}>{formatScreeningLabel(selectedScreening.dateFrom)} • {selectedScreening.roomName}</div>
                  </div>
                </div>
                {selectedSeats.length > 0 && (
                  <div className={styles.selectionSummary}>
                    <span className={styles.selectionCount}>{selectedSeats.length} posti selezionati</span>
                    <button className={styles.btnContinue} onClick={() => setStep('confirm')}>Concludi <ChevronRight size={16} /></button>
                  </div>
                )}
              </div>

              <p className={styles.sectionTitle}>Mappa dei posti</p>
              {loadingSeats ? (<div className={styles.seatLoader}><Loader2 size={24} className={styles.loadingSpinner} /> Caricamento...</div>) : (
                <>
                  <div className={styles.seatLegend}>
                    <div className={styles.legendItem}><div className={styles.legendDot} style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.4)' }} /> Disponibile</div>
                    <div className={styles.legendItem}><div className={styles.legendDot} style={{ background: '#c084fc' }} /> Selezionato</div>
                    <div className={styles.legendItem}><div className={styles.legendDot} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} /> Occupato</div>
                    <div className={styles.legendItem}><div className={styles.legendDot} style={{ background: 'rgba(251, 191, 36, 0.15)', border: '1px solid rgba(251, 191, 36, 0.5)' }} /> ⭐ Poltrona VIP</div>
                  </div>
                  {selectedScreening?.isSoldOut && (
                    <div className={styles.vipSoldOutNotice}>
                      <span>⭐</span>
                      <span>Proiezione <strong>esaurita</strong> — solo la <strong>Poltrona VIP</strong> è selezionabile.</span>
                    </div>
                  )}
                  <div className={styles.seatGrid}>
                    {seats.map(seat => {
                      // Seat è disabilitato se: già occupato/venduto, OPPURE se la proiezione è
                      // sold-out e il posto NON è VIP (standard non selezionabili in sold-out).
                      const isDisabled = seat.isBlocked || (selectedScreening?.isSoldOut && !seat.isVip);
                      return (
                        <button
                          key={seat.guid}
                          className={`${styles.seatBtn} ${selectedSeats.find(s=>s.guid===seat.guid)?styles.seatBtnSelected:''} ${seat.isBlocked?styles.seatBtnBlocked:''} ${isDisabled && !seat.isBlocked ? styles.seatBtnBlockedBySoldOut : ''} ${seat.isVip?styles.seatBtnVip:''}`}
                          onClick={()=>handleSelectSeat(seat)}
                          disabled={isDisabled}
                        >
                          <span>{seat.seat}</span><span className={styles.seatRow}>F{seat.row}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {step === 'confirm' && selectedScreening && selectedSeats.length > 0 && (
            <div className={styles.confirmSection}>
              <div className={styles.confirmCard}>
                <p className={styles.sectionTitle}>Riepilogo</p>
                <div className={styles.confirmRow}><span>Film</span><span className={styles.confirmValue}>{selectedScreening.movieTitle}</span></div>
                <div className={styles.confirmRow}><span>Posti</span><div className={styles.seatListSummary}>{selectedSeats.map(s => <div key={s.guid}>{s.name}</div>)}</div></div>
              </div>
              <div className={styles.confirmCard}>
                <div className={styles.priceSection}>
                  <span className={styles.priceShortcutHint}>DIGITA IL PREZZO DIRETTO</span>
                  <span className={styles.priceLabel}>Prezzo / Biglietto</span>
                  <div className={styles.priceInputWrapper}><span className={styles.eurSymbol}>€</span>
                    <input className={styles.priceInput} type="text" value={prezzoFisico} onChange={(e) => setPrezzoFisico(e.target.value)} />
                  </div>
                  <div className={styles.totalSummary}><span>Totale</span><span className={styles.totalValue}>€ {(parseFloat(prezzoFisico) * selectedSeats.length).toFixed(2)}</span></div>
                  <button 
                    className={`${styles.btnConfirm} ${activeShortcut === 'emit' ? styles.shortcutActive : ''}`} 
                    disabled={loading} 
                    onClick={handleConfirmSale}
                  >
                    {loading ? <Loader2 size={20} className={styles.loadingSpinner} /> : <CheckCircle size={20} />} 
                    Emetti Biglietti
                    <span className={styles.kbdHint}>INVIO</span>
                  </button>
                  <button 
                    className={`${styles.btnBack} ${activeShortcut === 'back' ? styles.shortcutActive : ''}`} 
                    onClick={() => setStep('seat')}
                    style={{ marginTop: '0.75rem', width: '100%', justifyContent: 'center' }}
                  >
                    <ArrowLeft size={16} /> Torna ai posti
                    <span className={styles.kbdHint}>ESC</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 'success' && result && (
            <div className={styles.successSection}>
              <div className={styles.ticketPreview}>
                <ThermalTicket id="preview-first" data={buildTicketData(result.records[0])!} />
                <div className={styles.ticketActions}>
                  <button 
                    className={`${styles.btnPrint} ${activeShortcut === 'thermal' ? styles.shortcutActive : ''}`} 
                    onClick={handlePrint}
                    disabled={isPrinting}
                  >
                    {isPrinting ? <Loader2 size={16} className={styles.loadingSpinner} /> : <Printer size={16} />} 
                    {isPrinting ? 'Stampa in corso...' : 'Stampa Scontrini'} <span className={styles.kbdHint}>P</span>
                  </button>
                  <button 
                    className={`${styles.btnDownloadTicket} ${activeShortcut === 'pdf' ? styles.shortcutActive : ''}`} 
                    onClick={handleDownloadTicket} 
                    disabled={generatingPdf}
                  >
                    {generatingPdf ? <Loader2 size={16} className={styles.loadingSpinner} /> : <Download size={16} />} 
                    SCARICA BIGLIETTO VESTRICINEMA
                    <span className={styles.kbdHint}>INVIO</span>
                  </button>
                  <button 
                    className={`${styles.btnNewSale} ${activeShortcut === 'new' ? styles.shortcutActive : ''}`} 
                    onClick={handleNewSale}
                  >
                    <ShoppingBag size={18} /> NUOVA VENDITA <span className={styles.kbdHint}>ESC</span>
                  </button>
                </div>
              </div>
              <div className={styles.successInfo}>
                <div className={styles.successTitle}>✅ Vendita completata!</div>
                <div className={styles.successCode}>Ordine: {result.orderCode}</div>
                <div className={styles.successDetails}>
                  <div className={styles.successDetailRow}><span>Film</span><span>{selectedScreening?.movieTitle}</span></div>
                  <div className={styles.successDetailRow}><span>Posti</span><span>{result.records.map(r => r.seatLabel).join(', ')}</span></div>
                  <div className={styles.successDetailRow}><span>Totale</span><span style={{ color: '#86efac' }}>€ {(parseFloat(prezzoFisico) * result.records.length).toFixed(2)}</span></div>
                </div>
              </div>
            </div>
          )}
          {ratingAlert && (
            <div className={styles.ratingAlertBar} onClick={() => setRatingAlert(null)}>
              {ratingAlert}
              <button className={styles.closeAlert}><X size={16} /></button>
            </div>
          )}
        </div>
      </div>

      {showHistory && (
        <div className={styles.historyPanel}>
          <div className={styles.historyHeader}><span>Ultime Vendite</span><button onClick={() => setShowHistory(false)}><X size={16} /></button></div>
          <div className={styles.historyList}>
            {recentSales.map((sale) => (
              <div key={sale.id} className={styles.historyItem}>
                <div>{sale.movieTitle}</div>
                <button className={styles.btnReprint} onClick={() => handleReprint(sale)}><RotateCcw size={11} /> Ristampa</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {reprintRecord && (
        <div className={styles.overlay} onClick={handleReprintClose}>
          <div className={styles.overlayCard} onClick={e => e.stopPropagation()}>
            <ThermalTicket ref={reprintTicketRef} id="thermal-reprint" data={buildTicketData(reprintRecord)!} />
            <div className={styles.overlayActions}>
              <button onClick={async () => { setIsPrinting(true); await captureAndPrint('thermal-capture-reprint', reprintRecord?.orderCode || ''); setIsPrinting(false); }}><Printer size={16} /> {isPrinting ? 'Stampa...' : 'Ristampa'}</button>
              <button onClick={handleReprintClose}><X size={14} /></button>
            </div>
          </div>
        </div>
      )}

      {showAltModal && (
        <div className={styles.overlay} onClick={() => setShowAltModal(false)}>
          <div className={styles.overlayCardAlt} onClick={e => e.stopPropagation()}>
            <div className={styles.overlayHeader}>
              <div><h3 className={styles.overlayTitle}>Prossimi Spettacoli</h3><p className={styles.overlaySubtitle}>{searchingMovieTitle}</p></div>
              <button className={styles.btnClosePanel} onClick={() => setShowAltModal(false)}><X size={18} /></button>
            </div>
            <div className={styles.altList}>
              {isSearchingAlt ? (<div className={styles.seatLoader}><Loader2 size={24} className={styles.loadingSpinner} /> Ricerca...</div>) : 
              altScreenings.length === 0 ? (<div className={styles.emptyState}>Nessuna alternativa trovata.</div>) : (
                altScreenings.map(alt => (
                  <div key={alt.subeventId} className={styles.altItem} onClick={() => handleSelectAlternative(alt)}>
                    <div className={styles.altTimeInfo}><span className={styles.altDay}>{formatDate(alt.dateFrom).split(',')[0]}</span><span className={styles.altTime}>{formatTime(alt.dateFrom)}</span></div>
                    <div className={styles.altDetails}><span className={styles.altRoom}>{alt.roomName}</span><span className={styles.altSeats}>{alt.availableSeats} posti liberi</span></div>
                    <button className={styles.btnQuickSelect}>Seleziona <ChevronRight size={14} /></button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {generatingPdf && (
        <div className={styles.downloadOverlay}>
          <div className={styles.downloadOverlayContent}>
            <Loader2 size={48} className={styles.loadingSpinner} />
            <h2>Preparazione biglietti in corso... attendi.</h2>
            <p>Generazione dei PDF in corso, non chiudere la pagina.</p>
          </div>
        </div>
      )}
    </>
  );
}
