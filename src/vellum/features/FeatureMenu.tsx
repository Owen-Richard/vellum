import type { JSX, ReactNode } from 'react';
import { Fragment, useState } from 'react';
import { Button, Divider, Toggle, PopoverMenu } from '../common';
import { useFeatureConfig } from './useFeatureConfig';
import styles from './FeatureMenu.module.css';

export interface FeatureMenuProps {
  navigate: (path: string) => void;
  /** Custom trigger element. If omitted, a default "Prototype" badge is rendered. */
  trigger?: ReactNode;
}

export function FeatureMenu({
  navigate,
  trigger,
}: FeatureMenuProps): JSX.Element {
  const {
    allFeatures,
    activeVariants,
    featureUIVisible,
    setFeatureUIVisible,
    vellumVisible,
    setVellumVisible,
    getVariantPath,
  } = useFeatureConfig();

  const [open, setOpen] = useState(false);

  return (
    <PopoverMenu
      open={open}
      onOpenChange={setOpen}
      position="bottom"
      className={styles.menu}
      inline
      content={
        <>
          <div className={styles.header}>Prototype Features</div>
          <Divider />
          {allFeatures.length > 0 ? (
            <>
              {allFeatures.map((feature, index) => {
                const hasVariants =
                  feature.variants && feature.variants.length > 0;

                return (
                  <Fragment key={feature.id} >
                    {index > 0 && <Divider />}
                    {hasVariants ? (
                      <>
                        <div className={styles.groupHeader}>
                          {feature.label}
                        </div>
                        {feature.variants!.map(variant => {
                          const isActive =
                            activeVariants[feature.id] === variant.id;
                          return (
                            <Button
                              key={variant.id}
                              variant="ghost"
                              align="start"
                              className={styles.menuItem}
                              onClick={() =>
                                navigate(getVariantPath(feature.id, variant.id))
                              }
                            >
                              <span
                                className={
                                  isActive ? styles.dotActive : styles.dot
                                }
                              />
                              {variant.label}
                            </Button>
                          );
                        })}
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        align="start"
                        className={styles.menuItem}
                        onClick={() => navigate(feature.defaultRoute)}
                      >
                        {feature.label}{' '}
                        <span className={styles.subtleText}>(no variants)</span>
                      </Button>
                    )}
                  </Fragment>
                );
              })}
              <Divider />
              <div className={styles.toggleRow}>
                <span>Show feature selector</span>
                <Toggle
                  checked={featureUIVisible}
                  onChange={() => setFeatureUIVisible(!featureUIVisible)}
                />
              </div>
              <div className={styles.toggleRow}>
                <span>Show Vellum inspector</span>
                <Toggle
                  checked={vellumVisible}
                  onChange={() => setVellumVisible(!vellumVisible)}
                />
              </div>
            </>
          ) : (
            <>
              <div className={styles.emptyMessage}>
                <div className={styles.emptyMessageTitle}>
                  No prototype features are linked.
                </div>
              </div>
              <Divider />
              <div className={styles.toggleRow}>
                <span>Show Vellum inspector</span>
                <Toggle
                  checked={vellumVisible}
                  onChange={() => setVellumVisible(!vellumVisible)}
                />
              </div>
            </>
          )}
        </>
      }
    >
      {trigger ?? <span className={styles.badge}>Prototype</span>}
    </PopoverMenu>
  );
}
