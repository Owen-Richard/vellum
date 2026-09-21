import { useCallback } from 'react';
import { useVellum } from '../context/VellumContext';
import { setAnchorName, removeAnchorName } from '../core/anchors';
import { findElementBySelector } from '../core/selectors';

export function useAnnotationInteraction() {
  const { state, dispatch, selectElement } = useVellum();

  const handleHover = useCallback(
    (annotationId: string, entering: boolean) => {
      const annotation = state.annotations.find(a => a.id === annotationId);
      if (!annotation) return;
      const el = findElementBySelector(annotation.elementSelector);
      if (!el) return;

      if (entering) {
        setAnchorName(el, '--vellum-hover');
        dispatch({ type: 'HOVER_ELEMENT', element: el });
      } else {
        removeAnchorName(el, '--vellum-hover');
        dispatch({ type: 'HOVER_ELEMENT', element: null });
      }
    },
    [state.annotations, dispatch],
  );

  const handleClick = useCallback(
    (annotationId: string) => {
      if (state.editingAnnotationId === annotationId) {
        dispatch({ type: 'CANCEL_ANNOTATION' });
        return;
      }

      const annotation = state.annotations.find(a => a.id === annotationId);
      if (!annotation) return;
      const el = findElementBySelector(annotation.elementSelector);
      if (!el) return;

      removeAnchorName(el, '--vellum-hover');
      selectElement(el);
    },
    [state.annotations, state.editingAnnotationId, dispatch, selectElement],
  );

  return { handleHover, handleClick };
}
