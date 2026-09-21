import type { DisplayFilters } from './filters/types';
import { IDENTITY_DISPLAY_FILTERS } from './filters/compose';

export type ElementDetail = 'short' | 'medium' | 'full' | 'react';

interface DescribeOptions {
  /** Detail level for the description */
  detail: ElementDetail;
  /** Display filters to apply. Defaults to identity (no filtering). */
  filters?: DisplayFilters;
  /** React component name for 'react' detail level. */
  componentName?: string | null;
}

/**
 * Generates a human-readable identifier for a DOM element at various detail levels.
 *
 * - 'short': `tag "text…"` — compact display (popover, list items)
 * - 'medium': `tag.class1.class2` — properties panel, layer tree, sidebar
 * - 'full': `tag.classes, N children, "text preview"` — reference context, clipboard
 * - 'react': `ComponentName > tag.classes, N children, "text"` — includes React component prefix
 */
export function describeElement(element: Element, options: DescribeOptions): string {
  const { detail, filters = IDENTITY_DISPLAY_FILTERS, componentName } = options;

  const tag = element.tagName.toLowerCase();

  switch (detail) {
    case 'short':
      return formatShort(element, tag);
    case 'medium':
      return formatMedium(element, tag, filters);
    case 'full':
      return formatFull(element, tag, filters);
    case 'react': {
      const full = formatFull(element, tag, filters);
      return componentName ? `${componentName} > ${full}` : full;
    }
  }
}

/** tag "text…" */
function formatShort(element: Element, tag: string): string {
  const text = getTextPreview(element, 30);
  if (text) {
    return `${tag} "${text}"`;
  }
  return tag;
}

/** tag.class1.class2 */
function formatMedium(element: Element, tag: string, filters: DisplayFilters): string {
  const classes = getFilteredClasses(element, filters);
  const classSegment = classes.length > 0 ? '.' + classes.join('.') : '';
  return `${tag}${classSegment}`;
}

/** tag.classes, N children, "text preview" */
function formatFull(element: Element, tag: string, filters: DisplayFilters): string {
  const classes = getFilteredClasses(element, filters);
  const classSegment = classes.length > 0 ? '.' + classes.join('.') : '';
  const childCount = element.children.length;

  const parts: string[] = [`${tag}${classSegment}`];

  if (childCount > 0) {
    parts.push(`${childCount} child${childCount === 1 ? '' : 'ren'}`);
  }

  const text = getTextPreview(element, 80);
  if (text) {
    parts.push(`"${text}"`);
  }

  return parts.join(', ');
}

/** Get element classes after applying transformClassName filter. */
function getFilteredClasses(element: Element, filters: DisplayFilters): string[] {
  const result: string[] = [];
  for (const cls of element.classList) {
    const transformed = filters.transformClassName(cls);
    if (transformed !== null) {
      result.push(transformed);
    }
  }
  return result;
}

/** Get a truncated text preview from an element. */
function getTextPreview(element: Element, maxLength: number): string {
  const raw =
    element instanceof HTMLElement
      ? (element.innerText?.trim() ?? '')
      : (element.textContent?.trim() ?? '');
  if (!raw) return '';
  const normalized = raw.replace(/\s+/g, ' ');
  return normalized.length > maxLength
    ? normalized.slice(0, maxLength) + '…'
    : normalized;
}
