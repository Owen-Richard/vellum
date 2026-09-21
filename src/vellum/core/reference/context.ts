import {
  getFiberFromHostInstance,
  isInstrumentationActive,
  getDisplayName,
  isCompositeFiber,
  type Fiber,
} from 'bippy';
import { getSource, normalizeFileName, type FiberSource } from 'bippy/source';
import type { ComposedFilters } from '../filters/types';
import { IDENTITY_FILTERS } from '../filters/compose';
import { describeElement } from '../describeElement';

/**
 * Captures React component context for an element and generates reference text.
 * Uses fiber tree inspection to identify component ancestry and properties.
 */

interface ComponentInfo {
  name: string;
  props: Record<string, unknown>;
  source: FiberSource | null;
  fiber: Fiber;
}

/** Find the nearest element that has a fiber attached (bippy may not resolve on text nodes, etc.) */
function findNearestFiberElement(element: Element): Element {
  if (!isInstrumentationActive()) return element;
  let current: Element | null = element;
  while (current) {
    if (getFiberFromHostInstance(current)) return current;
    current = current.parentElement;
  }
  return element;
}

/** Walk up the fiber tree and collect composite (function/class) component fibers. */
function collectAncestorFibers(
  fiber: Fiber,
  maxDepth = 15,
): { name: string; fiber: Fiber }[] {
  const ancestors: { name: string; fiber: Fiber }[] = [];
  let current: Fiber | null = fiber.return;
  while (current && ancestors.length < maxDepth) {
    if (isCompositeFiber(current)) {
      const name = getDisplayName(current.type);
      if (name) {
        ancestors.push({ name, fiber: current });
      }
    }
    current = current.return;
  }
  return ancestors;
}

/** Check if a resolved source path belongs to our codebase (not node_modules or bundler chunks). */
function isProjectSource(source: FiberSource | null, filterSource?: ComposedFilters['filterSource']): boolean {
  if (!source?.fileName) return false;
  const fileName = normalizeFileName(source.fileName);
  // Always filter node_modules and bundler chunks
  if (fileName.includes('node_modules')) return false;
  if (fileName.includes('chunk-')) return false;
  if (fileName.startsWith('../../')) return false;
  // If a custom filterSource is provided, apply it
  if (filterSource) return filterSource(fileName);
  return true;
}

/** Get the first non-project composite component name between host fiber and first project component. */
function getFirstIntermediateComponent(
  hostFiber: Fiber,
  projectFiber: Fiber,
  filters: ComposedFilters,
): string | null {
  let current: Fiber | null = hostFiber.return;
  while (current && current !== projectFiber) {
    if (isCompositeFiber(current)) {
      const name = getDisplayName(current.type);
      if (name && filters.filterComponent(name)) {
        return name;
      }
    }
    current = current.return;
  }
  return null;
}

/** Resolve source locations for ancestor fibers using bippy/source (source map symbolication). */
async function resolveAncestorSources(
  fiber: Fiber,
  filters: ComposedFilters,
  maxDepth = 15,
): Promise<ComponentInfo[]> {
  const raw = collectAncestorFibers(fiber, maxDepth);
  // Resolve all sources in parallel
  const sources = await Promise.all(
    raw.map(a => getSource(a.fiber, true).catch(() => null)),
  );
  return raw
    .map((a, i) => ({
      name: a.name,
      props: {},
      source: sources[i] ?? null,
      fiber: a.fiber,
    }))
    .filter(a => isProjectSource(a.source, filters.filterSource) && filters.filterComponent(a.name));
}

/** Extract display-worthy props from a fiber, filtering noise in a single pass. */
function getDisplayProps(
  props: Record<string, unknown> | null | undefined,
  filterProp: ComposedFilters['filterProp'] = () => true,
): Record<string, unknown> {
  if (!props) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!filterProp(key, value)) continue;
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'function') continue;
    if (typeof value === 'object' && value !== null) continue;
    if (typeof value === 'string' && value.length > 100) {
      result[key] = value.slice(0, 100) + '…';
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** Format a source location string from a FiberSource. */
function formatSourceLoc(source: FiberSource | null): string {
  if (!source?.fileName) return '';
  return `${normalizeFileName(source.fileName)}${source.lineNumber ? ':' + source.lineNumber : ''}`;
}

/** Format the React context block that will be appended to the snippet. */
function formatContextBlock(info: {
  tree: ComponentInfo[];
  elementDescription: string;
  intermediateComponent: string | null;
}): string {
  const lines: string[] = [''];
  const nearest = info.tree[0];

  // 1. ComponentName > IntermediateComponent > element description
  const pathParts: string[] = [];
  if (nearest) pathParts.push(nearest.name);
  if (
    info.intermediateComponent &&
    info.intermediateComponent !== nearest?.name
  )
    pathParts.push(info.intermediateComponent);
  const prefix = pathParts.length > 0 ? pathParts.join(' > ') + ' > ' : '';
  lines.push(`${prefix}${info.elementDescription}`);

  // 2. Display props of nearest component
  if (nearest) {
    const entries = Object.entries(nearest.props);
    if (entries.length > 0) {
      const propStr = entries
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join(', ');
      lines.push(`props: { ${propStr} }`);
    }
  }

  // 3. Each component in the tree on its own line with file path
  for (const node of info.tree) {
    const loc = formatSourceLoc(node.source);
    lines.push(loc ? `in ${node.name} (${loc})` : `in ${node.name}`);
  }

  return lines.join('\n');
}

/**
 * Generates React component context for a selected element.
 * Returns component ancestry and source locations to aid code navigation.
 */
export async function transformSnippetWithContext(
  element: Element,
  filters: ComposedFilters = IDENTITY_FILTERS,
): Promise<string> {
  const resolvedElement = findNearestFiberElement(element);
  const fiber = getFiberFromHostInstance(resolvedElement);

  if (!fiber) {
    return describeElement(element, { detail: 'full', filters });
  }

  // Find nearest composite (function/class) component
  let componentName: string | null = null;
  let componentFiber: Fiber | null = fiber;
  if (!isCompositeFiber(fiber)) {
    componentFiber = null;
    let current: Fiber | null = fiber.return;
    while (current) {
      if (isCompositeFiber(current)) {
        componentName = getDisplayName(current.type);
        componentFiber = current;
        break;
      }
      current = current.return;
    }
  } else {
    componentName = getDisplayName(fiber.type);
  }

  // Resolve source for the nearest component via source maps
  const componentSource = componentFiber
    ? await getSource(componentFiber, true).catch(() => null)
    : null;

  const ancestors = componentFiber
    ? await resolveAncestorSources(componentFiber, filters)
    : [];

  // Build full component tree: selected component + filtered ancestors
  const tree: ComponentInfo[] = [];
  if (
    componentFiber &&
    componentName &&
    filters.filterComponent(componentName)
  ) {
    tree.push({
      name: componentName,
      props: getDisplayProps(componentFiber.memoizedProps, filters.filterProp),
      source: componentSource,
      fiber: componentFiber,
    });
  }
  tree.push(...ancestors);

  // Get the first intermediate non-project component between host element and first project component
  const intermediateComponent =
    tree[0] && fiber !== tree[0].fiber
      ? getFirstIntermediateComponent(fiber, tree[0].fiber, filters)
      : null;

  const elementDescription = describeElement(resolvedElement, { detail: 'full', filters });

  const contextBlock = formatContextBlock({
    tree,
    elementDescription,
    intermediateComponent,
  });

  return contextBlock;
}
