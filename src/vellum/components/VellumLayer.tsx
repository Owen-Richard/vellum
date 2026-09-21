import { useRef, type ReactNode } from 'react';
import { usePopoverToggle } from '../hooks/usePopoverToggle';
import styles from './VellumLayer.module.css';

interface VellumLayerProps {
  children: ReactNode;
}

export function VellumLayer({ children }: VellumLayerProps) {
  const ref = useRef<HTMLDivElement>(null);
  usePopoverToggle(ref, true);

  return (
    <div ref={ref} popover="manual" className={styles.layer} data-vellum>
      {children}
    </div>
  );
}
