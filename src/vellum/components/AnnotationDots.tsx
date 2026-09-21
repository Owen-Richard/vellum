import { useMemo, useRef } from 'react';
import clsx from 'clsx';
import { useVellum } from '../context/VellumContext';
import { useAnnotationInteraction } from '../hooks/useAnnotationInteraction';
import { useDisplayToggle } from '../hooks/useDisplayToggle';
import { useTagColorMap } from '../hooks/useTagColorMap';
import { resolveTagColor, isExcludedByTagFilter, contrastTextColor } from '../core/tags';
import { findElementBySelector } from '../core/selectors';
import { isElementHidden } from '../core/visibility';
import { summarizeCssEdits } from '../core/cssEdits';
import styles from './AnnotationDots.module.css';

export function AnnotationDots() {
  const { state, treeRevision } = useVellum();
  const { handleHover, handleClick } = useAnnotationInteraction();
  const containerRef = useRef<HTMLDivElement>(null);

  const mountedAnnotations = useMemo(
    () =>
      state.annotations.filter(a => {
        const el = findElementBySelector(a.elementSelector);
        return el != null && !isElementHidden(el);
      }),
    [state.annotations, treeRevision],
  );

  useDisplayToggle(containerRef, mountedAnnotations.length > 0 && state.dotsVisible);

  const tagColorMap = useTagColorMap(state.tags);

  return (
    <div ref={containerRef} className={styles.container} data-vellum>
      {mountedAnnotations.map((annotation, index) => {
        const tagColor = resolveTagColor(tagColorMap, annotation);
        const excluded = isExcludedByTagFilter(annotation, state.activeTagFilter);
        return (
          <div
            key={annotation.id}
            role="button"
            tabIndex={excluded ? -1 : 0}
            aria-label={`Annotation ${index + 1}`}
            onKeyDown={event => {
              if (!excluded && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                handleClick(annotation.id);
              }
            }}
            className={clsx(styles.dot, excluded && styles.dotFiltered)}
            style={
              {
                positionAnchor: `--vellum-dot-${annotation.id}`,
                backgroundColor: tagColor ?? undefined,
                color: tagColor ? contrastTextColor(tagColor) : '#ffffff',
              } as React.CSSProperties
            }
            title={
              annotation.kind === 'comment'
                ? annotation.text
                : summarizeCssEdits(annotation.edits)
            }
            onPointerEnter={excluded ? undefined : () => handleHover(annotation.id, true)}
            onPointerLeave={excluded ? undefined : () => handleHover(annotation.id, false)}
            onClick={excluded ? undefined : () => handleClick(annotation.id)}
          >
            {index + 1}
          </div>
        );
      })}
    </div>
  );
}
