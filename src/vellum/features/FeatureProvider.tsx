import type { JSX, PropsWithChildren } from 'react';
import { useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { FeatureContext, type FeatureConfig, type Feature } from './FeatureContext';
import { FeatureFloatingUI } from './FeatureFloatingUI';

/**
 * Match a route pattern (with :param segments) against an actual pathname.
 */
function matchRoute(pattern: string, pathname: string): boolean {
  const patternParts = pattern.split('/');
  const pathParts = pathname.split('/');

  if (patternParts.length !== pathParts.length) {
    return false;
  }

  return patternParts.every(
    (part, i) => part.startsWith(':') || part === pathParts[i],
  );
}

/**
 * Extract param values from a pathname using a matching route pattern.
 */
function extractParams(
  pattern: string,
  pathname: string,
): Record<string, string> {
  const patternParts = pattern.split('/');
  const pathParts = pathname.split('/');
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = pathParts[i];
    }
  }
  return params;
}

/**
 * Resolve a route pattern by replacing :param segments with actual values.
 */
function resolvePattern(
  pattern: string,
  params: Record<string, string>,
): string {
  return pattern
    .split('/')
    .map(part =>
      part.startsWith(':') ? (params[part.slice(1)] ?? part) : part,
    )
    .join('/');
}

/**
 * Parse all `variant` query params into a map of featureId → variantId.
 */
function parseVariantParams(
  searchParams: URLSearchParams,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const value of searchParams.getAll('variant')) {
    const delimiterIndex = value.indexOf('--');
    if (delimiterIndex > 0) {
      const featureId = value.substring(0, delimiterIndex);
      const variantId = value.substring(delimiterIndex + 2);
      if (featureId && variantId) {
        result[featureId] = variantId;
      }
    }
  }
  return result;
}

/**
 * Serialize a featureId → variantId map into URLSearchParams.
 */
function serializeVariantParams(
  current: URLSearchParams,
  activeVariants: Record<string, string>,
): URLSearchParams {
  const next = new URLSearchParams(current);
  next.delete('variant');
  for (const [featureId, variantId] of Object.entries(activeVariants)) {
    next.append('variant', `${featureId}--${variantId}`);
  }
  return next;
}

function getApplicableFeatures(
  features: Feature[],
  pathname: string,
): Feature[] {
  return features.filter(feature =>
    feature.routes.some(route => matchRoute(route, pathname)),
  );
}

export interface FeatureProviderProps extends PropsWithChildren {
  /** Feature configuration (the parsed features.json) */
  config: FeatureConfig;
  /** Current pathname from the router */
  pathname: string;
  /** Current search params from the router */
  searchParams: URLSearchParams;
  /** Callback to update search params (should use replace semantics) */
  setSearchParams: (
    updater: (prev: URLSearchParams) => URLSearchParams,
    options?: { replace?: boolean },
  ) => void;
  /** Callback to navigate to a path */
  navigate: (path: string) => void;
  /** Initial value for the Vellum inspector visibility toggle (persisted in localStorage). Defaults to false. */
  defaultVellumVisible?: boolean;
}

export function FeatureProvider({
  config,
  pathname,
  searchParams,
  setSearchParams,
  navigate,
  defaultVellumVisible = false,
  children,
}: FeatureProviderProps): JSX.Element {
  const [featureUIVisible, setFeatureUIVisible] = useLocalStorage(
    'feature-ui-visible',
    true,
  );
  const [vellumVisible, setVellumVisible] = useLocalStorage(
    'vellum-visible',
    defaultVellumVisible,
  );

  const lastVariantPerFeature = useRef<Record<string, string>>({});

  const applicableFeatures = useMemo(
    () => getApplicableFeatures(config.features, pathname),
    [config.features, pathname],
  );

  const urlVariants = useMemo(
    () => parseVariantParams(searchParams),
    [searchParams],
  );

  const activeVariants = useMemo(() => {
    const result: Record<string, string> = {};

    for (const feature of applicableFeatures) {
      if (!feature.variants || feature.variants.length === 0) continue;

      const fromUrl = urlVariants[feature.id];
      if (fromUrl && feature.variants.some(v => v.id === fromUrl)) {
        result[feature.id] = fromUrl;
      } else {
        const remembered = lastVariantPerFeature.current[feature.id];
        if (remembered && feature.variants.some(v => v.id === remembered)) {
          result[feature.id] = remembered;
        } else {
          result[feature.id] = feature.variants[0].id;
        }
      }
    }

    return result;
  }, [applicableFeatures, urlVariants]);

  useEffect(() => {
    for (const [featureId, variantId] of Object.entries(activeVariants)) {
      lastVariantPerFeature.current[featureId] = variantId;
    }

    const currentUrlVariants = parseVariantParams(searchParams);

    const applicableFeatureIds = new Set(
      applicableFeatures
        .filter(f => f.variants && f.variants.length > 0)
        .map(f => f.id),
    );

    let needsUpdate = false;

    for (const [featureId, variantId] of Object.entries(activeVariants)) {
      if (currentUrlVariants[featureId] !== variantId) {
        needsUpdate = true;
        break;
      }
    }

    if (!needsUpdate) {
      for (const featureId of Object.keys(currentUrlVariants)) {
        if (!applicableFeatureIds.has(featureId)) {
          needsUpdate = true;
          break;
        }
      }
    }

    if (needsUpdate) {
      setSearchParams(prev => serializeVariantParams(prev, activeVariants), {
        replace: true,
      });
    }
  }, [activeVariants, applicableFeatures, searchParams, setSearchParams]);

  const selectVariant = useCallback(
    (featureId: string, variantId: string) => {
      setSearchParams(
        prev => {
          const current = parseVariantParams(prev);
          current[featureId] = variantId;
          return serializeVariantParams(prev, current);
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const getVariantPath = useCallback(
    (featureId: string, variantId: string): string => {
      const feature = config.features.find(f => f.id === featureId);
      if (!feature) return pathname;

      let params: Record<string, string> = { ...feature.defaultParams };
      let currentRouteMatches = false;
      for (const routePattern of feature.routes) {
        if (matchRoute(routePattern, pathname)) {
          params = extractParams(routePattern, pathname);
          currentRouteMatches = true;
          break;
        }
      }

      const resolvedPath = currentRouteMatches
        ? pathname
        : resolvePattern(feature.defaultRoute, params);

      const newVariants = { ...activeVariants, [featureId]: variantId };
      const variantParams = Object.entries(newVariants)
        .map(([fId, vId]) => `variant=${fId}--${vId}`)
        .join('&');

      return `${resolvedPath}?${variantParams}`;
    },
    [config.features, pathname, activeVariants],
  );

  const contextValue = useMemo(
    () => ({
      allFeatures: config.features,
      applicableFeatures,
      activeVariants,
      selectVariant,
      getVariantPath,
      featureUIVisible,
      setFeatureUIVisible,
      vellumVisible,
      setVellumVisible,
    }),
    [
      config.features,
      applicableFeatures,
      activeVariants,
      selectVariant,
      getVariantPath,
      featureUIVisible,
      setFeatureUIVisible,
      vellumVisible,
      setVellumVisible,
    ],
  );

  const hasAnyFeatures = config.features.length > 0;

  return (
    <FeatureContext.Provider value={contextValue}>
      {children}
      {hasAnyFeatures && featureUIVisible && <FeatureFloatingUI navigate={navigate} />}
    </FeatureContext.Provider>
  );
}
