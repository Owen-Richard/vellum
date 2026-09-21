import type { Annotation, AnnotationTag } from '../types/vellum';

export const TAG_COLOR_PALETTE = [
  '#EF4444',
  '#8B5CF6',
  '#22C55E',
  '#F59E0B',
  '#06b6d4',
  '#ec4899',
  '#f97316',
  '#14b8a6',
  '#6366f1',
  '#a855f7',
];

export const DEFAULT_TAGS: AnnotationTag[] = [
  { id: 'bug', label: 'Bug', color: TAG_COLOR_PALETTE[0] },
  { id: 'context', label: 'Context', color: TAG_COLOR_PALETTE[1] },
  { id: 'a11y', label: 'A11y', color: TAG_COLOR_PALETTE[2] },
  { id: 'for-dev', label: 'For Dev', color: TAG_COLOR_PALETTE[3] },
];

/** Returns '#000000' or '#ffffff' based on which has better contrast with the given hex color. */
export function contrastTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  // Higher threshold than WCAG's 0.179 to favour white text on saturated mid-tones,
  // which reads better at the small sizes used for annotation badges.
  return luminance > 0.35 ? '#000000' : '#ffffff';
}

/** Build a Map from tag ID to color for O(1) lookups. */
export function buildTagColorMap(tags: AnnotationTag[]): Map<string, string> {
  return new Map(tags.map(t => [t.id, t.color]));
}

/** Resolve the color for an annotation's tag, or undefined if untagged/orphaned. */
export function resolveTagColor(
  tagColorMap: Map<string, string>,
  annotation: Annotation,
): string | undefined {
  if (annotation.kind !== 'comment') return undefined;
  return annotation.tag ? tagColorMap.get(annotation.tag) : undefined;
}

export const UNTAGGED_FILTER_ID = '__untagged__';

/** Check whether an annotation is excluded by the active tag filter. */
export function isExcludedByTagFilter(
  annotation: Annotation,
  activeTagFilter: string[],
): boolean {
  if (activeTagFilter.length === 0) return false;
  // css-edit annotations don't carry tags; treat them as "untagged" for the
  // purposes of filtering so the filter behavior stays predictable.
  const tag = annotation.kind === 'comment' ? annotation.tag : undefined;
  if (!tag) {
    return !activeTagFilter.includes(UNTAGGED_FILTER_ID);
  }
  return !activeTagFilter.includes(tag);
}
