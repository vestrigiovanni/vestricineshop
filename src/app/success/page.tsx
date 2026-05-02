'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, Download, Home, Eye, X, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import TicketPDF, { generateTicketPDF } from '@/components/TicketPDF';
import styles from './success.module.css';

function SuccessContent() {
  const searchParams = useSearchParams();
  const subeventId = searchParams.get('subeventId');
  const [orderData, setOrderData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);

  useEffect(() => {
    if (subeventId) {
      const saved = sessionStorage.getItem(`order_${subeventId}`);
      if (saved) {
        setOrderData(JSON.parse(saved));
        // Auto-open preview for immediate visibility as requested ("apre il pop up")
        setIsPreviewOpen(true);
      }
    }
  }, [subeventId]);

  const handleDownloadPDF = async () => {
    if (!orderData) return;
    setLoading(true);
    try {
      const ticketIds = orderData.tickets.map((t: any) => `full-ticket-${t.secret}`);
      await generateTicketPDF(ticketIds, `biglietti_${orderData.orderCode}`, null, true);
    } catch (err) {
      console.error('Failed to generate PDF', err);
    } finally {
      setLoading(false);
    }
  };

  if (!orderData) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <p>Caricamento dati ordine...</p>
          <Link href="/" className={styles.homeBtn} style={{ marginTop: '1rem' }}>
            Torna alla Home
          </Link>
        </div>
      </div>
    );
  }

  const { tickets, orderCode, subeventData, isAnonymous } = orderData;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.successIcon}>
          <CheckCircle2 size={64} color="#10b981" />
        </div>
        <h1 className={styles.title}>Prenotazione Completata!</h1>
        <p className={styles.subtitle}>
          Il tuo ordine è stato elaborato con successo.<br/>
          Codice ordine: <strong>{orderCode}</strong>
        </p>

        <div className={styles.infoBox}>
          {isAnonymous ? (
            <p>⚠️ <strong>Nota bene:</strong> Non riceverai una copia via email. Assicurati di scaricare il biglietto ora.</p>
          ) : (
            <p>Se hai inserito la tua email, riceverai una copia a breve. Ti consigliamo comunque di scaricare il PDF ora.</p>
          )}
        </div>

        {/* Action Buttons */}
        <div className={styles.actions}>
          <button 
            className={styles.downloadBtn} 
            onClick={handleDownloadPDF}
            disabled={loading}
          >
            <Download size={20} />
            {loading ? 'Generazione PDF...' : 'SCARICA BIGLIETTI (PDF)'}
          </button>

          <button 
            className={styles.previewBtn}
            onClick={() => setIsPreviewOpen(true)}
          >
            <Eye size={20} />
            Visualizza Anteprima
          </button>

          <Link href="/" className={styles.homeBtn}>
            <Home size={20} />
            Torna alla Home
          </Link>
        </div>
        
        <p className={styles.footerNote}>
          Presenta il QR code del biglietto all'ingresso del cinema.
        </p>
      </div>

      {/* Hidden PDF rendering area */}
      <div style={{ position: 'fixed', top: 0, left: '-9999px', pointerEvents: 'none' }}>
        {tickets.map((ticket: any, idx: number) => (
          <TicketPDF 
            key={`full-${ticket.id}`}
            preview={false}
            id={`full-ticket-${ticket.secret}`}
            backdropIndex={idx}
            data={{
              ...subeventData,
              seatName: ticket.seat_name || 'Posto Unico',
              orderCode: orderCode,
              qrSecret: ticket.secret,
              purchaseDate: new Date().toLocaleDateString('it-IT'),
            }}
          />
        ))}
      </div>

      {/* Preview Modal */}
      {isPreviewOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsPreviewOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <button className={styles.closeModalBtn} onClick={() => setIsPreviewOpen(false)}>
              <X size={20} />
            </button>
            
            <div className={styles.ticketCarousel}>
              {tickets.length > 1 && (
                <button 
                  className={styles.carouselBtn} 
                  onClick={() => setCurrentPreviewIndex((prev) => (prev - 1 + tickets.length) % tickets.length)}
                >
                  <ChevronLeft size={24} />
                </button>
              )}
              
              <div className={styles.ticketContainerWrapper}>
                <TicketPDF 
                  preview={true}
                  id={`preview-ticket-${tickets[currentPreviewIndex].secret}`}
                  backdropIndex={currentPreviewIndex}
                  data={{
                    ...subeventData,
                    seatName: tickets[currentPreviewIndex].seat_name || 'Posto Unico',
                    orderCode: orderCode,
                    qrSecret: tickets[currentPreviewIndex].secret,
                    purchaseDate: new Date().toLocaleDateString('it-IT'),
                  }}
                />
              </div>
              
              {tickets.length > 1 && (
                <button 
                  className={styles.carouselBtn} 
                  onClick={() => setCurrentPreviewIndex((prev) => (prev + 1) % tickets.length)}
                >
                  <ChevronRight size={24} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div>Caricamento...</div>}>
      <SuccessContent />
    </Suspense>
  );
}
