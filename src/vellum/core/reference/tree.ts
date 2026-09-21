import {
  getFiberFromHostInstance,
  isCompositeFiber,
  getDisplayName,
  type Fiber,
} from 'bippy';
import { getSource, normalizeFileName, type FiberSource } from 'bippy/source';

/**
 * Captures the React component tree structure and generates reference text.
 * Uses fiber tree inspection to extract component hierarchy, props, and text content.
 */

interface TreeNode {
  name: string;
  fiber: Fiber;
  textFibers: Fiber[];
  depth: number;
  children: TreeNode[];
}

interface CaptureOptions {
  showSource?: boolean;
  showProps?: boolean;
  filterComponents?: boolean;
  rootElement?: Element;
}

interface NodeTextContent {
  directText: string[];
  fallbackText: string[];
}

const MAX_TEXT_ITEMS = 6;
const MAX_TEXT_LENGTH = 120;
const FALLBACK_TEXT_ATTRIBUTES = [
  'aria-label',
  'aria-description',
  'title',
  'placeholder',
  'alt',
] as const;
const CSS_MODULE_PATTERN = /^_([a-zA-Z][a-zA-Z0-9]*)_[a-z0-9]+_\d+$/;

/**
 * Finds the root fiber by walking up `.return` from any fiber.
 */
function findRootFiber(fiber: Fiber): Fiber {
  let current = fiber;
  while (current.return) {
    current = current.return;
  }
  return current;
}

/**
 * Gets the root fiber of the React app by finding any DOM element with a fiber
 * attached, then walking up to the root.
 */
function getRootFiber(): Fiber | null {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
  );
  let node = walker.nextNode() as Element | null;
  while (node) {
    const fiber = getFiberFromHostInstance(node);
    if (fiber) {
      return findRootFiber(fiber);
    }
    node = walker.nextNode() as Element | null;
  }
  return null;
}

/**
 * Finds the fiber attached to an element, or the first fiber found in its subtree.
 */
function getFiberForElement(element: Element): Fiber | null {
  const direct = getFiberFromHostInstance(element);
  if (direct) return direct;

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode() as Element | null;
  while (node) {
    const fiber = getFiberFromHostInstance(node);
    if (fiber) return fiber;
    node = walker.nextNode() as Element | null;
  }
  return null;
}

/**
 * Returns true if the component name looks like a Provider or Context wrapper.
 */
function isProviderOrContext(name: string): boolean {
  return ['Provider', 'Context', 'Consumer'].some(s => name.includes(s));
}

/**
 * Returns true if the component name looks like a private/internal component that we should skip.
 */
function isPrivate(name: string): boolean {
  return name.startsWith('_') || name.startsWith('Anonymous');
}

/**
 * Returns true when a fiber is a host element backed by a DOM Element.
 */
function isHostElementFiber(
  fiber: Fiber,
): fiber is Fiber & { stateNode: Element } {
  return fiber.stateNode instanceof Element;
}

/**
 * Normalizes visible text so output stays compact and comparable across nodes.
 */
function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Truncates text to a stable preview length.
 */
function truncateText(text: string, maxLength = MAX_TEXT_LENGTH): string {
  return text.length > maxLength ? text.slice(0, maxLength) + '…' : text;
}

/**
 * Collects the direct text nodes that are immediate children of an element.
 */
function getDirectTextFromElement(element: Element): string {
  const parts: string[] = [];
  for (const childNode of Array.from(element.childNodes)) {
    if (childNode.nodeType !== Node.TEXT_NODE) continue;
    const text = normalizeText(childNode.textContent ?? '');
    if (text) {
      parts.push(text);
    }
  }
  return parts.join(' ');
}

/**
 * Extracts attribute-based fallback text for elements without direct text.
 */
function getFallbackTextFromElement(element: Element): string[] {
  const fallbackText: string[] = [];
  const seenFallbackText = new Set<string>();

  for (const attribute of FALLBACK_TEXT_ATTRIBUTES) {
    const value = normalizeText(element.getAttribute(attribute) ?? '');
    if (!value) {
      continue;
    }

    const entry = `${attribute}=${JSON.stringify(truncateText(value))}`;
    if (seenFallbackText.has(entry)) {
      continue;
    }

    seenFallbackText.add(entry);
    fallbackText.push(entry);
  }

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    const value = normalizeText(element.value ?? '');
    if (value) {
      const entry = `value=${JSON.stringify(truncateText(value))}`;
      if (!seenFallbackText.has(entry)) {
        seenFallbackText.add(entry);
        fallbackText.push(entry);
      }
    }
  }

  return fallbackText;
}

/**
 * Traverses a component subtree while skipping nested composite components.
 */
function walkOwnedFibers(
  rootFiber: Fiber,
  visit: (fiber: Fiber) => void,
): void {
  function walk(current: Fiber | null): void {
    let fiber = current;
    while (fiber) {
      if (isCompositeFiber(fiber)) {
        fiber = fiber.sibling;
        continue;
      }
      visit(fiber);
      walk(fiber.child);
      fiber = fiber.sibling;
    }
  }

  walk(rootFiber.child);
}

/**
 * Collects direct text for one or more component fibers.
 */
function collectNodeTextContent(textFibers: Fiber[]): NodeTextContent {
  const directText: string[] = [];
  const fallbackText: string[] = [];
  const seenDirectText = new Set<string>();
  const seenFallbackText = new Set<string>();

  for (const rootFiber of textFibers) {
    walkOwnedFibers(rootFiber, fiber => {
      if (!isHostElementFiber(fiber)) {
        return;
      }

      const direct = getDirectTextFromElement(fiber.stateNode);
      if (
        direct &&
        !seenDirectText.has(direct) &&
        directText.length < MAX_TEXT_ITEMS
      ) {
        seenDirectText.add(direct);
        directText.push(JSON.stringify(truncateText(direct)));
        return;
      }

      for (const fallback of getFallbackTextFromElement(fiber.stateNode)) {
        if (
          seenFallbackText.has(fallback) ||
          fallbackText.length >= MAX_TEXT_ITEMS
        ) {
          continue;
        }

        seenFallbackText.add(fallback);
        fallbackText.push(fallback);
      }
    });
  }

  return {
    directText,
    fallbackText,
  };
}

/**
 * Collects direct text content for every node in the tree.
 */
function resolveTextContent(nodes: TreeNode[]): Map<Fiber, NodeTextContent> {
  const map = new Map<Fiber, NodeTextContent>();
  const queue = [...nodes];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) {
      continue;
    }
    map.set(node.fiber, collectNodeTextContent(node.textFibers));
    queue.push(...node.children);
  }
  return map;
}

/**
 * Returns text details as key: value entries for flat formatting.
 */
function formatTextEntries(textContent: NodeTextContent | undefined): string[] {
  if (!textContent) return [];

  if (textContent.directText.length > 0) {
    return [`text: ${textContent.directText.join(' | ')}`];
  }

  if (textContent.fallbackText.length > 0) {
    // Convert attribute="value" to attribute: "value"
    return textContent.fallbackText.map(entry => entry.replace('=', ': '));
  }

  return [];
}

/**
 * Reads raw props from a composite fiber.
 */
function getFiberProps(fiber: Fiber): unknown {
  return (fiber as Fiber & { memoizedProps?: unknown }).memoizedProps;
}

/**
 * Decodes a CSS module class name to its original local name.
 */
function decodeCssModuleClass(className: string): string | null {
  const match = CSS_MODULE_PATTERN.exec(className);
  return match ? match[1] : null;
}

/**
 * Formats a className prop using decoded CSS module class names only.
 */
function formatClassNameProp(className: string): string {
  const decodedClassNames = className
    .split(/\s+/)
    .map(decodeCssModuleClass)
    .filter((value): value is string => value !== null);

  if (decodedClassNames.length === 0) {
    return '';
  }

  return JSON.stringify(decodedClassNames.join(' '));
}

/**
 * Serializes a scalar prop value.
 */
function serializePropValue(value: string | number | boolean): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

/**
 * Returns true if a prop entry should be included in the output.
 */
function shouldIncludePropEntry(key: string, value: unknown): boolean {
  const lowerKey = key.toLowerCase();

  if (value === null || value === undefined || value === '') {
    return false;
  }

  if (key === 'children') {
    return false;
  }

  if (key.startsWith('aria-') || key.startsWith('data-')) {
    return false;
  }

  if (/^on[A-Z]/.test(key)) {
    return false;
  }

  if (lowerKey === 'style') {
    return false;
  }

  if (lowerKey === 'htmlfor') {
    return false;
  }

  if (lowerKey === 'ref' || lowerKey.endsWith('ref')) {
    return false;
  }

  if (lowerKey === 'id' || lowerKey.endsWith('id')) {
    return false;
  }

  if (lowerKey === 'key' || lowerKey.endsWith('key')) {
    return false;
  }

  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  ) {
    return false;
  }

  return true;
}

/**
 * Returns prop entries as key: value strings for flat formatting.
 */
function formatPropEntries(props: unknown): string[] {
  if (
    props === null ||
    props === undefined ||
    props === '' ||
    typeof props !== 'object' ||
    Array.isArray(props)
  ) {
    return [];
  }

  return Object.entries(props)
    .filter(([key, value]) => shouldIncludePropEntry(key, value))
    .map(([key, value]) => {
      const serialized =
        key === 'className' && typeof value === 'string'
          ? formatClassNameProp(value)
          : serializePropValue(value);
      if (!serialized) return null;
      return `${key}: ${serialized}`;
    })
    .filter((entry): entry is string => entry !== null);
}

/**
 * Recursively walks the fiber tree and builds a tree of composite component nodes.
 */
function buildTree(
  fiber: Fiber | null,
  depth = 0,
  filterComponents = true,
): TreeNode[] {
  if (!fiber) return [];

  const nodes: TreeNode[] = [];
  let current: Fiber | null = fiber;
  while (current) {
    if (isCompositeFiber(current)) {
      const name = getDisplayName(current) || 'Anonymous';
      if (filterComponents && (isProviderOrContext(name) || isPrivate(name))) {
        // Skip but recurse into children
        nodes.push(...buildTree(current.child, depth, filterComponents));
      } else {
        const children = buildTree(current.child, depth + 1, filterComponents);
        nodes.push({
          name,
          fiber: current,
          textFibers: [current],
          depth,
          children,
        });
      }
    } else {
      nodes.push(...buildTree(current.child, depth, filterComponents));
    }
    current = current.sibling;
  }
  return nodes;
}

/**
 * Collects all fibers from the tree for batch source resolution.
 */
function collectFibers(nodes: TreeNode[]): Fiber[] {
  const fibers: Fiber[] = [];
  for (const node of nodes) {
    fibers.push(node.fiber);
    fibers.push(...collectFibers(node.children));
  }
  return fibers;
}

/**
 * Resolves sources for all fibers in parallel, returns a Map for lookup.
 */
async function resolveSources(
  fibers: Fiber[],
): Promise<Map<Fiber, FiberSource>> {
  const results = await Promise.all(
    fibers.map(f => getSource(f, true).catch(() => null)),
  );
  const map = new Map<Fiber, FiberSource>();
  fibers.forEach((f, i) => {
    if (results[i]) {
      map.set(f, results[i]);
    }
  });
  return map;
}

/**
 * Formats the source location as a short path string.
 */
function formatSource(source: FiberSource | undefined): string {
  if (!source?.fileName) return '';
  const fileName = normalizeFileName(source.fileName);
  return ` (${fileName}:${source.lineNumber})`;
}

/**
 * Collapses children that have the same name as their parent when component
 * filtering is enabled.
 * Only one level at a time: 4 levels of Text → 2 levels, not 1.
 */
function collapseWrapped(nodes: TreeNode[], depth = 0): TreeNode[] {
  return nodes.map(node => {
    const textFibers = [...node.textFibers];
    const collapsed: TreeNode[] = [];
    for (const child of node.children) {
      if (child.name === node.name) {
        // Skip this child, promote its children
        textFibers.push(...child.textFibers);
        collapsed.push(...child.children);
      } else {
        collapsed.push(child);
      }
    }
    return {
      ...node,
      textFibers,
      depth,
      children: collapseWrapped(collapsed, depth + 1),
    };
  });
}

/**
 * Formats the tree nodes into indented lines with source locations.
 */
function formatLines(
  nodes: TreeNode[],
  sourceMap: Map<Fiber, FiberSource>,
  textMap: Map<Fiber, NodeTextContent>,
  showSource: boolean,
  showProps: boolean,
): string[] {
  const lines: string[] = [];
  for (const node of nodes) {
    const source = showSource ? formatSource(sourceMap.get(node.fiber)) : '';
    const textEntries = formatTextEntries(textMap.get(node.fiber));
    const propEntries = showProps
      ? formatPropEntries(getFiberProps(node.fiber))
      : [];
    const allEntries = [...textEntries, ...propEntries];
    const suffix = allEntries.length > 0 ? ` - ${allEntries.join(', ')}` : '';
    lines.push(`${'  '.repeat(node.depth)}${node.name}${source}${suffix}`);
    lines.push(
      ...formatLines(node.children, sourceMap, textMap, showSource, showProps),
    );
  }
  return lines;
}

/**
 * Captures the React component tree and returns it as a formatted string.
 */
export async function captureReactTree(
  options: CaptureOptions = {},
): Promise<string | null> {
  const {
    showSource = false,
    showProps = true,
    filterComponents = true,
    rootElement,
  } = options;

  let childFiber: Fiber | null;
  if (rootElement) {
    // Find the host fiber for this DOM element and build from its children,
    // so we only capture components rendered *inside* the element.
    const elementFiber = getFiberForElement(rootElement);
    if (!elementFiber) {
      console.warn('[vellum] No fiber found for element');
      return null;
    }
    childFiber = elementFiber.child;
  } else {
    const root = getRootFiber();
    if (!root) {
      console.warn('[vellum] No React root fiber found');
      return null;
    }
    childFiber = root.child;
  }

  let tree = buildTree(childFiber, 0, filterComponents);
  if (filterComponents) {
    tree = collapseWrapped(tree);
  }
  let sourceMap = new Map<Fiber, FiberSource>();
  if (showSource) {
    const fibers = collectFibers(tree);
    sourceMap = await resolveSources(fibers);
  }
  const textMap = resolveTextContent(tree);
  const header = window.location.href;
  const lines = formatLines(tree, sourceMap, textMap, showSource, showProps);
  const output = header + '\n' + lines.join('\n');
  return output;
}
