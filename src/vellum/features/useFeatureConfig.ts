import { useContext } from 'react';
import { FeatureContext } from './FeatureContext';

/**
 * Hook to access feature system awareness — all features, applicable features for the
 * current route, active variants, and navigation helpers.
 */
export function useFeatureConfig() {
  const ctx = useContext(FeatureContext);
  return {
    allFeatures: ctx.allFeatures,
    applicableFeatures: ctx.applicableFeatures,
    activeVariants: ctx.activeVariants,
    selectVariant: ctx.selectVariant,
    getVariantPath: ctx.getVariantPath,
    featureUIVisible: ctx.featureUIVisible,
    setFeatureUIVisible: ctx.setFeatureUIVisible,
    vellumVisible: ctx.vellumVisible,
    setVellumVisible: ctx.setVellumVisible,
  };
}
