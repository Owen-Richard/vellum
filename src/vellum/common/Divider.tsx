import clsx from 'clsx';
import styles from './Divider.module.css';

type DividerProps = {
  className?: string;
  /** Render as a vertical divider that stretches to its container's height. */
  vertical?: boolean;
};

export function Divider({ className, vertical }: DividerProps) {
  return (
    <div
      className={clsx(styles.divider, vertical && styles.vertical, className)}
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
    />
  );
}
