import { createContext } from 'react';

/**
 * A kebab-case string identifier, e.g. "agent-playground-layout" or "accordion".
 */
export type KebabCaseId = string & { readonly __brand?: 'KebabCaseId' };

export interface FeatureVariant {
  /** Kebab-case identifier for this variant (used in URL as part of ?variant=feature--variant) */
  id: KebabCaseId;
  /** Human-readable description shown in tooltips and the floating UI */
  label: string;
}

export interface Feature {
  /** Kebab-case identifier for this feature (used in URL as part of ?variant=feature--variant) */
  id: KebabCaseId;
  /** Display name shown in the floating UI and badge menu */
  label: string;
  /** Internal notes describing what this feature explores */
  notes: string;
  /** Route to navigate to when selecting this feature from the badge menu */
  defaultRoute: string;
  /** Fallback values for :param segments when the current URL can't provide them */
  defaultParams?: Record<string, string>;
  /** Route patterns this feature applies to (supports :param segments) */
  routes: string[];
  /** The variant options within this feature. Empty or omitted for variant-less features. */
  variants?: FeatureVariant[];
}

export interface FeatureConfig {
  /** All features defined in features.json */
  features: Feature[];
}

export interface FeatureContextValue {
  /** All features from config */
  allFeatures: Feature[];
  /** Features that match the current route */
  applicableFeatures: Feature[];
  /** Map of featureId → active variantId for features with variants */
  activeVariants: Record<string, string>;
  /** Navigate to a specific variant (updates URL params) */
  selectVariant: (featureId: string, variantId: string) => void;
  /** Get the full path (with query params) for a specific variant */
  getVariantPath: (featureId: string, variantId: string) => string;
  /** Whether the floating feature UI is visible */
  featureUIVisible: boolean;
  /** Toggle visibility of the floating feature UI */
  setFeatureUIVisible: (visible: boolean) => void;
  /** Whether the Vellum inspector is visible */
  vellumVisible: boolean;
  /** Toggle visibility of the Vellum inspector */
  setVellumVisible: (visible: boolean) => void;
}

export const FeatureContext = createContext<FeatureContextValue>({
  allFeatures: [],
  applicableFeatures: [],
  activeVariants: {},
  selectVariant: () => {},
  getVariantPath: () => '',
  featureUIVisible: true,
  setFeatureUIVisible: () => {},
  vellumVisible: false,
  setVellumVisible: () => {},
});
