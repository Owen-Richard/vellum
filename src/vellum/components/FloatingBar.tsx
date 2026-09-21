import { useRef, type ReactNode } from 'react';
import clsx from 'clsx';
import { useDrag } from '../hooks/useDrag';
import styles from './FloatingBar.module.css';

function DragHandle() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
      <circle cx="2" cy="2" r="1.25" />
      <circle cx="8" cy="2" r="1.25" />
      <circle cx="2" cy="7" r="1.25" />
      <circle cx="8" cy="7" r="1.25" />
      <circle cx="2" cy="12" r="1.25" />
      <circle cx="8" cy="12" r="1.25" />
    </svg>
  );
}

export interface FloatingBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Unique storage key for persisting drag position */
  storageKey?: string;
  /** Called when drag starts (useful for dismissing modes) */
  onDragStart?: () => void;
  /** Child content rendered after the drag handle */
  children: ReactNode;
  /** Render as part of the host page (drops `data-vellum` so events reach host handlers). Default `false`. */
  inline?: boolean;
}

export function FloatingBar({
  storageKey = 'vellum-toolbar-pos',
  onDragStart,
  children,
  className,
  inline = false,
  ...rest
}: FloatingBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const { isDragging, handleDragStart, posStyle } = useDrag(barRef, onDragStart, storageKey);

  return (
    <div
      ref={barRef}
      className={clsx(styles.floatingBar, className)}
      style={posStyle}
      data-vellum={inline ? undefined : true}
      {...rest}
    >
      <span
        className={isDragging ? styles.dragHandleDragging : styles.dragHandle}
        onPointerDown={handleDragStart}
        data-vellum-allow-propagate
      >
        <DragHandle />
      </span>
      {children}
    </div>
  );
}
