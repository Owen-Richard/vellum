import type { ReactNode } from 'react';
import clsx from 'clsx';
import styles from './ButtonGroup.module.css';

type ButtonGroupProps = {
  children: ReactNode;
  className?: string;
};

export function ButtonGroup({ children, className }: ButtonGroupProps) {
  return <span className={clsx(styles.group, className)}>{children}</span>;
}
