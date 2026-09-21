import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import styles from './PopoverMenu.module.css';

type PopoverMenuProps = {
  /** The trigger element (rendered inline, clicked to toggle menu) */
  children: ReactNode;
  /** Menu content (Buttons, Dividers, any elements) */
  content: ReactNode;
  className?: string;
  /** Where the menu anchors relative to the trigger */
  position?: 'bottom' | 'bottom-end';
  /** Controlled open state. If omitted, managed internally. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Render as part of the host page (no top-layer, no `data-vellum`, manual dismiss, `onClick` trigger). Default `false`. */
  inline?: boolean;
};

export function PopoverMenu({
  children,
  content,
  className,
  position = 'bottom-end',
  open: controlledOpen,
  onOpenChange,
  inline = false,
}: PopoverMenuProps) {
  const rawId = useId();
  const anchorName = `--vellum-menu-${rawId.replace(/:/g, '')}`;
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const setOpen = useCallback((next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  }, [isControlled, onOpenChange]);

  // Sync popover visibility with state (top-layer mode only)
  useEffect(() => {
    if (inline) return;
    const el = menuRef.current;
    if (!el) return;
    const currentlyOpen = el.matches(':popover-open');
    if (isOpen && !currentlyOpen) {
      el.showPopover();
    } else if (!isOpen && currentlyOpen) {
      el.hidePopover();
    }
  }, [isOpen, inline]);

  // Set anchor names via JS (dynamic IDs)
  useEffect(() => {
    triggerRef.current?.style.setProperty('anchor-name', anchorName);
    menuRef.current?.style.setProperty('position-anchor', anchorName);
  }, [anchorName, isOpen]);

  // Listen to browser's toggle event for auto-dismiss sync (top-layer mode only)
  useEffect(() => {
    if (inline) return;
    const el = menuRef.current;
    if (!el) return;
    const handleToggle = (e: Event) => {
      const toggleEvent = e as ToggleEvent;
      const nowOpen = toggleEvent.newState === 'open';
      if (nowOpen !== isOpen) {
        setOpen(nowOpen);
      }
    };
    el.addEventListener('toggle', handleToggle);
    return () => el.removeEventListener('toggle', handleToggle);
  }, [isOpen, setOpen, inline]);

  // Manual outside-click + Escape dismiss for inline mode
  useEffect(() => {
    if (!inline || !isOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [inline, isOpen, setOpen]);

  const handleTriggerClick = useCallback(() => {
    setOpen(!isOpen);
  }, [isOpen, setOpen]);

  const positionClass = position === 'bottom-end' ? styles.positionBottomEnd : styles.positionBottom;

  return (
    <>
      <div
        ref={triggerRef}
        className={styles.trigger}
        onClick={handleTriggerClick}
        data-vellum={inline ? undefined : true}
      >
        {children}
      </div>
      {(!inline || isOpen) && (
        <div
          ref={menuRef}
          popover={inline ? undefined : 'auto'}
          className={clsx(
            styles.menu,
            positionClass,
            inline && styles.menuInline,
            className,
          )}
          data-vellum={inline ? undefined : true}
        >
          {content}
        </div>
      )}
    </>
  );
}
