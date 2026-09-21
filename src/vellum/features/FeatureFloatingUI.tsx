import type { JSX } from 'react';
import { Button, ButtonGroup } from '../common';
import { FloatingBar } from '../components/FloatingBar';
import { useFeatureConfig } from './useFeatureConfig';
import styles from './FeatureFloatingUI.module.css';

export interface FeatureFloatingUIProps {
  navigate: (path: string) => void;
}

export function FeatureFloatingUI({ navigate }: FeatureFloatingUIProps): JSX.Element {
  const { applicableFeatures, activeVariants, getVariantPath } = useFeatureConfig();

  // Only show features that have variants
  const featuresWithVariants = applicableFeatures.filter(
    f => f.variants && f.variants.length > 0,
  );

  if (featuresWithVariants.length === 0) {
    return <></>;
  }

  return (
    <FloatingBar
      storageKey="feature-floating-ui-pos"
      inline
    >
      {featuresWithVariants.map((feature, index) => (
        <div key={feature.id} className={styles.featureGroup}>
          {index > 0 && <div className={styles.featureDivider} />}
          <span className={styles.label}>{feature.label}:</span>
          <ButtonGroup>
            {feature.variants!.map(v => {
              const isActive = activeVariants[feature.id] === v.id;
              return (
                <Button
                  key={v.id}
                  variant="ghost"
                  active={isActive}
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => navigate(getVariantPath(feature.id, v.id))}
                >
                  {v.label}
                </Button>
              );
            })}
          </ButtonGroup>
        </div>
      ))}
    </FloatingBar>
  );
}
