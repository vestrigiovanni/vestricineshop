'use client';
import { usePathname } from 'next/navigation';
import Footer from './Footer';

export default function ClientFooter() {
  const pathname = usePathname();
  // Il footer pubblico non entra in cabina né sullo schermo d'ingresso.
  const isHidden = pathname === '/display-esterno' || pathname.startsWith('/admin');
  
  if (isHidden) return null;
  
  return <Footer />;
}
