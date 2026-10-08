import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

export function Button({ variant = 'secondary', className, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={['np-btn', `np-btn--${variant}`, className].filter(Boolean).join(' ')} {...rest} />;
}