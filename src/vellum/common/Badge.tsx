import clsx from 'clsx';
import type { ReactNode } from 'react';
import styles from './Badge.module.css';

type BadgeProps = {
  variant?: 'default' | 'overlay' | 'index';
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
};

export function Badge({ variant = 'default', className, style, children }: BadgeProps) {
  return (
    <span
      className={clsx(
        styles.badge,
        variant === 'overlay' && styles.overlay,
        variant === 'index' && styles.index,
        className,
      )}
      style={style}
    >
      {children}
    </span>
  );
}
