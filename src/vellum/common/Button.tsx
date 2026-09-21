import { forwardRef } from 'react';
import clsx from 'clsx';
import styles from './Button.module.css';

// Intensity — independent of color
type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'ghost';

// Color — independent of intensity
type ButtonIntent = 'info' | 'accent' | 'success' | 'danger';

// Geometry — independent of color and intensity
type ButtonSize = 'icon' | 'sm' | 'md' | 'lg';

// Content alignment — for menu items and full-width rows
type ButtonAlign = 'start' | 'center' | 'end';

type ButtonProps = {
  /** Visual intensity. `primary` implies `intent="accent"` unless intent is set. Default `secondary`. */
  variant?: ButtonVariant;
  /** Color treatment. Default `info` (or `accent` when `variant="primary"`). */
  intent?: ButtonIntent;
  /** Geometry. `icon` is a 24×24 square; `sm`/`md`/`lg` are text buttons. Default `md`. */
  size?: ButtonSize;
  /** Content alignment. `start` / `end` make the button full-width with content at that edge. Default `center`. */
  align?: ButtonAlign;
  /** Selected state — renders as a filled accent fill regardless of variant/intent. */
  active?: boolean;
  /** Two-stage confirm state — tinted now, solid intent color on next hover. */
  armed?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'secondary',
      intent,
      size = 'md',
      align = 'center',
      active,
      armed,
      className,
      ...rest
    },
    ref,
  ) {
    // `primary` implies `accent` unless the caller specifies an intent.
    const resolvedIntent: ButtonIntent =
      intent ?? (variant === 'primary' ? 'accent' : 'info');

    return (
      <button
        ref={ref}
        type="button"
        className={clsx(
          styles.base,
          styles[`intent_${resolvedIntent}`],
          styles[`variant_${variant}`],
          styles[`size_${size}`],
          align !== 'center' && styles[`align_${align}`],
          active && styles.active,
          armed && styles.armed,
          className,
        )}
        {...rest}
      />
    );
  },
);
