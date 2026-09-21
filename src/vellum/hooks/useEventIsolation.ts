import { useEffect } from 'react';

/**
 * Keeps Vellum UI usable on top of host pages whose popovers/menus dismiss on
 * outside interaction (Fluent UI, Radix, native `popover="auto"`, etc.).
 *
 * Two tiers of isolation, both registered on `document` in the capture phase:
 *
 * 1. **Pointer-down family** (`mousedown`, `pointerdown`, `touchstart`,
 *    `contextmenu`) — `stopImmediatePropagation()` is called on any path
 *    through `[data-vellum]` so host dismiss listeners (mostly capture-phase,
 *    registered after us) never fire. Inside the toolbar subtree
 *    (`[data-vellum-toolbar]`), `preventDefault()` is also called so the
 *    native popover light-dismiss algorithm — which respects
 *    `defaultPrevented`, not propagation — skips too. This is what "freezes"
 *    open popovers (both Vellum's and the host's) while the user clicks
 *    toolbar buttons.
 *
 * 2. **Click** — only blocked inside `[data-vellum-toolbar]`. Fluent UI's
 *    `useOnClickOutside` uses `click` as its primary outside-click signal, so
 *    a toolbar click would otherwise dismiss any open Fluent popover.
 *    Because document-capture stops propagation before React's root listener
 *    sees the event, toolbar buttons must run their handler in `onPointerUp`
 *    (not `onClick`). Non-toolbar Vellum surfaces keep standard `onClick`.
 *
 * Escape hatch: `[data-vellum-allow-propagate]` skips all isolation for that
 * element's path. Used by the FloatingBar drag handle so its `onPointerDown`
 * reaches React.
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
      document.addEventListener(type, handler, true);
    }
    document.addEventListener('click', handler, true);

    return () => {
      for (const type of POINTER_EVENTS) {
        document.removeEventListener(type, handler, true);
      }
      document.removeEventListener('click', handler, true);
    };
  }, []);
}
