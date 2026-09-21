import type { VellumFilter } from './types';

/** CSS module class pattern: _originalName_hash_number (Vite dev) or _originalName_hash (prod) */
const CSS_MODULE_PATTERN = /^_([a-zA-Z][a-zA-Z0-9]*)_[a-z0-9]+(?:_\d+)?$/;

/**
 * Decodes CSS module hashed class names to their original local names.
 * e.g., `_container_abc12_1` → `container`
 * Non-module classes pass through unchanged.
 */
export const cssModules: VellumFilter = {
  transformClassName: (className: string) => {
    const match = CSS_MODULE_PATTERN.exec(className);
    return match ? match[1] : className;
  },
};

/**
 * Collapse same-name wrapper nodes in the component tree.
 * e.g., Button > Button > Button → single Button.
 * TODO: Evolve into a more advanced `transformTree` callback.
 */
export const collapseWrappers: VellumFilter = {
  collapseWrappers: true,
};

/**
 * Hides React Provider, Context, and Consumer wrapper components.
 */
export const hideProviders: VellumFilter = {
  filterComponent: (name: string) =>
    !['Provider', 'Context', 'Consumer'].some(s => name.endsWith(s)),
};

/**
 * Hides private/internal components (those starting with _ or 'Anonymous').
 */
export const hidePrivate: VellumFilter = {
  filterComponent: (name: string) =>
    !name.startsWith('_') && !name.startsWith('Anonymous'),
};

/**
 * Griffel atomic class pattern: starts with 'f' (normal) or 'r' (reset) prefix
 * followed by a base-36 hash of 5-7 chars (e.g., fuxngvv, f1q1yqic, r1f29ykk).
 * Source: @griffel/core/constants.esm.js — HASH_PREFIX='f', RESET_HASH_PREFIX='r', SEQUENCE_HASH_LENGTH=7
 */
const GRIFFEL_CLASS_PATTERN = /^[fr][a-z0-9]{5,7}$/;

/**
 * Removes Griffel (Fluent UI CSS-in-JS) atomic utility classes and sequence hashes from display.
 * Atomic classes: short hashed like `fuxngvv`, `fy5bs14`, `r1f29ykk`.
 * Sequence hashes: triple-underscore prefixed like `___xmraan0_2hpd790`.
 */
export const hideGriffel: VellumFilter = {
  transformClassName: (className: string) => {
    if (className.startsWith('___')) return null;
    if (GRIFFEL_CLASS_PATTERN.test(className)) return null;
    return className;
  },
};

/** Props that are noise in reference context (framework/routing internals, always-present keys). */
const NOISY_PROP_KEYS = new Set([
  'children',
  'params',
  'loaderData',
  'matches',
  'ref',
  'className',
]);

/**
 * Filters out common noisy/framework props from reference context output.
 */
export const hideNoisyProps: VellumFilter = {
  filterProp: (key: string) => !NOISY_PROP_KEYS.has(key),
};

/**
 * Filters source paths to only project-local files.
 * Excludes node_modules, bundler chunks, and distant relative paths.
 */
export const projectSourceOnly: VellumFilter = {
  filterSource: (fileName: string) => {
    if (fileName.includes('node_modules')) return false;
    if (fileName.includes('chunk-')) return false;
    if (fileName.startsWith('../../')) return false;
    return true;
  },
};
