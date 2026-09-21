/**
 * A VellumFilter is a partial configuration object that controls how Vellum
 * displays and processes elements, components, and their properties.
 *
 * Consumers provide an array of VellumFilter objects. Vellum composes them:
 * - transformClassName: chains (each result feeds into next; null = hidden)
 * - filterComponent / filterSource / filterProp: AND — all must return true to include
 * - collapseWrappers: OR — any true enables it
 */
export interface VellumFilter {
  /** Transform a CSS class name for display. Return null to hide the class entirely. */
  transformClassName?: (className: string) => string | null;

  /** Return false to exclude a component from tree/display/context output everywhere. */
  filterComponent?: (name: string) => boolean;

  /** Return false to exclude a source file from reference context output. */
  filterSource?: (fileName: string) => boolean;

  /** Return false to exclude a prop from display. */
  filterProp?: (key: string, value: unknown) => boolean;

  /**
   * Collapse same-name wrapper nodes (e.g., Button > Button > Button → Button).
   * TODO: Evolve into a more advanced `transformTree` callback that can restructure nodes.
   */
  collapseWrappers?: boolean;
}

/**
 * A composed filter with all filter functions resolved (never undefined).
 * Used internally — consumers never construct this directly.
 */

/**
 * Display filters — cheap to evaluate, safe for real-time UI (tree view, labels, panels).
 * These run on every render/interaction and must not trigger expensive lookups.
 */
export interface DisplayFilters {
  /** Transform a class name for display. Returns null to hide. */
  transformClassName: (className: string) => string | null;

  /** Returns true if component should be included. */
  filterComponent: (name: string) => boolean;

  /** Returns true if prop should be included. */
  filterProp: (key: string, value: unknown) => boolean;

  /** Whether to collapse same-name wrapper nodes. */
  collapseWrappers: boolean;
}

/**
 * Full composed filters including expensive operations (source map lookups).
 * Only used during clipboard/reference context generation — never in real-time UI.
 */
export interface ComposedFilters extends DisplayFilters {
  /** Returns true if source file should be included. Expensive — requires source map resolution. */
  filterSource: (fileName: string) => boolean;
}
