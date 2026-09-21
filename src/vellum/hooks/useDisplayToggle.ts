import { useEffect } from 'react';

/**
 * Toggles an element's visibility via display property.
 * Used for elements inside VellumLayer that no longer use popover="manual" directly.
 */
export function useDisplayToggle(ref: React.RefObject<HTMLElement | null>, visible: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.display = visible ? '' : 'none';
  }, [ref, visible]);
}
