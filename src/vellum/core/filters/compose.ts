import type { VellumFilter, DisplayFilters, ComposedFilters } from './types';

/** Identity DisplayFilters — no filtering, no transformation (for real-time UI). */
export const IDENTITY_DISPLAY_FILTERS: DisplayFilters = {
  transformClassName: (className: string) => className,
  filterComponent: () => true,
  filterProp: () => true,
  collapseWrappers: false,
};

/** Identity ComposedFilters — no filtering, no transformation. */
export const IDENTITY_FILTERS: ComposedFilters = {
  ...IDENTITY_DISPLAY_FILTERS,
  filterSource: () => true,
  filterProp: () => true,
};

/**
 * Composes an array of VellumFilter objects into a single ComposedFilters.
 *
 * - transformClassName: chains sequentially; if any returns null, the class is hidden.
 * - filterComponent / filterSource / filterProp: AND — all must return true.
 * - collapseWrappers: OR — any true enables.
 */
export function composeFilters(filters: VellumFilter[]): ComposedFilters {
  if (filters.length === 0) return IDENTITY_FILTERS;

  const classNameTransforms = filters
    .map(f => f.transformClassName)
    .filter((fn): fn is NonNullable<typeof fn> => fn != null);

  const componentFilters = filters
    .map(f => f.filterComponent)
    .filter((fn): fn is NonNullable<typeof fn> => fn != null);

  const sourceFilters = filters
    .map(f => f.filterSource)
    .filter((fn): fn is NonNullable<typeof fn> => fn != null);

  const propFilters = filters
    .map(f => f.filterProp)
    .filter((fn): fn is NonNullable<typeof fn> => fn != null);

  const collapseWrappers = filters.some(f => f.collapseWrappers === true);

  return {
    transformClassName: (className: string) => {
      let result: string | null = className;
      for (const transform of classNameTransforms) {
        result = transform(result);
        if (result === null) return null;
      }
      return result;
    },

    filterComponent: (name: string) => {
      for (const filter of componentFilters) {
        if (!filter(name)) return false;
      }
      return true;
    },

    filterSource: (fileName: string) => {
      for (const filter of sourceFilters) {
        if (!filter(fileName)) return false;
      }
      return true;
    },

    filterProp: (key: string, value: unknown) => {
      for (const filter of propFilters) {
        if (!filter(key, value)) return false;
      }
      return true;
    },

    collapseWrappers,
  };
}
