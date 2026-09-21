export { Vellum, VellumOverlay } from './components/Vellum';
export type { VellumProps } from './components/Vellum';
export { FloatingBar } from './components/FloatingBar';
export type { FloatingBarProps } from './components/FloatingBar';
export { VellumProvider, useVellum } from './context/VellumContext';
export type {
  VellumState,
  VellumAction,
  VellumMode,
  Annotation,
} from './types/vellum';
export {
  transformSnippetWithContext,
  captureReactTree,
} from './core/reference';
export { describeElement } from './core/describeElement';
export type { ElementDetail } from './core/describeElement';
export type {
  VellumFilter,
  DisplayFilters,
  ComposedFilters,
} from './core/filters/types';
export {
  composeFilters,
  IDENTITY_FILTERS,
  IDENTITY_DISPLAY_FILTERS,
} from './core/filters/compose';
export * as filters from './core/filters/presets';

// Feature/variant system
export {
  FeatureContext,
  FeatureProvider,
  FeatureFloatingUI,
  FeatureMenu,
  useFeature,
  useFeatureConfig,
} from './features';
export type {
  KebabCaseId,
  FeatureVariant,
  Feature,
  FeatureConfig,
  FeatureContextValue,
  FeatureProviderProps,
  FeatureFloatingUIProps,
  FeatureMenuProps,
} from './features';
