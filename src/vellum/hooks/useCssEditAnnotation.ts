import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useVellum } from '../context/VellumContext';
import { getUniqueSelector } from '../core/selectors';
import { setAnchorName } from '../core/anchors';
import {
  captureBaseSnapshot,
  computeEdits,
  formatBaseSnapshotText,
  parseEditorBuffer,
  type BaseSnapshot,
} from '../core/cssEdits';
import type { AppliedDecl } from '../core/elementStyles';
import type { CssEditAnnotation } from '../types/vellum';

/**
 * Wires the PropertiesPanel "Applied" textarea to an `'css-edit'` annotation.
 *
 * Lookup is by `getUniqueSelector(element)` — the same persistent identity
 * used by comment annotations. At most one css-edit annotation per element.
 *
 * The "base snapshot" — the frozen view of what the element looked like
 * before any edits — is captured at the moment of selection (via the
 * `frozenBase` memo) and reused for every subsequent diff. This ensures the
 * displayed initial buffer text and the diff baseline come from the same
 * live-cascade read, avoiding ghost edits when the cascade is in transition
 * (e.g. Vellum's selecting-mode cursor still being applied).
 *
 * `saveEditorBuffer` commits on every change so closing the extension cannot
 * drop a pending edit. It reconciles to one of three outcomes:
 *  - buffer matches base -> delete the annotation if it exists
 *  - buffer is a non-empty diff and an annotation exists -> update in place
 *  - buffer is a non-empty diff and no annotation exists -> create a new one
 *
 * `applied` is the caller-computed list of winning declarations for
 * `selectedElement` (typically derived from a shared `CascadeResult`). The
 * hook reads it only on first selection of each element — see `frozenBaseRef`.
 */
export function useCssEditAnnotation(
  selectedElement: HTMLElement | null,
  applied: AppliedDecl[],
) {
  const { state, dispatch } = useVellum();

  const selector = useMemo(
    () => (selectedElement ? getUniqueSelector(selectedElement) : null),
    [selectedElement],
  );

  const existing = useMemo(() => {
    if (!selector) return undefined;
    return state.annotations.find(
      a => a.kind === 'css-edit' && a.elementSelector === selector,
    ) as CssEditAnnotation | undefined;
  }, [state.annotations, selector]);

  // Freeze the base snapshot at the moment the element is first selected,
  // and keep it stable for the entire selection lifetime. If we re-derived
  // this from `existing?.id` (or from a fresh `captureBaseSnapshot` call),
  // a Reset would recapture *after* our inline overrides have already been
  // applied — making the "original" baseline reflect the user's edits.
  //
  // Precedence: persisted annotation's snapshot > first fresh capture for
  // this element instance.
  const frozenBaseRef = useRef<{
    el: HTMLElement | null;
    snapshot: BaseSnapshot;
  }>({ el: null, snapshot: {} });

  // Lazy-init pattern. Safe under StrictMode's double-invoke because the
  // second pass sees the same `selectedElement` and writes the same snapshot.
  if (selectedElement && frozenBaseRef.current.el !== selectedElement) {
    frozenBaseRef.current = {
      el: selectedElement,
      snapshot: existing?.baseSnapshot ?? captureBaseSnapshot(applied),
    };
  }
  const frozenBase: BaseSnapshot =
    selectedElement && frozenBaseRef.current.el === selectedElement
      ? frozenBaseRef.current.snapshot
      : {};

  const initialBuffer = existing
    ? existing.editorBuffer
    : formatBaseSnapshotText(frozenBase);

  // Mirror the latest annotations into a ref so `saveEditorBuffer` can read
  // them without listing `state.annotations` as a dep (which would recreate
  // the callback on every keystroke-induced state change). Same pattern as
  // `annotationsRef` in VellumContext.
  const annotationsRef = useRef(state.annotations);
  useEffect(() => {
    annotationsRef.current = state.annotations;
  });

  const saveEditorBuffer = useCallback(
    (buffer: string) => {
      if (!selectedElement || !selector) return;
        const current = annotationsRef.current.find(
          a => a.kind === 'css-edit' && a.elementSelector === selector,
        ) as CssEditAnnotation | undefined;

        const parsed = parseEditorBuffer(buffer);
        // Re-read the frozen base from the ref so a delayed-fire timer still
        // sees the snapshot for the element this callback was created for.
        const base =
          current?.baseSnapshot ??
          (frozenBaseRef.current.el === selectedElement
            ? frozenBaseRef.current.snapshot
            : {});
        const edits = computeEdits(base, parsed);

        if (edits.length === 0) {
          if (current) {
            dispatch({ type: 'DELETE_ANNOTATION', id: current.id });
          }
          return;
        }

        const id = current?.id ?? crypto.randomUUID().slice(0, 8);
        if (!current) {
          setAnchorName(selectedElement, `--vellum-dot-${id}`);
        }

        const next: CssEditAnnotation = {
          id,
          kind: 'css-edit',
          elementSelector: selector,
          timestamp: current?.timestamp ?? Date.now(),
          editorBuffer: buffer,
          baseSnapshot: base,
          edits,
        };
        dispatch({ type: 'UPSERT_CSS_EDIT', annotation: next });
    },
    [selectedElement, selector, dispatch],
  );

  return { existing, initialBuffer, saveEditorBuffer };
}
