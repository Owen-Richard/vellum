import { useRef, useEffect, useCallback, type ReactNode } from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { Button } from './Button';
import styles from './Dialog.module.css';

type NativeDialogProps = React.DialogHTMLAttributes<HTMLDialogElement>;

type DialogProps = NativeDialogProps &
  Required<Pick<NativeDialogProps, 'open' | 'onClose'>> & {
    header?: ReactNode;
    footer?: ReactNode;
    /** Render as part of the host page (non-modal `dialog.show()`, no top-layer, no `data-vellum`, `onClick` close). Default `false`. */
    inline?: boolean;
  };

export function Dialog({
  open,
  onClose,
  header,
  footer,
  className,
  children,
  inline = false,
  ...rest
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      if (inline) el.show();
      else el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open, inline]);

  const handleCloseClick = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  // Note: unmounting when closed means the effect above can't call showModal() on the first open —
  // the dialog briefly renders non-modally before the post-mount effect promotes it. Acceptable for now.
  if (!open) return null;

  return (
    <>
      {inline && (
        <div
          className={styles.inlineBackdrop}
          onClick={handleCloseClick}
          aria-hidden="true"
        />
      )}
      <dialog
        ref={dialogRef}
        className={clsx(styles.dialog, inline && styles.dialogInline, className)}
        closedby={inline ? 'closerequest' : 'any'}
        onClose={onClose}
        data-vellum={inline ? undefined : true}
        {...rest}
      >
        {header && (
          <header className={styles.header}>
            <span className={styles.headerText}>{header}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCloseClick}
              aria-label="Close"
            >
              <X size={14} />
            </Button>
          </header>
        )}
        <main className={styles.body}>{children}</main>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </dialog>
    </>
  );
}
