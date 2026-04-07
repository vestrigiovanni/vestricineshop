'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Check, Loader2 } from 'lucide-react';
import { getSeatingPlan, getAvailability } from '@/services/pretix';
import styles from './SeatMap.module.css';

interface SeatMapProps {
  selectedSeats: Set<string>;
  onSeatToggle: (seatId: string, label: string) => void;
  subeventId?: number | null;
}

interface Seat {
  id: string;
  row: number;
  col: number;
  x: number;
  y: number;
  isOccupied: boolean;
  isVip?: boolean;
  rowName?: string;
  seatName?: string;
}

export default function SeatMap({ selectedSeats, onSeatToggle, subeventId }: SeatMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [seats, setSeats] = useState<Seat[]>([]);
  const [loading, setLoading] = useState(true);
  const [bounds, setBounds] = useState({ minX: 0, minY: 0, width: 0, height: 0 });

  // Pan and Zoom state
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // ── Capture container size ──────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // ── Data loading ─────────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      if (!subeventId) return;

      console.log(`[SeatMap] 🚀 NUCLEAR DEBUG: Loading sub-event ${subeventId}`);
      setLoading(true);
      try {
        const [planData, availabilityData] = await Promise.all([
          getSeatingPlan(subeventId),
          getAvailability(subeventId)
        ]);

        console.log(`[SeatMap] 📊 Raw seats count:`, planData?.length);
        console.log(`[SeatMap] 🔍 FULL DATA:`, JSON.stringify(planData));
        
        void availabilityData;

        if (planData && Array.isArray(planData) && planData.length > 0) {
          const VIP_PRODUCT_ID = 344653;
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

          const transformedSeats: Seat[] = planData
            .filter((s: any) => s && (s.seat_guid || s.id))
            .map((s: any) => {
              const isVip =
                s.product === VIP_PRODUCT_ID ||
                (typeof s.zone_name === 'string' && (
                  s.zone_name.toLowerCase().includes('vip') ||
                  s.zone_name.toLowerCase().includes('poltrona')
                ));

              let rowIdx = 0, colIdx = 0;
              if (s.row_name) rowIdx = parseInt(s.row_name) || (s.row_name.charCodeAt(0) - 64);
              if (s.seat_number) colIdx = parseInt(s.seat_number) || (s.seat_number.charCodeAt(0) - 64);

              // Use coordinates if present, fallback to grid spacing
              // NOTE: Grid spacing is 60px between seats for better visibility
              let x = (s.x !== undefined && s.x !== null) ? Number(s.x) : colIdx * 60;
              let y = (s.y !== undefined && s.y !== null) ? Number(s.y) : rowIdx * 60;

              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
              minY = Math.min(minY, y);
              maxY = Math.max(maxY, y);

              return {
                id: s.seat_guid || s.id.toString(),
                row: rowIdx,
                col: colIdx,
                x, y,
                isOccupied: s.available === false || !!s.blocked || s.orderposition !== null || s.cartposition !== null,
                isVip,
                rowName: s.row_name || String.fromCharCode(64 + Math.max(1, rowIdx)),
                seatName: s.seat_number || colIdx.toString(),
              };
            });

          const w = maxX - minX;
          const h = maxY - minY;
          console.log(`[SeatMap] 🎯 FINAL BOUNDS: x=${minX}, y=${minY}, w=${w}, h=${h}`);
          
          setBounds({ minX, minY, width: w, height: h });
          setSeats(transformedSeats);
        } else {
          setSeats([]);
        }
      } catch (error) {
        console.error('[SeatMap] ❌ FATAL LOAD ERROR:', error);
        setSeats([]); 
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [subeventId]);

  // ── Auto-Scaling ─────────────────────────────────────────────
  const resetZoom = useCallback(() => {
    if (!containerSize.width || !seats.length) return;
    
    // Fit SVG content into container
    const padding = 100; // Increased padding for a more "airy" feel
    const availableW = containerSize.width - padding * 2;
    const availableH = containerSize.height - padding * 2;
    
    // Scale should be more generous
    const scaleW = availableW / (bounds.width || 1);
    const scaleH = availableH / (bounds.height || 1);
    const fitScale = Math.min(scaleW, scaleH);
    const finalScale = Math.min(Math.max(0.1, fitScale), 4); // Max scale 4
    
    setTransform({
      x: (containerSize.width - bounds.width * finalScale) / 2 - bounds.minX * finalScale,
      y: (containerSize.height - bounds.height * finalScale) / 2 - (bounds.minY - 20) * finalScale, // Slightly nudge up
      scale: finalScale
    });
  }, [containerSize, seats.length, bounds]);

  useEffect(() => {
    if (!loading && seats.length > 0) {
      resetZoom();
    }
  }, [loading, seats.length, resetZoom]);

  // ── Interaction ──────────────────────────────────────────────
  const handleWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setTransform(prev => ({ ...prev, scale: Math.max(0.1, Math.min(5, prev.scale * factor)) }));
  };

  const handleDrag = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const dx = clientX - dragStart.current.x;
    const dy = clientY - dragStart.current.y;
    setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    dragStart.current = { x: clientX, y: clientY };
  };

  if (loading) return (
    <div className={styles.loadingContainer}>
      <Loader2 className={styles.spinner} size={48} />
      <span>Sincronizzazione planimetria...</span>
    </div>
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.stageArea}>
        <div className={styles.screenWrapper}>
          <div className={styles.screenCurve} />
          <span className={styles.screenLabel}>SCHERMO / PALCO</span>
        </div>
      </div>

      <div
        ref={containerRef}
        className={styles.container}
        onMouseDown={e => { setIsDragging(true); dragStart.current = { x: e.clientX, y: e.clientY }; }}
        onMouseMove={handleDrag}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => setIsDragging(false)}
        onWheel={handleWheel}
      >
        {seats.length > 0 ? (
          <svg
            className={styles.svgMap}
            width="100%"
            height="100%"
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          >
            <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
              {seats.map(seat => {
                const isSelected = selectedSeats.has(seat.id);
                return (
                  <g
                    key={seat.id}
                    className={styles.seatGroup}
                    onClick={() => {
                      if (!seat.isOccupied && !seat.isVip) {
                        onSeatToggle(seat.id, `Fila ${seat.rowName} - Posto ${seat.seatName}`);
                      }
                    }}
                  >
                    <rect
                      x={seat.x}
                      y={seat.y}
                      width={50} // Increased size
                      height={50} // Increased size
                      rx={10}
                      className={[
                        styles.svgSeat,
                        seat.isOccupied ? styles.svgOccupied : isSelected ? styles.svgSelected : styles.svgAvailable,
                        seat.isVip ? styles.svgVip : ''
                      ].join(' ')}
                    />
                    <text
                      x={seat.x + 25}
                      y={seat.y + 32}
                      textAnchor="middle"
                      className={styles.svgText}
                    >
                      {seat.seatName}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        ) : (
          <div className={styles.noSeats}>
            <RotateCcw size={48} className={styles.noSeatsIcon} />
            <p className={styles.errorTitle}>ERRORE DATI: NESSUN POSTO</p>
            <span>Pretix non ha restituito posti per questo evento ({subeventId}).</span>
            <span className={styles.errorHint}>Verificare che l&apos;evento su Pretix abbia una planimetria e posti numerati.</span>
          </div>
        )}
      </div>

      <div className={styles.controlsMinimal}>
        <button onClick={() => setTransform(p => ({ ...p, scale: p.scale * 1.2 }))} className={styles.miniBtn}><ZoomIn size={18} /></button>
        <button onClick={() => setTransform(p => ({ ...p, scale: p.scale * 0.8 }))} className={styles.miniBtn}><ZoomOut size={18} /></button>
        <button onClick={resetZoom} className={styles.miniBtn}><RotateCcw size={18} /></button>
      </div>

      <div className={styles.legend}>
        <div className={styles.legendItem}><div className={[styles.dot, styles.dotAvailable].join(' ')} /><span>Libero</span></div>
        <div className={styles.legendItem}><div className={[styles.dot, styles.dotSelected].join(' ')} /><span>Selezionato</span></div>
        <div className={styles.legendItem}><div className={[styles.dot, styles.dotOccupied].join(' ')} /><span>Occupato</span></div>
      </div>
    </div>
  );
}
