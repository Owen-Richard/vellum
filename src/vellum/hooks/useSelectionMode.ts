import { useEffect, useRef, type Dispatch } from 'react';
import type { VellumState, VellumAction } from '../types/vellum';
import { setAnchorName, removeAnchorName } from '../core/anchors';

/**
 * Element selection picker. While `mode === 'selecting'`, every pointer/click
 * on the page is consumed and routed through Vellum's selection flow. The only
 * element subtree allowed to behave normally is `[data-vellum-toolbar]` (so the
 * user can still click the toolbar to exit select mode).
 *
 * All other UI — including Vellum's own panels, popovers, and dialogs — is
 * selectable. Nothing else in the page receives clicks.
 */
export function useSelectionMode(
  state: VellumState,
  dispatch: Dispatch<VellumAction>,
  selectElement: (el: HTMLElement) => void,
) {
  const prevHoveredRef = useRef<HTMLElement | null>(null);
  const selectElementRef = useRef(selectElement);
  selectElementRef.current = selectElement;

  useEffect(() => {
    if (state.mode !== 'selecting') {
      if (prevHoveredRef.current) {
        removeAnchorName(prevHoveredRef.current, '--vellum-hover');
        prevHoveredRef.current = null;
      }
      return;
    }

    const style = document.createElement('style');
    style.setAttribute('data-vellum-selecting', '');
    style.textContent = '*, *::before, *::after { cursor: crosshair !important; }';
    document.head.appendChild(style);

    const isExcluded = (el: HTMLElement | null) =>
      !!el?.closest?.('[data-vellum-toolbar]');

    const handleMove = (e: PointerEvent) => {
      const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (!target || isExcluded(target)) return;

      if (target !== prevHoveredRef.current) {
        if (prevHoveredRef.current) {
          removeAnchorName(prevHoveredRef.current, '--vellum-hover');
        }
        setAnchorName(target, '--vellum-hover');
        prevHoveredRef.current = target;
        dispatch({ type: 'HOVER_ELEMENT', element: target });
      }
    };

    const handleClick = (e: MouseEvent) => {
      if (isExcluded(e.target as HTMLElement | null)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const el = prevHoveredRef.current;
      if (!el) return;

      removeAnchorName(el, '--vellum-hover');
      prevHoveredRef.current = null;

      selectElementRef.current(el);
    };

    // Swallow every pointer-down family event outside the toolbar so neither
    // host-app dismiss handlers nor target elements' own onClick can fire.
    const blockEvent = (e: Event) => {
      if (isExcluded(e.target as HTMLElement | null)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    document.addEventListener('pointermove', handleMove, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('mousedown', blockEvent, true);
    document.addEventListener('pointerdown', blockEvent, true);
    document.addEventListener('touchstart', blockEvent, true);
    document.addEventListener('contextmenu', blockEvent, true);

    return () => {
      document.removeEventListener('pointermove', handleMove, true);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('mousedown', blockEvent, true);
      document.removeEventListener('pointerdown', blockEvent, true);
      document.removeEventListener('touchstart', blockEvent, true);
      document.removeEventListener('contextmenu', blockEvent, true);
      style.remove();
      if (prevHoveredRef.current) {
        removeAnchorName(prevHoveredRef.current, '--vellum-hover');
        prevHoveredRef.current = null;
      }
    };
  }, [state.mode, dispatch]);
}
