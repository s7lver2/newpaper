import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function IconButton({ label, icon, pressed, className, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: ReactNode; pressed?: boolean }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      className={['np-icon-btn', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {icon}
    </button>
  );
}