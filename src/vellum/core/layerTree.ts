import {
  isCompositeFiber,
  isHostFiber,
  getDisplayName,
  shouldFilterFiber,
  type Fiber,
} from 'bippy';
import { getRenderedElements } from './fibers';
import { getElementLabel } from './selectors';
import { isElementHidden } from './visibility';
import type { DisplayFilters } from './filters/types';
import { IDENTITY_DISPLAY_FILTERS } from './filters/compose';

const HIDDEN_TAGS = new Set([
  'script',
  'style',
  'link',
  'meta',
  'noscript',
  'template',
  'head',
  'title',
  'base',
  'br',
  'wbr',
  'col',
  'colgroup',
]);

export type TreeItem = {
  kind: 'component' | 'element';
  label: string;
  suffix: string;
  fiber: Fiber | null;
  element: HTMLElement | null;
  elements: HTMLElement[];
  children: TreeItem[];
  /** True when this element (or one of its ancestors) is not rendered — e.g. display:none, visibility:hidden, or detached. */
  hidden: boolean;
};

export function buildDomTree(root: Element = document.body, limit = 2000): TreeItem[] {
  let remaining = limit;
  function visit(element: Element, depth: number): TreeItem[] {
    if (remaining-- <= 0 || depth > 40 || element.closest('[data-vellum]') ||
      HIDDEN_TAGS.has(element.tagName.toLowerCase())) return [];
    const { tag, suffix } = getElementLabel(element);
    const selectable = element instanceof HTMLElement ? element : null;
    return [{
      kind: 'element', label: tag, suffix, fiber: null, element: selectable,
      elements: selectable ? [selectable] : [],
      hidden: isElementHidden(element),
      children: Array.from(element.children).flatMap(child => visit(child, depth + 1)),
    }];
  }
  return visit(root, 0);
}

function isVellumFiber(fiber: Fiber): boolean {
  if (isHostFiber(fiber)) {
    const el = fiber.stateNode;
    if (el instanceof HTMLElement && el.hasAttribute('data-vellum'))
      return true;
  }
  if (isCompositeFiber(fiber)) {
    const name = getDisplayName(fiber.type);
    if (
      name &&
      // Match Vellum's own UI components, but not provider wrappers
      // (VellumProvider, VellumFeatureProvider) which wrap user app content
      // and must allow recursion into their children.
      /^(Toolbar|Sidebar|SelectionHighlight|AnnotationDots|AnnotationPopover|LayerTree|VellumLayer)/.test(
        name,
      )
    ) {
      return true;
    }
  }
  return false;
}

export function buildTree(
  fiber: Fiber | null,
  filters: DisplayFilters = IDENTITY_DISPLAY_FILTERS,
  parentHidden = false,
): TreeItem[] {
  const items: TreeItem[] = [];
  let current = fiber;

  while (current) {
    if (isVellumFiber(current)) {
      current = current.sibling;
      continue;
    }

    if (isHostFiber(current)) {
      const el = current.stateNode as HTMLElement;
      // Accept both HTMLElement and SVGElement (both extend Element and have
      // the .style / .classList / .id surface we rely on). Text node fibers
      // are HostText, not HostComponent, so they don't reach this branch.
      if (el instanceof Element && !HIDDEN_TAGS.has(el.tagName.toLowerCase())) {
        const { tag, suffix: rawSuffix } = getElementLabel(el);
        // Apply className filter to suffix (which contains .class1.class2)
        const filteredSuffix = rawSuffix
          .split('.')
          .filter(Boolean)
          .map(cls => {
            // Skip id fragments (start with #)
            if (cls.startsWith('#')) return cls;
            const transformed = filters.transformClassName(cls);
            return transformed;
          })
          .filter((c): c is string => c !== null)
          .map(c => (c.startsWith('#') ? c : `.${c}`))
          .join('');
        // If an ancestor is already hidden, skip the per-element visibility
        // check — descendants of a hidden node are always hidden.
        const hidden = parentHidden || isElementHidden(el);
        // SVG sub-elements can't be selected via the popover architecture, so
        // surface the root <svg> as an opaque node — skip recursion into its
        // children.
        const isSvgRoot = tag === 'svg';
        items.push({
          kind: 'element',
          label: tag,
          suffix: filteredSuffix,
          fiber: current,
          element: el,
          elements: [el],
          children: isSvgRoot ? [] : buildTree(current.child, filters, hidden),
          hidden,
        });
      }
      current = current.sibling;
      continue;
    }

    if (isCompositeFiber(current) && !shouldFilterFiber(current)) {
      const name = getDisplayName(current.type);
      if (name) {
        // Apply component filter
        if (!filters.filterComponent(name)) {
          // Skip this component but recurse into its children
          const childItems = buildTree(current.child, filters, parentHidden);
          items.push(...childItems);
          current = current.sibling;
          continue;
        }
        const rendered = getRenderedElements(current);
        items.push({
          kind: 'component',
          label: name,
          suffix: '',
          fiber: current,
          element: null,
          elements: rendered,
          children: buildTree(current.child, filters, parentHidden),
          // Components don't have a single host node; treat them as hidden
          // only when an ancestor element is hidden.
          hidden: parentHidden,
        });
        current = current.sibling;
        continue;
      }
    }

    // For filtered composites (Fragment, StrictMode, providers, etc.), skip and recurse into children
    const childItems = buildTree(current.child, filters, parentHidden);
    items.push(...childItems);
    current = current.sibling;
  }

  // Collapse same-name wrappers if enabled
  if (filters.collapseWrappers) {
    return collapseWrappedItems(items);
  }

  return items;
}

/** Collapse children that have the same name as their parent. */
function collapseWrappedItems(items: TreeItem[]): TreeItem[] {
  return items.map(item => {
    const collapsed: TreeItem[] = [];
    for (const child of item.children) {
      if (child.label === item.label && child.kind === item.kind) {
        // Promote grandchildren
        collapsed.push(...child.children);
      } else {
        collapsed.push(child);
      }
    }
    return {
      ...item,
      children: collapseWrappedItems(collapsed),
    };
  });
}
