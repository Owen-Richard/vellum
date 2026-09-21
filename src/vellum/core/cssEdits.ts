/**
 * CSS edit primitives: capture a base snapshot of an element's applied
 * styles, parse a user-edited buffer, compute the prop-level diff, and apply
 * the diff to the element via inline `style` overrides.
 *
 * Design notes:
 * - The diff is keyed by property name. Order of declarations in the editor
 *   buffer is intentionally NOT preserved in the diff — only the verbatim
 *   buffer text is preserved separately so the textarea can round-trip.
 * - Live application uses inline `el.style.setProperty(...)`. This wins over
 *   most cascade rules (specificity-wise it's [1,0,0,0]). It can be defeated
 *   by `!important` rules; we'll only escalate when the user explicitly types
 *   `!important`.
 * - We snapshot each property's *pre-existing* inline value the first time we
 *   touch it so we can restore correctly when the edit is later removed
 *   (rather than wiping authored inline styles).
 */
import {
  parseBody,
  categorizeProperty,
  GROUP_ORDER,
  type AppliedDecl,
} from './elementStyles';

export type CssDecl = { prop: string; value: string; important: boolean };
/**
 * Snapshot of an element's applied styles at first-edit time. Keyed by prop
 * name; values omit the redundant `prop` field since it's the key.
 */
export type BaseSnapshot = Record<string, { value: string; important: boolean }>;

export type CssEdit =
  | {
      prop: string;
      action: 'add';
      after: string;
      important: boolean;
    }
  | {
      prop: string;
      action: 'change';
      before: string;
      after: string;
      importantBefore: boolean;
      important: boolean;
    }
  | {
      prop: string;
      action: 'remove';
      before: string;
      importantBefore: boolean;
    };

/**
 * Snapshot of every winning declaration as of edit-start time. Takes a
 * pre-computed applied-styles list (typically derived from a `CascadeResult`)
 * so callers can share one cascade walk across multiple consumers.
 */
export function captureBaseSnapshot(applied: AppliedDecl[]): BaseSnapshot {
  const out: BaseSnapshot = {};
  for (const d of applied) {
    out[d.prop] = { value: d.value, important: d.important };
  }
  return out;
}

/**
 * Format a base snapshot into the same grouped/alphabetized text layout as
 * {@link getAppliedStylesText}. Use this to seed an editor textarea so the
 * displayed starting buffer and the diff baseline agree exactly (computing
 * them from independent live-cascade reads can race when the cascade is
 * mid-transition, e.g. when Vellum's selecting-mode cursor is still applied).
 */
export function formatBaseSnapshotText(snapshot: BaseSnapshot): string {
  const grouped = new Map<string, Array<{ prop: string; raw: string }>>();
  for (const g of GROUP_ORDER) grouped.set(g, []);
  for (const prop of Object.keys(snapshot)) {
    const { value, important } = snapshot[prop];
    const raw = `${prop}: ${value}${important ? ' !important' : ''};`;
    const group = categorizeProperty(prop);
    grouped.get(group)!.push({ prop, raw });
  }
  const out: string[] = [];
  for (const g of GROUP_ORDER) {
    const entries = grouped.get(g)!;
    if (entries.length === 0) continue;
    entries.sort((a, b) => a.prop.localeCompare(b.prop));
    if (out.length > 0) out.push('');
    out.push(`/* ${g} */`);
    for (const e of entries) out.push(e.raw);
  }
  return out.join('\n');
}

/**
 * Parse the user-edited textarea into a map of prop -> decl. Skips comments,
 * blank lines, and malformed lines. Last write wins for duplicates.
 */
export function parseEditorBuffer(text: string): Map<string, CssDecl> {
  const items = parseBody(text);
  const out = new Map<string, CssDecl>();
  for (const it of items) {
    if (it.kind !== 'decl') continue;
    out.set(it.prop, { prop: it.prop, value: it.value, important: it.important });
  }
  return out;
}

/**
 * Compute the diff between the base snapshot and the user's edited declarations.
 * - prop present in edited only -> 'add'
 * - prop present in base only -> 'remove'
 * - prop present in both with different value/important -> 'change'
 * - prop present in both with same value/important -> omitted
 */
export function computeEdits(
  base: BaseSnapshot,
  edited: Map<string, CssDecl>,
): CssEdit[] {
  const edits: CssEdit[] = [];
  const seen = new Set<string>();

  for (const [prop, decl] of edited) {
    seen.add(prop);
    const baseDecl = base[prop];
    if (!baseDecl) {
      edits.push({
        prop,
        action: 'add',
        after: decl.value,
        important: decl.important,
      });
    } else if (
      baseDecl.value !== decl.value ||
      baseDecl.important !== decl.important
    ) {
      edits.push({
        prop,
        action: 'change',
        before: baseDecl.value,
        after: decl.value,
        importantBefore: baseDecl.important,
        important: decl.important,
      });
    }
  }

  for (const prop of Object.keys(base)) {
    if (seen.has(prop)) continue;
    edits.push({
      prop,
      action: 'remove',
      before: base[prop].value,
      importantBefore: base[prop].important,
    });
  }

  return edits;
}

// -- Live application --------------------------------------------------------

// Per-element memo: tracks props we've touched + the original inline value
// (which may be empty) so we can restore it if the edit goes away.
type ElementAppliedState = {
  /** prop -> original inline (value, priority) before we first touched it. */
  originals: Map<string, { value: string; priority: string }>;
};

const registry = new WeakMap<HTMLElement, ElementAppliedState>();

function snapshotOriginal(el: HTMLElement, prop: string) {
  let state = registry.get(el);
  if (!state) {
    state = { originals: new Map() };
    registry.set(el, state);
  }
  if (!state.originals.has(prop)) {
    state.originals.set(prop, {
      value: el.style.getPropertyValue(prop),
      priority: el.style.getPropertyPriority(prop),
    });
  }
  return state;
}

function restoreOriginal(el: HTMLElement, prop: string) {
  const state = registry.get(el);
  const orig = state?.originals.get(prop);
  if (!orig) return;
  if (orig.value) {
    el.style.setProperty(prop, orig.value, orig.priority);
  } else {
    el.style.removeProperty(prop);
  }
  state!.originals.delete(prop);
  if (state!.originals.size === 0) registry.delete(el);
}

/**
 * Apply the given edits to the element via inline `style` overrides.
 * Idempotent: safe to call on every render. Any props previously applied by
 * us but no longer present in `edits` are restored to their original inline
 * value (or removed entirely if there was none).
 *
 * `remove` edits (the user deleted a property line) are applied as `unset`.
 * That gives the visually-correct preview: inheritable properties fall back
 * to the parent's value, non-inheritable ones fall back to the spec initial.
 * The diff still records the action as 'remove' so the agent reading the
 * clipboard payload knows the user intended a deletion, not a literal
 * `: unset`.
 */
export function applyCssEdits(el: HTMLElement, edits: CssEdit[]): void {
  const desired = new Map<string, { value: string; important: boolean }>();
  for (const e of edits) {
    if (e.action === 'add' || e.action === 'change') {
      desired.set(e.prop, { value: e.after, important: e.important });
    } else if (e.action === 'remove') {
      // Preserve the original importance flag — if the property had been
      // !important in the cascade, we still need !important on the override
      // to defeat it.
      desired.set(e.prop, { value: 'unset', important: e.importantBefore });
    }
  }

  // Restore any props we previously set that aren't in the new desired set.
  const state = registry.get(el);
  if (state) {
    for (const prop of Array.from(state.originals.keys())) {
      if (!desired.has(prop)) restoreOriginal(el, prop);
    }
  }

  // Apply the new desired set.
  for (const [prop, { value, important }] of desired) {
    snapshotOriginal(el, prop);
    el.style.setProperty(prop, value, important ? 'important' : '');
  }
}

/** Remove all edits we applied to this element, restoring original inline. */
export function clearCssEdits(el: HTMLElement): void {
  const state = registry.get(el);
  if (!state) return;
  for (const prop of Array.from(state.originals.keys())) {
    restoreOriginal(el, prop);
  }
}

// -- Formatting --------------------------------------------------------------

/**
 * Render an edit list as a markdown ```diff``` fenced block. Suitable for
 * pasting into an agent chat.
 *
 * Conventions:
 *   add     ->  `+ prop: value;`
 *   change  ->  `- prop: old;` then `+ prop: new;`
 *   remove  ->  `+ prop: unset;`
 *
 * When at least one `remove` edit is present, a single explainer line is
 * appended after the fence so the agent can correctly translate `unset`
 * into either "delete from this rule" (if the prop is authored locally) or
 * "keep as an override" (if it came from elsewhere in the cascade).
 */
export function formatCssEditsDiff(selector: string, edits: CssEdit[]): string {
  const lines: string[] = [];
  lines.push(`${selector} {`);
  let hasRemoves = false;
  for (const e of edits) {
    if (e.action === 'add') {
      lines.push(`+ ${e.prop}: ${e.after}${e.important ? ' !important' : ''};`);
    } else if (e.action === 'change') {
      lines.push(
        `- ${e.prop}: ${e.before}${e.importantBefore ? ' !important' : ''};`,
      );
      lines.push(`+ ${e.prop}: ${e.after}${e.important ? ' !important' : ''};`);
    } else {
      lines.push(
        `+ ${e.prop}: unset${e.importantBefore ? ' !important' : ''};`,
      );
      hasRemoves = true;
    }
  }
  lines.push('}');
  const block = '```diff\n' + lines.join('\n') + '\n```';
  if (!hasRemoves) return block;
  return (
    block +
    '\n`unset` — delete from this rule if present; otherwise add as cascade override.'
  );
}

/**
 * Compact human summary used in the annotations list, e.g.
 * "3 changes: padding, color, margin-top".
 */
export function summarizeCssEdits(edits: CssEdit[]): string {
  if (edits.length === 0) return 'No CSS changes';
  const props = edits.map(e => e.prop);
  const head = props.slice(0, 3).join(', ');
  const more = props.length > 3 ? ` +${props.length - 3} more` : '';
  const n = edits.length;
  return `${n} CSS edit${n === 1 ? '' : 's'}: ${head}${more}`;
}

// Re-export the AppliedDecl type for convenience.
export type { AppliedDecl };
