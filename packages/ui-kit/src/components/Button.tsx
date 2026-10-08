import type { ButtonHTMLAttributes, Ref } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

export function Button({
  variant = 'secondary',
  className,
  type = 'button',
  ref,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; ref?: Ref<HTMLButtonElement> }) {
  return <button ref={ref} type={type} className={['np-btn', `np-btn--${variant}`, className].filter(Boolean).join(' ')} {...rest} />;
}