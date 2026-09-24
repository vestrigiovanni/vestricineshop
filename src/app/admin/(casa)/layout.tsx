import AdminShell from '@/components/cabina/AdminShell';
import { ToastProvider } from '@/components/cabina/Toast';

/** Le stanze del gestionale: tutto /admin tranne il login. */
export default function CasaLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AdminShell>{children}</AdminShell>
    </ToastProvider>
  );
}
