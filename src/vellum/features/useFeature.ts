import { useContext } from 'react';
import { FeatureContext } from './FeatureContext';

/**
 * Hook for component authors to read the active variant for a specific feature.
 *
 * Returns:
 * - A variant `id` string if the feature has variants and one is active
 * - `true` if the feature is variant-less and applies to the current route
 * - `null` if the feature doesn't apply to the current route
 */
export function useFeature(featureId: string): string | true | null {
  const ctx = useContext(FeatureContext);

  const feature = ctx.applicableFeatures.find(f => f.id === featureId);
  if (!feature) return null;

  // Variant-less feature — it applies to the current route, always on
  if (!feature.variants || feature.variants.length === 0) {
    return true;
  }

  // Feature with variants — return the active variant id (or first variant as fallback)
  return ctx.activeVariants[featureId] ?? feature.variants[0].id;
}
