import { useMemo, useRef, useEffect } from 'react';
import { getDisplayName } from 'bippy';
import { useVellum } from '../context/VellumContext';
import { useDisplayToggle } from '../hooks/useDisplayToggle';
import { useTagColorMap } from '../hooks/useTagColorMap';
import { findElementBySelector } from '../core/selectors';
import { findOwnerComponentFromElement } from '../core/fibers';
import styles from './SelectionHighlight.module.css';

const MIN_RADIUS = 2;

function clampRadius(value: string): string {
  const px = parseFloat(value);
  if (isNaN(px)) return `${MIN_RADIUS}px`;
  return `${Math.max(MIN_RADIUS, px)}px`;
}

function applyBorderRadius(overlay: HTMLElement | null, target: HTMLElement | null) {
  if (!overlay) return;
  if (!target) {
    overlay.style.borderRadius = '';
    return;
  }
  const cs = getComputedStyle(target);
  overlay.style.borderRadius = [
    cs.borderTopLeftRadius,
    cs.borderTopRightRadius,
    cs.borderBottomRightRadius,
    cs.borderBottomLeftRadius,
  ]
    .map(clampRadius)
    .join(' ');
}

export function SelectionHighlight() {
  const { state, treeRevision } = useVellum();
  const hoverRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);
  const hoverLabelRef = useRef<HTMLDivElement>(null);

  const showHover = !!state.hoveredElement;
  const showSelected = state.mode === 'annotating' && !!state.selectedElement;
  const showHoverLabel = state.mode === 'selecting' && !!state.hoveredElement;

  useDisplayToggle(hoverRef, showHover);
  useDisplayToggle(selectedRef, showSelected);
  useDisplayToggle(hoverLabelRef, showHoverLabel);

  useEffect(() => {
    applyBorderRadius(hoverRef.current, state.hoveredElement);
  }, [state.hoveredElement]);

  useEffect(() => {
    applyBorderRadius(selectedRef.current, state.selectedElement);
  }, [state.selectedElement]);

  const tagColorMap = useTagColorMap(state.tags);

  // Build a reverse map from element → annotation for hover lookups
  const elementAnnotationMap = useMemo(() => {
    const map = new Map<HTMLElement, string | undefined>();
    for (const a of state.annotations) {
      const el = findElementBySelector(a.elementSelector);
      if (el && !map.has(el)) {
        map.set(el, a.kind === 'comment' ? a.tag : undefined);
      }
    }
    return map;
  }, [state.annotations, treeRevision]);

  const hoverTagId = state.hoveredElement
    ? elementAnnotationMap.get(state.hoveredElement)
    : undefined;
  const hoverTagColor = hoverTagId ? tagColorMap.get(hoverTagId) : undefined;

  const editingAnnotation = state.editingAnnotationId
    ? state.annotations.find(a => a.id === state.editingAnnotationId)
    : null;
  const selectedTagColor =
    editingAnnotation && editingAnnotation.kind === 'comment' && editingAnnotation.tag
      ? tagColorMap.get(editingAnnotation.tag)
      : undefined;

  const hoverLabel = useMemo(() => {
    if (!state.hoveredElement) return '';
    const tag = state.hoveredElement.tagName.toLowerCase();
    const ownerFiber = findOwnerComponentFromElement(state.hoveredElement);
    const componentName = ownerFiber ? getDisplayName(ownerFiber.type) : null;
    return componentName ? `${componentName}.${tag}` : tag;
  }, [state.hoveredElement]);

  return (
    <>
      <div
        ref={hoverRef}
        className={styles.hover}
        style={
          hoverTagColor
            ? { borderColor: hoverTagColor, backgroundColor: `${hoverTagColor}1A` }
            : undefined
        }
      />
      {hoverLabel && (
        <div
          ref={hoverLabelRef}
          className={styles.hoverLabel}
        >
          {hoverLabel}
        </div>
      )}
      <div
        ref={selectedRef}
        className={styles.selected}
        style={
          selectedTagColor
            ? { borderColor: selectedTagColor, backgroundColor: `${selectedTagColor}1A` }
            : undefined
        }
      />
    </>
  );
}
