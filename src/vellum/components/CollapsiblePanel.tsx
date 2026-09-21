import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronRight } from 'lucide-react';
import styles from './EditorPanel.module.css';

interface CollapsiblePanelProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * Editor sidebar panel with a clickable header that toggles its body.
 * Header chevron flips between right (closed) and down (open). When closed,
 * the panel collapses to its header height; when open, it shares remaining
 * flex space with its sibling panels.
 */
export function CollapsiblePanel({
  title,
  defaultOpen = true,
  children,
}: CollapsiblePanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={clsx(styles.panel, !open && styles.panelCollapsed)}>
      <button
        className={styles.panelHeader}
        onClick={() => setOpen(prev => !prev)}
        data-vellum
      >
        <span className={styles.panelToggle}>
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span>{title}</span>
      </button>
      {open && <div className={styles.panelBody}>{children}</div>}
    </div>
  );
}
