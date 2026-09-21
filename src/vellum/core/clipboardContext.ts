import type { Annotation, AnnotationTag } from '../types/vellum';
import type { ComposedFilters } from './filters/types';
import { IDENTITY_FILTERS } from './filters/compose';
import { findElementBySelector } from './selectors';
import { describeElement } from './describeElement';
import { transformSnippetWithContext } from './reference/context';
import { formatCssEditsDiff } from './cssEdits';

/**
 * Formats a single annotation block for clipboard output.
 *
 * Output format:
 * ```
 * user comment
 * tag: Design Feedback
 *
 * Button > button.medium.button, "Create agent"
 * in Button (/packages/foundry-ds/src/Button/Button.tsx:9)
 * in BasicPage (/packages/foundry-ds/src/Pages/BasicPage.tsx:13)
 * ```
 */
export function formatAnnotationBlock(
  text: string,
  tagLabel: string | undefined,
  context: string,
): string {
  const header: string[] = [];
  if (text) header.push(text);
  if (tagLabel) header.push(`tag: ${tagLabel}`);
  const parts: string[] = [];
  if (header.length > 0) parts.push(header.join('\n'));
  if (context) parts.push(context);
  return parts.join('\n\n');
}

/**
 * Build the clipboard block for a single annotation. Comment annotations
 * render their text + tag + element context; css-edit annotations render
 * a header line + diff block + element context.
 */
export async function formatAnnotationForClipboard(
  a: Annotation,
  filters: ComposedFilters = IDENTITY_FILTERS,
  tags: AnnotationTag[] = [],
): Promise<string> {
  const el = findElementBySelector(a.elementSelector);
  if (a.kind === 'css-edit') {
    // Selector for the diff block header. Use `describeElement` so we get
    // the same tag.class.class form the panel and annotation list use, not
    // the full ancestry path (which lives below in the context block).
    const selector = el
      ? describeElement(el, { detail: 'medium', filters })
      : a.elementSelector;
    const diff = formatCssEditsDiff(selector, a.edits);
    const context = el ? await transformSnippetWithContext(el, filters) : '';
    // The diff itself documents what changed — no need for a redundant
    // "3 CSS edits: foo, bar" line in front of it. A short label keeps the
    // block scannable when multiple annotations are concatenated.
    return formatAnnotationBlock('CSS Edits:', undefined, [diff, context].filter(Boolean).join('\n\n'));
  }
  if (!el) return a.text;
  const context = await transformSnippetWithContext(el, filters);
  const tagLabel = a.tag ? tags.find(t => t.id === a.tag)?.label : undefined;
  return formatAnnotationBlock(a.text, tagLabel, context);
}

/**
 * Generates clipboard-ready context for annotations.
 * Each annotation includes the user's comment followed by React component
 * context (element description + source-mapped component ancestry).
 */
export async function clipboardContext(
  annotations: Annotation[],
  filters: ComposedFilters = IDENTITY_FILTERS,
  tags: AnnotationTag[] = [],
): Promise<string> {
  const blocks = await Promise.all(
    annotations.map(a => formatAnnotationForClipboard(a, filters, tags)),
  );
  return blocks.join('\n\n---\n\n');
}
