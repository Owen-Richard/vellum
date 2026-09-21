// FUTURE: when this selector approach hits its limits, consider replacing it
// with a runtime-only fingerprint+scoring strategy (no build tooling). Capture
// a bag of signals per element (tag, role, accessible name, text/textHash,
// data-*, normalized classes, structural path, ancestor anchors) and on
// rehydration score candidates and pick the best match above a confidence gap.
// More resilient to class-hash churn, Fluent useId taint, and minor refactors;
// downside is ~5-10x storage per annotation and O(candidates) resolution.

const STABLE_ATTRS = ['data-testid', 'data-id', 'aria-label'] as const;

// Normalize a class to its stable identifier, stripping per-build hashes and
// per-instance suffixes. Returns null for classes we should drop entirely.
//
//   __anything…       → null         (compiler-internal, e.g. griffel reset bases)
//   _name_hash…       → _name        (Vite CSS module)
//   name_anything…    → name         (e.g. Fluent's `fui-X_r_17_` useId-tainted)
//   name              → name         (unchanged)
//
// Callers should use `[class*="..."]` whenever the result differs from input,
// and `.name` when it's unchanged.
function normalizeClass(cls: string): string | null {
  if (cls.startsWith('__')) return null;
  if (cls.startsWith('_')) {
    const m = cls.match(/^(_[^_]+)/);
    return m ? m[1] : cls;
  }
  const i = cls.indexOf('_');
  return i === -1 ? cls : cls.slice(0, i);
}

function classToSelector(cls: string): string | null {
  const norm = normalizeClass(cls);
  if (norm === null) return null;
  if (norm === cls) return `.${CSS.escape(cls)}`;
  return `[class*="${CSS.escape(norm)}"]`;
}

function siblingMatchesClass(sib: Element, cls: string): boolean {
  const norm = normalizeClass(cls);
  if (norm === null) return true; // dropped — no constraint
  if (norm === cls) return sib.classList.contains(cls);
  return Array.from(sib.classList).some(sc => sc.includes(norm));
}

// Skip `id` attrs (mostly `useId()` output, shifts between reloads).
// DO NOT short-circuit the walk when the partial selector is "unique on the
// page" — in a SPA the same selector may match a different element on another
// route. Always walk the full parent chain.
export function getUniqueSelector(el: HTMLElement): string {
  const parts: string[] = [];
  let current: HTMLElement | null = el;

  while (
    current &&
    current !== document.body &&
    current !== document.documentElement
  ) {
    const tag = current.tagName.toLowerCase();

    const stableAttr = STABLE_ATTRS.find(attr => current!.hasAttribute(attr));
    if (stableAttr) {
      parts.unshift(
        `${tag}[${stableAttr}="${CSS.escape(current.getAttribute(stableAttr)!)}"]`,
      );
      current = current.parentElement;
      continue;
    }

    const classSelectors = Array.from(current.classList)
      .map(classToSelector)
      .filter((s): s is string => s !== null)
      .join('');

    let selector = tag + classSelectors;

    const parent = current.parentElement;
    if (parent) {
      const matchingSiblings = Array.from(parent.children).filter(sib => {
        if (sib.tagName.toLowerCase() !== tag) return false;
        if (!classSelectors) return true;
        return Array.from(current!.classList).every(c =>
          siblingMatchesClass(sib, c),
        );
      });

      if (matchingSiblings.length > 1) {
        const sameTag = Array.from(parent.children).filter(
          sib => sib.tagName.toLowerCase() === tag,
        );
        const typeIndex = sameTag.indexOf(current) + 1;
        selector += `:nth-of-type(${typeIndex})`;
      }
    }

    parts.unshift(selector);
    current = current.parentElement;
  }

  return parts.join(' > ');
}

export function findElementBySelector(selector: string): HTMLElement | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

export function getElementLabel(el: HTMLElement): { tag: string; suffix: string } {
  const tag = el.tagName.toLowerCase();
  let suffix = '';
  if (el.id) suffix += `#${el.id}`;
  for (const cls of el.classList) {
    suffix += `.${cls}`;
  }
  return { tag, suffix };
}
