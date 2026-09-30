import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; variant?: 'primary' | 'quiet' };

export function Button({ children, className = '', variant = 'primary', ...props }: Props) {
  return <button className={`button button--${variant} ${className}`} {...props}>{children}</button>;
}
