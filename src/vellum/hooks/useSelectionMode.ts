import { useEffect, useRef, type Dispatch } from 'react';
import type { VellumState, VellumAction } from '../types/vellum';
import { setAnchorName, removeAnchorName } from '../core/anchors';

/**
 * Element selection picker. While `mode === 'selecting'`, every pointer/click
 * on the page is consumed and routed through Vellum's selection flow. The only
 * element subtree allowed to behave normally is `[data-vellum]` (so the
 * user can still use Vellum's controls to exit select mode).
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
      !!el?.closest?.('[data-vellum]');

    const htmlTarget = (target: EventTarget | null): HTMLElement | null => {
      let element = target instanceof Element ? target : null;
      while (element && !(element instanceof HTMLElement)) element = element.parentElement;
      return element instanceof HTMLElement ? element : null;
    };

    const handleMove = (e: PointerEvent) => {
      const target = htmlTarget(document.elementFromPoint(e.clientX, e.clientY));
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

      const target = htmlTarget(e.target);
      const el = target ?? prevHoveredRef.current;
      if (!el) return;

      removeAnchorName(el, '--vellum-hover');
      prevHoveredRef.current = null;
      style.remove();
      selectElementRef.current(el);
    };

    // Swallow every pointer-down family event outside Vellum so neither
    // host-app dismiss handlers nor target elements' own onClick can fire.
    const blockEvent = (e: Event) => {
      if (isExcluded(e.target as HTMLElement | null)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    window.addEventListener('pointermove', handleMove, true);
    window.addEventListener('click', handleClick, true);
    window.addEventListener('mousedown', blockEvent, true);
    window.addEventListener('pointerdown', blockEvent, true);
    window.addEventListener('touchstart', blockEvent, true);
    window.addEventListener('contextmenu', blockEvent, true);

    return () => {
      window.removeEventListener('pointermove', handleMove, true);
      window.removeEventListener('click', handleClick, true);
      window.removeEventListener('mousedown', blockEvent, true);
      window.removeEventListener('pointerdown', blockEvent, true);
      window.removeEventListener('touchstart', blockEvent, true);
      window.removeEventListener('contextmenu', blockEvent, true);
      style.remove();
      if (prevHoveredRef.current) {
        removeAnchorName(prevHoveredRef.current, '--vellum-hover');
        prevHoveredRef.current = null;
      }
    };
  }, [state.mode, dispatch]);
}
