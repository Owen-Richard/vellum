import type { ReactNode, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Check } from 'lucide-react';
import clsx from 'clsx';
import styles from './Checkbox.module.css';

type CheckboxProps = {
  checked: boolean;
  onChange: () => void;
  id?: string;
  className?: string;
  children: ReactNode;
};

export function Checkbox({ checked, onChange, id, className, children }: CheckboxProps) {
  return (
    <div
      className={clsx(styles.row, className)}
      onClick={onChange}
      onKeyDown={(e: ReactKeyboardEvent) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onChange();
        }
      }}
      role="checkbox"
      aria-checked={checked}
      aria-labelledby={id}
      tabIndex={0}
    >
      <div className={checked ? styles.boxChecked : styles.box}>
        {checked && <Check size={10} strokeWidth={3} aria-hidden="true" />}
      </div>
      {children}
    </div>
  );
}
