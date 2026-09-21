import { useMemo } from 'react';
import { buildTagColorMap } from '../core/tags';
import type { AnnotationTag } from '../types/vellum';

export function useTagColorMap(tags: AnnotationTag[]) {
  return useMemo(() => buildTagColorMap(tags), [tags]);
}
