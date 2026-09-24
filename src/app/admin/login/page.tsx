'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { loginAdmin } from '@/actions/authActions';
import Button from '@/components/cabina/Button';
import Field from '@/components/cabina/Field';
import styles from './login.module.css';

/** Si torna solo dentro il sito: un `?redirect=` verso un altro dominio viene ignorato. */
function safeRedirect(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/admin';
}

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await loginAdmin(password);
      if (res.success) {
        router.push(safeRedirect(searchParams.get('redirect')));
        router.refresh();
      } else {
        setError(res.error || 'Password non corretta.');
      }
    } catch {
      setError('Connessione assente. Riprova fra un attimo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className={styles.form}>
      <Field
        label="Chiave"
        type={visible ? 'text' : 'password'}
        name="password"
        autoComplete="current-password"
        required
        autoFocus
        disabled={loading}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={error || undefined}
        trailing={
          <button
            type="button"
            className={styles.eye}
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Nascondi la chiave' : 'Mostra la chiave'}
          >
            {visible ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        }
      />
      <Button type="submit" variant="fill" disabled={loading} className={styles.submit}>
        {loading ? 'Verifico…' : 'Entra in cabina'}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <div className={styles.beam} aria-hidden />
      <section className={styles.card}>
        <p className={styles.kicker}>Vestri Cinema · Cabina</p>
        <h1 className={styles.title}>Si entra in cabina</h1>
        <p className={styles.lead}>Il gestionale del cinema. Serve la chiave.</p>
        <Suspense fallback={<p className={styles.lead}>Un attimo…</p>}>
          <LoginForm />
        </Suspense>
        <Link href="/" className={styles.back}>← Torna al sito</Link>
      </section>
    </main>
  );
}
