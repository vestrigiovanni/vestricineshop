'use client';
import { usePathname } from 'next/navigation';
import Footer from './Footer';

export default function ClientFooter() {
  const pathname = usePathname();
  // Suppress footer on isolated full-screen pages
  const isHidden = pathname === '/display-esterno' || pathname.startsWith('/admin/cassa');
  
  if (isHidden) return null;
  
  return <Footer />;
}
