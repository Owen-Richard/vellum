/**
 * Returns true when the element is not rendered to the user — covers
 * `display: none`, `visibility: hidden`, ancestor visibility, and elements
 * detached from layout. Uses the modern `checkVisibility` API when available
 * and falls back to `offsetParent` + `getClientRects` otherwise.
 *
 * Triggers a style/layout flush; callers should batch where possible.
 *
 * TODO(perf): Each call forces layout. Current call sites that hit this
 * per-element in a render pass:
 *   - `core/layerTree.ts` `buildTree` — once per host fiber (already pruned
 *     by `parentHidden` short-circuit, but still O(visible nodes)).
 *   - `components/AnnotationDots.tsx` — once per annotation per render.
 *   - `components/AnnotationPopover.tsx` — once per render when annotating.
 * For deep trees or many annotations this can stall paint. Mitigations to
 * consider when it becomes measurable:
 *   - Pass a per-render `WeakMap<Element, boolean>` cache through `buildTree`
 *     so the same element reached via multiple paths is checked once.
 *   - Lift a single visibility pass to a higher-level `useMemo` keyed on
 *     `treeRevision` and have downstream consumers read from that.
 */
export function isElementHidden(el: Element): boolean {
  const withCheckVisibility = el as Element & {
    checkVisibility?: (opts?: {
      checkOpacity?: boolean;
      checkVisibilityCSS?: boolean;
      contentVisibilityAuto?: boolean;
    }) => boolean;
  };
  if (typeof withCheckVisibility.checkVisibility === 'function') {
    try {
      return !withCheckVisibility.checkVisibility({ checkVisibilityCSS: true });
    } catch {
      // fall through to legacy path
    }
  }
  if (el instanceof HTMLElement) {
    if (el.offsetParent !== null) return false;
    // <body>, <html>, and position:fixed elements have null offsetParent
    // even when rendered — confirm via client rects.
    return el.getClientRects().length === 0;
  }
  // SVG and other non-HTML elements: fall back to client rects.
  return el.getClientRects().length === 0;
}
