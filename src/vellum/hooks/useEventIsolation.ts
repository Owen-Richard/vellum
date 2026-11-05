import { useEffect } from 'react';

/**
 * Window capture runs before host document dismiss handlers, even if the host
 * registered first. Toolbar clicks cannot reach React, so toolbar actions use
 * onPointerUp. The drag handle opts out to receive its onPointerDown.
 * Native popover light-dismiss cannot be cancelled by event isolation.
 */
export function useEventIsolation() {
  useEffect(() => {
    const POINTER_EVENTS = ['mousedown', 'pointerdown', 'touchstart', 'contextmenu'] as const;

    const handler = (e: Event) => {
      let hasVellum = false;
      let hasToolbar = false;
      for (const node of e.composedPath()) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.hasAttribute('data-vellum-allow-propagate')) return;
        if (node.hasAttribute('data-vellum-toolbar')) hasToolbar = true;
        if (node.hasAttribute('data-vellum')) hasVellum = true;
      }

      if (e.type === 'click') {
        if (hasToolbar) e.stopImmediatePropagation();
        return;
      }

      if (hasToolbar) {
        e.preventDefault();
        e.stopImmediatePropagation();
      } else if (hasVellum) {
        e.stopImmediatePropagation();
      }
    };

    for (const type of POINTER_EVENTS) {
      window.addEventListener(type, handler, true);
    }
    window.addEventListener('click', handler, true);

    return () => {
      for (const type of POINTER_EVENTS) {
        window.removeEventListener(type, handler, true);
      }
      window.removeEventListener('click', handler, true);
    };
  }, []);
}
