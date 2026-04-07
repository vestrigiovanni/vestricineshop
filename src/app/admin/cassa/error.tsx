'use client';

/**
 * Error boundary for /admin/cassa.
 * Shows a styled dark error screen instead of the browser's white crash page.
 */
export default function CassaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#fff',
      gap: '1.5rem',
      padding: '2rem',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '3rem' }}>⚠️</div>
      <div>
        <div style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.5rem' }}>
          Errore nel caricamento della Cassa
        </div>
        <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.45)', maxWidth: 400 }}>
          {error.message || 'Si è verificato un errore imprevisto. Riprova o controlla la connessione a Pretix.'}
        </div>
      </div>
      <button
        onClick={reset}
        style={{
          padding: '0.8rem 2rem',
          background: 'linear-gradient(135deg, #c084fc, #818cf8)',
          border: 'none',
          borderRadius: '0.75rem',
          color: '#fff',
          fontWeight: 700,
          fontSize: '0.9rem',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Riprova
      </button>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: '0.6rem 1.5rem',
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '0.75rem',
          color: 'rgba(255,255,255,0.5)',
          fontSize: '0.8rem',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Ricarica pagina
      </button>
    </div>
  );
}
