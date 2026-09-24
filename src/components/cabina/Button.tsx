import Link from 'next/link';
import styles from './Button.module.css';

type Variant = 'fill' | 'outline' | 'ghost' | 'alarm';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Con un href diventa un link, con lo stesso aspetto; se è esterno si apre in una scheda nuova. */
  href?: string;
}

export default function Button({ variant = 'outline', href, className, children, ...rest }: Props) {
  const cls = [styles.btn, styles[variant], className].filter(Boolean).join(' ');
  if (href && /^https?:\/\//.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button {...rest} type={rest.type ?? 'button'} className={cls}>
      {children}
    </button>
  );
}
