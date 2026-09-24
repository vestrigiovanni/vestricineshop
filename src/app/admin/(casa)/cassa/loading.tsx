/**
 * Loading skeleton for /admin/cassa.
 * Displayed by Next.js immediately while the Server Component fetches Pretix data.
 * Prevents the white blank screen during SSR.
 */
export default function CassaLoading() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {/* Top Bar skeleton */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.9rem 1.5rem',
        background: 'rgba(255,255,255,0.04)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fff' }}>
            ★ VESTRICINEMA
          </div>
          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.12)' }} />
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
            CASSA RAPIDA
          </div>
        </div>
        <div style={{
          width: 80,
          height: 32,
          background: 'rgba(255,255,255,0.07)',
          borderRadius: 8,
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      </div>

      {/* Step bar skeleton */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        {['Film', 'Posto', 'Conferma', 'Stampa'].map((label, i) => (
          <div key={label} style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '0.75rem',
            fontSize: '0.8rem',
            fontWeight: 600,
            color: i === 0 ? '#c084fc' : 'rgba(255,255,255,0.2)',
            borderBottom: i === 0 ? '2px solid #c084fc' : '2px solid transparent',
          }}>
            <span style={{
              width: 22, height: 22, borderRadius: '50%',
              background: i === 0 ? '#c084fc' : 'rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.7rem', fontWeight: 800, color: i === 0 ? '#fff' : 'rgba(255,255,255,0.3)',
            }}>
              {i + 1}
            </span>
            {label}
          </div>
        ))}
      </div>

      {/* Content skeleton */}
      <div style={{ flex: 1, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{
          fontSize: '0.7rem',
          fontWeight: 800,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.35)',
          marginBottom: '0.5rem',
        }}>
          Caricamento spettacoli in corso…
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '1rem',
        }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '1rem',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
              opacity: 1 - i * 0.15,
            }}>
              <div style={{ width: 80, height: 36, background: 'rgba(255,255,255,0.07)', borderRadius: 6 }} />
              <div style={{ width: '85%', height: 14, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }} />
              <div style={{ width: '60%', height: 11, background: 'rgba(255,255,255,0.04)', borderRadius: 4 }} />
            </div>
          ))}
        </div>

        {/* Loading indicator */}
        <div style={{
          marginTop: '2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          color: 'rgba(255,255,255,0.25)',
          fontSize: '0.85rem',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ animation: 'spin 1s linear infinite' }}>
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
          Recupero proiezioni da Pretix…
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}
