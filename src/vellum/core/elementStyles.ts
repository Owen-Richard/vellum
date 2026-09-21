import { calculate as calculateSpecificity } from 'specificity';

/**
 * Returns only CSS declarations that come from authored stylesheet rules
 * matching this element, in cascade order (later rules win).
 * Approach (c): CSSStyleSheet rule introspection.
 * Cross-origin stylesheets are silently skipped.
 */
export type DeclItem =
  | { kind: 'decl'; prop: string; value: string; important: boolean; raw: string }
  | { kind: 'nested'; text: string };

export type Source = {
  label: string;
  selector: string;
  context: string[];
  items: DeclItem[];
};

export type CascadeResult = {
  sources: Source[];
  /** Winning source index per property name. */
  finalWinner: Map<string, number>;
};

// Parse a declaration block body into items. Preserves shorthand notation
// by working off the rule's serialized cssText rather than iterating longhands.
// Nested rules (modern CSS nesting) are captured as opaque blocks.
export function parseBody(body: string): DeclItem[] {
  const items: DeclItem[] = [];
  let buf = '';
  let i = 0;
  const flushDecl = () => {
    const trimmed = buf.trim();
    buf = '';
    if (!trimmed) return;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx <= 0) return;
    const prop = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();
    let important = false;
    const m = value.match(/!\s*important\s*$/i);
    if (m) {
      important = true;
      value = value.slice(0, m.index).trim();
    }
    // Hide Vellum's own anchor-name decoration (used for annotation dot
    // positioning) so it doesn't pollute the styles panel.
    if (prop === 'anchor-name' && value.includes('--vellum')) return;
    items.push({
      kind: 'decl',
      prop,
      value,
      important,
      raw: `${prop}: ${value}${important ? ' !important' : ''};`,
    });
  };
  while (i < body.length) {
    const ch = body[i];
    // Strip /* ... */ comments. The grouped Applied output emits these as
    // section headers and the user may also type their own; either way they
    // are not part of any declaration.
    if (ch === '/' && body[i + 1] === '*') {
      const end = body.indexOf('*/', i + 2);
      i = end < 0 ? body.length : end + 2;
      continue;
    }
    if (ch === '{') {
      // start of a nested rule — find matching close
      let depth = 1;
      let j = i + 1;
      while (j < body.length && depth > 0) {
        if (body[j] === '{') depth++;
        else if (body[j] === '}') depth--;
        j++;
      }
      const nestedText = (buf + body.slice(i, j)).trim();
      items.push({ kind: 'nested', text: nestedText });
      buf = '';
      i = j;
      continue;
    }
    if (ch === ';') {
      flushDecl();
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  flushDecl();
  return items;
}

// Extract body (text between outermost `{` and `}`) from a CSSStyleRule's cssText.
function extractBody(cssText: string): string {
  const open = cssText.indexOf('{');
  const close = cssText.lastIndexOf('}');
  if (open < 0 || close < 0 || close <= open) return '';
  return cssText.slice(open + 1, close).trim();
}

// ── Cascade machinery ──────────────────────────────────────────────────────
//
// CSS cascade order (simplified, author origin only — Vellum is a dev tool
// inside a single document, so user-agent and user origins aren't in play):
//   1. !important wins over normal
//   2. Among normal: unlayered > layer rank (higher = later-declared) > spec > doc-order
//   3. Among !important: REVERSED — earliest-declared layer > later layer; unlayered LOSES to all layered !important
//      Then specificity, then document order.
//
// `@media` / `@supports` rules whose conditions don't match the current
// environment are skipped entirely — those declarations don't enter the
// cascade. `@container` queries require knowing the matched container's
// resolved size to evaluate correctly; for now we include them with a flag
// so they show up in the All Rules view but are clearly marked. If this
// becomes a real problem we can extend this to evaluate container queries
// against the actual container element, or fall back to the probe-element
// approach (let the browser tell us via getComputedStyle which value
// actually applied — see commit history for design notes).

const UNLAYERED = Symbol('unlayered');
type LayerRank = number | typeof UNLAYERED;

/**
 * Walk every stylesheet in the document and build a map from layer path to
 * its declaration rank (first-encountered wins). Layer paths use dot
 * notation for nesting, e.g. `common.atomic`.
 *
 * Both forms of layer declaration register a rank:
 *   - `CSSLayerStatementRule` (e.g. `@layer reset, base, components;`)
 *   - `CSSLayerBlockRule`     (e.g. `@layer common { ... }`)
 */
function buildLayerOrder(): Map<string, number> {
  const order = new Map<string, number>();
  const register = (path: string) => {
    if (!order.has(path)) order.set(path, order.size);
  };
  const walk = (rules: CSSRuleList, parentPath: string | null) => {
    for (const rule of Array.from(rules)) {
      // CSSLayerStatementRule has `nameList` (array of layer names) and no body.
      // It's a CSSRule but not a CSSGroupingRule, so check this first.
      const nameList = (rule as unknown as { nameList?: string[] }).nameList;
      if (Array.isArray(nameList)) {
        for (const name of nameList) {
          register(parentPath ? `${parentPath}.${name}` : name);
        }
        continue;
      }
      // CSSLayerBlockRule has `name` and a body (it's a CSSGroupingRule).
      // CSSMediaRule / CSSSupportsRule / CSSContainerRule are also grouping
      // rules but their `name` is undefined.
      if (rule instanceof CSSGroupingRule) {
        const name = (rule as unknown as { name?: string }).name;
        if (typeof name === 'string' && name.length > 0) {
          const path = parentPath ? `${parentPath}.${name}` : name;
          register(path);
          walk(rule.cssRules, path);
        } else {
          walk(rule.cssRules, parentPath);
        }
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walk(sheet.cssRules, null);
    } catch {
      // cross-origin stylesheet
    }
  }
  return order;
}

/** Check whether a conditional at-rule (`@media` / `@supports`) matches the current environment. */
function conditionMatches(rule: CSSRule): boolean {
  if (rule instanceof CSSMediaRule) {
    try {
      return window.matchMedia(rule.media.mediaText).matches;
    } catch {
      return false;
    }
  }
  if (rule instanceof CSSSupportsRule) {
    try {
      return CSS.supports(rule.conditionText);
    } catch {
      return false;
    }
  }
  // CSSContainerRule and unknown conditional groupings: include but mark.
  // Container queries require resolving the matched container element's
  // current size — out of scope for now.
  return true;
}

type MatchedRule = {
  rule: CSSStyleRule;
  /** Display labels for each conditional / layer wrapper around this rule. */
  context: string[];
  /** Layer path this rule lives in (e.g. `common.atomic`), or UNLAYERED. */
  layerPath: string | typeof UNLAYERED;
  /** True iff the rule lives inside a container query we can't fully evaluate. */
  containerQueryUnknown: boolean;
};

/**
 * Walk the document's stylesheets and resolve the full cascade for `el`.
 * Expensive (walks every CSSRule in every stylesheet) — callers that need
 * applied/author/text views should compute this once per selection and pass
 * the result into the pure formatters below.
 */
export function collectCascadeSources(
  el: HTMLElement,
  includeInline = true,
): CascadeResult {
  const layerOrder = buildLayerOrder();

  const collectMatchingRules = (
    rules: CSSRuleList,
    context: string[],
    layerPath: string | typeof UNLAYERED,
    containerQueryUnknown: boolean,
  ): MatchedRule[] => {
    const matches: MatchedRule[] = [];
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        try {
          if (el.matches(rule.selectorText)) {
            matches.push({
              rule,
              context: [...context],
              layerPath,
              containerQueryUnknown,
            });
          }
        } catch {
          // invalid selector
        }
        continue;
      }

      if (!(rule instanceof CSSGroupingRule)) continue;

      // Determine wrapper kind, condition, label, and how it affects layer path.
      let label = '';
      let nextLayerPath = layerPath;
      let nextContainerUnknown = containerQueryUnknown;

      if (rule instanceof CSSMediaRule) {
        if (!conditionMatches(rule)) continue; // doesn't apply in this env
        label = `@media ${rule.conditionText || rule.media.mediaText}`;
      } else if (rule instanceof CSSSupportsRule) {
        if (!conditionMatches(rule)) continue;
        label = `@supports ${rule.conditionText}`;
      } else if (
        // CSSContainerRule isn't in lib.dom for all TS targets; detect by name.
        rule.constructor && rule.constructor.name === 'CSSContainerRule'
      ) {
        label = `@container ${(rule as unknown as { conditionText?: string }).conditionText ?? ''}`.trim();
        nextContainerUnknown = true;
      } else {
        // CSSLayerBlockRule: extend layer path. Anonymous layer (empty name)
        // contributes a fresh implicit layer per spec; we treat it as the
        // parent's path (close enough for our needs).
        const name = (rule as unknown as { name?: string }).name;
        if (typeof name === 'string' && name.length > 0) {
          const path =
            layerPath === UNLAYERED
              ? name
              : `${layerPath as string}.${name}`;
          nextLayerPath = path;
          label = `@layer ${path}`;
        } else if (typeof name === 'string') {
          label = '@layer';
        } else {
          // Unknown grouping (future at-rule); recurse without filtering.
          label = `@${rule.constructor.name.replace(/^CSS|Rule$/g, '').toLowerCase()}`;
        }
      }

      matches.push(
        ...collectMatchingRules(
          rule.cssRules,
          [...context, label],
          nextLayerPath,
          nextContainerUnknown,
        ),
      );
    }
    return matches;
  };

  // Gather across all stylesheets.
  const allMatches: MatchedRule[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin
    }
    allMatches.push(...collectMatchingRules(rules, [], UNLAYERED, false));
  }

  // Tag each match with specificity + document order for sorting.
  type RankedMatch = MatchedRule & {
    specificity: [number, number, number];
    docOrder: number;
    layerRank: LayerRank;
  };
  const ranked: RankedMatch[] = allMatches.map((m, docOrder) => {
    let specificity: [number, number, number] = [0, 0, 0];
    try {
      const s = calculateSpecificity(m.rule.selectorText);
      specificity = [s.A, s.B, s.C];
    } catch {
      // unparseable selector
    }
    const layerRank: LayerRank =
      m.layerPath === UNLAYERED
        ? UNLAYERED
        : layerOrder.get(m.layerPath as string) ?? -1;
    return { ...m, specificity, docOrder, layerRank };
  });

  // Sort cascade-reading order: lowest-priority first, highest-priority last
  // (so that `last write wins` per property gives us the correct winner when
  // we replay the sources into `bestNormal` / `bestImportant`).
  //
  // For NORMAL declarations:   unlayered > higher layerRank > lower layerRank, then specificity, then docOrder.
  // For !important declarations: REVERSED — lower layerRank wins; unlayered loses to all layered.
  //
  // We can't mix orderings in one sort because a single rule may contribute
  // both important and normal declarations. Instead, do two passes: one that
  // walks in normal-cascade order to fill `bestNormal`, and one that walks
  // in important-cascade order to fill `bestImportant`. Both use the same
  // `sources` list (in normal-cascade order) for indexing.

  const cmpSpecAndDocOrder = (a: RankedMatch, b: RankedMatch): number => {
    for (let i = 0; i < 3; i++) {
      if (a.specificity[i] !== b.specificity[i])
        return a.specificity[i] - b.specificity[i];
    }
    return a.docOrder - b.docOrder;
  };
  const layerRankForNormalOrder = (m: RankedMatch): number =>
    m.layerRank === UNLAYERED ? Number.POSITIVE_INFINITY : (m.layerRank as number);
  const layerRankForImportantOrder = (m: RankedMatch): number =>
    // Important: unlayered = lowest; among layered, earliest = highest.
    // Lay them out so "last wins" still produces the right winner.
    m.layerRank === UNLAYERED ? Number.NEGATIVE_INFINITY : -(m.layerRank as number);

  const sortedNormal = [...ranked].sort((a, b) => {
    const la = layerRankForNormalOrder(a);
    const lb = layerRankForNormalOrder(b);
    if (la !== lb) return la - lb;
    return cmpSpecAndDocOrder(a, b);
  });

  // Build the canonical `sources` list in normal-cascade order. This is also
  // what the All Rules view renders (top-to-bottom = lowest-to-highest
  // priority for normal declarations, which is the most useful reading order
  // for designers debugging overrides).
  const sources: Source[] = sortedNormal.map((m, i) => {
    const specStr = m.specificity.join(',');
    const layerLabel =
      m.layerPath === UNLAYERED ? '(unlayered)' : `layer ${m.layerPath as string}`;
    const containerNote = m.containerQueryUnknown
      ? ' — note: inside @container query, may not actually apply'
      : '';
    return {
      label: `CSS Rule #${i + 1}${
        m.context.length ? ' in ' + m.context.join(' > ') : ''
      } | ${layerLabel} | specificity: [${specStr}]${containerNote}`,
      selector: m.rule.selectorText,
      context: m.context,
      items: parseBody(extractBody(m.rule.cssText)),
    };
  });

  // Index map from MatchedRule -> sources index, so we can use !important
  // ordering without reshuffling `sources`.
  const matchToSourceIdx = new Map<RankedMatch, number>();
  sortedNormal.forEach((m, i) => matchToSourceIdx.set(m, i));

  // Inline style: append as the very last source.
  let inlineSourceIdx: number | null = null;
  if (includeInline && el.getAttribute('style')) {
    const inlineItems = parseBody(el.getAttribute('style') ?? '');
    if (inlineItems.some((it) => it.kind === 'decl')) {
      inlineSourceIdx = sources.length;
      sources.push({
        label: 'Inline style | (unlayered) | specificity: [1,0,0,0]',
        selector: el.tagName.toLowerCase(),
        context: [],
        items: inlineItems,
      });
    }
  }

  // Determine winners. For normal: iterate sources in their list order
  // (already normal-cascade order, last wins). For !important: iterate
  // sources in important-cascade order.
  const bestNormal = new Map<string, number>();
  const bestImportant = new Map<string, number>();

  // Normal pass — uses source order directly.
  sources.forEach((src, idx) => {
    for (const item of src.items) {
      if (item.kind !== 'decl' || item.important) continue;
      bestNormal.set(item.prop, idx);
    }
  });

  // Important pass — re-sort matches with important-friendly layer ordering,
  // then process. Inline style for !important behaves as unlayered:
  // unlayered !important loses to all layered !important.
  const sortedImportant = [...ranked].sort((a, b) => {
    const la = layerRankForImportantOrder(a);
    const lb = layerRankForImportantOrder(b);
    if (la !== lb) return la - lb;
    return cmpSpecAndDocOrder(a, b);
  });
  for (const m of sortedImportant) {
    const idx = matchToSourceIdx.get(m);
    if (idx == null) continue;
    for (const item of sources[idx].items) {
      if (item.kind !== 'decl' || !item.important) continue;
      bestImportant.set(item.prop, idx);
    }
  }
  if (inlineSourceIdx != null) {
    // Inline !important declarations slot in as unlayered !important.
    // Process them last so they correctly lose to layered !important.
    // (We want layered !important winners to NOT be overwritten here.)
    for (const item of sources[inlineSourceIdx].items) {
      if (item.kind !== 'decl' || !item.important) continue;
      if (!bestImportant.has(item.prop)) {
        bestImportant.set(item.prop, inlineSourceIdx);
      }
    }
  }

  const finalWinner = new Map<string, number>();
  for (const [prop, idx] of bestNormal) finalWinner.set(prop, idx);
  for (const [prop, idx] of bestImportant) finalWinner.set(prop, idx);

  return { sources, finalWinner };
}

/**
 * Full cascade dump: every matching rule in cascade order, with overridden
 * declarations wrapped in CSS block comments naming the winning selector.
 * Pure transform — pass a `CascadeResult` from {@link collectCascadeSources}.
 */
export function getAuthorStylesText(cascade: CascadeResult): string {
  const { sources, finalWinner } = cascade;

  const renderBody = (src: Source, srcIdx: number): string => {
    const lines: string[] = [];
    for (const item of src.items) {
      if (item.kind === 'nested') {
        const indented = item.text
          .split('\n')
          .map((l) => '  ' + l)
          .join('\n');
        lines.push(indented);
        continue;
      }
      const winnerIdx = finalWinner.get(item.prop);
      if (winnerIdx === srcIdx) {
        lines.push(`  ${item.raw}`);
      } else {
        const winner = winnerIdx != null ? sources[winnerIdx] : undefined;
        const by = winner ? winner.selector : 'unknown';
        lines.push(`  /* ${item.raw} (overridden by ${by}) */`);
      }
    }
    return lines.join('\n');
  };

  let out = '';
  sources.forEach((src, idx) => {
    out += `/* ${src.label} */\n`;
    const body = renderBody(src, idx);
    let block = `${src.selector} {\n${body}\n}`;
    for (let j = src.context.length - 1; j >= 0; j--) {
      block = `${src.context[j]} {\n${block
        .split('\n')
        .map((l) => '  ' + l)
        .join('\n')}\n}`;
    }
    out += block + '\n\n';
  });

  return out.trim();
}

/**
 * Data form of getAppliedStylesText. Returns one entry per winning
 * declaration (the property/value pair that actually applies to the element
 * after cascade resolution). Order is undefined — consumers should treat it
 * as a map keyed by prop.
 */
export type AppliedDecl = { prop: string; value: string; important: boolean };

/** Pure transform — pass a `CascadeResult` from {@link collectCascadeSources}. */
export function getAppliedStyles(cascade: CascadeResult): AppliedDecl[] {
  const { sources, finalWinner } = cascade;
  const out: AppliedDecl[] = [];
  sources.forEach((src, idx) => {
    for (const item of src.items) {
      if (item.kind !== 'decl') continue;
      if (finalWinner.get(item.prop) !== idx) continue;
      out.push({ prop: item.prop, value: item.value, important: item.important });
    }
  });
  return out;
}

/**
 * Flat list of only the *winning* declarations (the props actually applied to
 * the element after cascade resolution), grouped by category (Custom
 * Properties, Layout, Box, Text, Appearance, Other) with CSS block-comment
 * headers. Within each group, declarations appear in the order they were
 * encountered across cascade sources.
 */
/** Pure transform — pass a `CascadeResult` from {@link collectCascadeSources}. */
export function getAppliedStylesText(cascade: CascadeResult): string {
  const { sources, finalWinner } = cascade;
  const grouped = new Map<string, Array<{ prop: string; raw: string }>>();
  for (const g of GROUP_ORDER) grouped.set(g, []);
  sources.forEach((src, idx) => {
    for (const item of src.items) {
      if (item.kind !== 'decl') continue;
      if (finalWinner.get(item.prop) !== idx) continue;
      const group = categorizeProperty(item.prop);
      grouped.get(group)!.push({ prop: item.prop, raw: item.raw });
    }
  });
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

const GROUP_ORDER = [
  'Custom Properties',
  'Layout',
  'Box',
  'Text',
  'Appearance',
  'Other',
] as const;

export { GROUP_ORDER };
export type StyleGroup = (typeof GROUP_ORDER)[number];

/**
 * Bucket a CSS property name into a display group. Uses prefix matching for
 * shorthand-family coverage (e.g. `border-*` → Appearance). Unknown props
 * fall into "Other".
 */
export function categorizeProperty(prop: string): StyleGroup {
  if (prop.startsWith('--')) return 'Custom Properties';

  // Layout — display, positioning, flex, grid, gap, order
  if (
    prop === 'display' ||
    prop === 'position' ||
    prop === 'top' ||
    prop === 'right' ||
    prop === 'bottom' ||
    prop === 'left' ||
    prop === 'z-index' ||
    prop === 'float' ||
    prop === 'clear' ||
    prop === 'order' ||
    prop === 'gap' ||
    prop === 'row-gap' ||
    prop === 'column-gap' ||
    prop === 'isolation' ||
    prop.startsWith('inset') ||
    prop.startsWith('flex') ||
    prop.startsWith('justify-') ||
    prop.startsWith('align-') ||
    prop.startsWith('place-') ||
    prop.startsWith('grid')
  ) {
    return 'Layout';
  }

  // Box — sizing, spacing, overflow
  if (
    prop === 'width' ||
    prop === 'height' ||
    prop === 'min-width' ||
    prop === 'max-width' ||
    prop === 'min-height' ||
    prop === 'max-height' ||
    prop === 'aspect-ratio' ||
    prop === 'box-sizing' ||
    prop === 'contain' ||
    prop.startsWith('margin') ||
    prop.startsWith('padding') ||
    prop.startsWith('overflow') ||
    prop.startsWith('overscroll') ||
    prop.startsWith('container')
  ) {
    return 'Box';
  }

  // Text — typography and color
  if (
    prop === 'color' ||
    prop === 'line-height' ||
    prop === 'letter-spacing' ||
    prop === 'white-space' ||
    prop === 'direction' ||
    prop === 'writing-mode' ||
    prop === 'unicode-bidi' ||
    prop === 'tab-size' ||
    prop === 'hyphens' ||
    prop === 'hanging-punctuation' ||
    prop === 'overflow-wrap' ||
    prop === 'word-break' ||
    prop === 'word-spacing' ||
    prop === 'word-wrap' ||
    prop.startsWith('font') ||
    prop.startsWith('text-') ||
    prop.startsWith('list-style')
  ) {
    return 'Text';
  }

  // Appearance — backgrounds, borders, outlines, shadows, filters, opacity
  if (
    prop === 'opacity' ||
    prop === 'visibility' ||
    prop === 'box-shadow' ||
    prop === 'filter' ||
    prop === 'backdrop-filter' ||
    prop === 'mix-blend-mode' ||
    prop === 'background-blend-mode' ||
    prop.startsWith('background') ||
    prop.startsWith('border') ||
    prop.startsWith('outline')
  ) {
    return 'Appearance';
  }

  return 'Other';
}
