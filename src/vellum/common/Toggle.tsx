import clsx from 'clsx';
import styles from './Toggle.module.css';

type ToggleProps = {
  checked: boolean;
  onChange: () => void;
  className?: string;
};

export function Toggle({ checked, onChange, className }: ToggleProps) {
  return (
    <div
      className={clsx(checked ? styles.trackActive : styles.track, className)}
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange(); } }}
    >
      <div className={styles.knob} />
    </div>
  );
}
