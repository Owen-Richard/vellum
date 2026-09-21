import clsx from 'clsx';
import {
  useId,
  useRef,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { usePopoverToggle } from '../hooks/usePopoverToggle';
import popoverStyles from '../styles/popover.module.css';
import { Kbd } from './Kbd';
import styles from './Tooltip.module.css';

type TooltipProps = {
  text: string;
  shortcut?: string;
  forceShow?: boolean;
  maxWidth?: number;
  children: ReactNode;
  className?: string;
};

export function Tooltip({
  text,
  shortcut,
  forceShow,
  maxWidth,
  children,
  className,
}: TooltipProps) {
  const rawId = useId();
  const anchorName = `--vellum-tip-${rawId.replace(/:/g, '')}`;
  const [hovered, setHovered] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visible = forceShow || hovered;
  usePopoverToggle(popoverRef, visible);

  useEffect(() => {
    triggerRef.current?.style.setProperty('anchor-name', anchorName);
    popoverRef.current?.style.setProperty('position-anchor', anchorName);
  }, [anchorName]);

  const handleEnter = useCallback(() => {
    timerRef.current = setTimeout(() => setHovered(true), 500);
  }, []);

  const handleLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHovered(false);
  }, []);

  useEffect(() => {
    if (forceShow && timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [forceShow]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <>
      <div
        ref={triggerRef}
        className={clsx(styles.trigger, className)}
        onPointerEnter={handleEnter}
        onPointerLeave={handleLeave}
        data-vellum
      >
        {children}
      </div>
      <div
        ref={popoverRef}
        popover="manual"
        className={clsx(styles.tooltip, popoverStyles.popoverTop)}
        data-vellum
        style={maxWidth ? { maxWidth, whiteSpace: 'normal' } : undefined}
      >
        <span>{text}</span>
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </div>
    </>
  );
}
