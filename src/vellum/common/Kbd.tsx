import clsx from 'clsx';
import type { ReactNode } from 'react';
import styles from './Kbd.module.css';

type KbdProps = {
  size?: 'sm' | 'lg';
  className?: string;
  children: ReactNode;
};

export function Kbd({ size = 'sm', className, children }: KbdProps) {
  return (
    <kbd className={clsx(styles.kbd, size === 'lg' && styles.lg, className)}>
      {children}
    </kbd>
  );
}
