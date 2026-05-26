'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { loginAdmin } from '@/actions/authActions';
import { Eye, EyeOff, Lock, Film, AlertTriangle, Loader2 } from 'lucide-react';
import styles from './login.module.css';

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const redirectUrl = searchParams.get('redirect') || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await loginAdmin(password);
      if (res.success) {
        // Force fully reload or navigate to ensure middleware detects the fresh cookie
        router.push(redirectUrl);
        router.refresh();
      } else {
        setError(res.error || 'Password non corretta.');
      }
    } catch (err) {
      setError('Errore di connessione. Riprova.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.loginCard}>
      <div className={styles.logoWrapper}>
        <Film size={32} />
      </div>
      
      <h1 className={styles.title}>Torre di Controllo</h1>
      <p className={styles.subtitle}>
        Accesso amministrativo riservato. Inserisci la chiave di sicurezza per sbloccare le funzionalità.
      </p>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.inputGroup}>
          <label htmlFor="current-password" className={styles.label}>
            Chiave di Sicurezza
          </label>
          <div className={styles.inputWrapper}>
            <input
              type={showPassword ? 'text' : 'password'}
              id="current-password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Inserisci la password..."
              className={styles.input}
              disabled={loading}
              autoFocus
            />
            <Lock size={16} className={styles.inputIcon} />
            
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className={styles.toggleButton}
              title={showPassword ? 'Nascondi password' : 'Mostra password'}
              disabled={loading}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {error && (
          <div className={styles.errorBox}>
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        <button type="submit" className={styles.submitBtn} disabled={loading}>
          {loading ? (
            <>
              <Loader2 size={18} className={styles.spinner} />
              <span>Verifica in corso...</span>
            </>
          ) : (
            <span>Sblocca Accesso</span>
          )}
        </button>
      </form>

      <div className={styles.footerText}>
        <p>&copy; {new Date().getFullYear()} VESTRICINEMASHOP. <a href="/">Torna alla Home</a></p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className={styles.pageContainer}>
      <div className={styles.glowCircle1} />
      <div className={styles.glowCircle2} />

      <Suspense fallback={
        <div className={styles.loginCard}>
          <div className={styles.logoWrapper}>
            <Film size={32} />
          </div>
          <h1 className={styles.title}>Caricamento</h1>
          <p className={styles.subtitle}>Inizializzazione del sistema di sicurezza...</p>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '2rem 0' }}>
            <Loader2 size={36} className={styles.spinner} color="#8b5cf6" />
          </div>
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}
