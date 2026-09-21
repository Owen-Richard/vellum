import {
  isCompositeFiber,
  isHostFiber,
  getDisplayName,
  shouldFilterFiber,
  getFiberFromHostInstance,
  getNearestHostFibers,
  type Fiber,
} from 'bippy';

/**
 * Walk up from a host fiber to find the nearest meaningful composite fiber (React component).
 */
export function findOwnerComponent(fiber: Fiber): Fiber | null {
  let current = fiber.return;
  while (current) {
    if (isCompositeFiber(current) && !shouldFilterFiber(current)) {
      const name = getDisplayName(current.type);
      if (name) return current;
    }
    current = current.return;
  }
  return null;
}

/**
 * Given a DOM element, find its fiber and then its owner component fiber.
 */
export function findOwnerComponentFromElement(el: HTMLElement): Fiber | null {
  const fiber = getFiberFromHostInstance(el);
  if (!fiber) return null;
  return findOwnerComponent(fiber);
}

/**
 * Collect all direct host (DOM) elements rendered by a composite fiber.
 * This descends through the fiber's children but stops at host fibers
 * (doesn't recurse into their children) and skips filtered composites.
 */
export function getRenderedElements(fiber: Fiber): HTMLElement[] {
  const hostFibers = getNearestHostFibers(fiber);
  const elements: HTMLElement[] = [];
  for (const hf of hostFibers) {
    // Accept both HTMLElement and SVGElement so components that render SVG
    // are still represented. Downstream code only touches Element-level APIs.
    if (hf.stateNode instanceof Element) {
      elements.push(hf.stateNode as HTMLElement);
    }
  }
  return elements;
}

/**
 * Walk up from a host fiber and collect every composite (React component)
 * ancestor, nearest-first. Skips composites bippy considers internal noise
 * (HMR wrappers, etc.) and anything without a resolvable display name.
 */
export function collectComponentAncestors(
  fiber: Fiber,
  maxDepth = 25,
): { name: string; fiber: Fiber }[] {
  const ancestors: { name: string; fiber: Fiber }[] = [];
  let current: Fiber | null = fiber.return;
  while (current && ancestors.length < maxDepth) {
    if (isCompositeFiber(current) && !shouldFilterFiber(current)) {
      const name = getDisplayName(current.type);
      if (name) ancestors.push({ name, fiber: current });
    }
    current = current.return;
  }
  return ancestors;
}

/**
 * Convenience wrapper: given a DOM element, return its composite-component
 * ancestor chain (nearest first).
 */
export function getComponentAncestorsFromElement(
  el: HTMLElement,
): { name: string; fiber: Fiber }[] {
  const fiber = getFiberFromHostInstance(el);
  if (!fiber) return [];
  return collectComponentAncestors(fiber);
}
