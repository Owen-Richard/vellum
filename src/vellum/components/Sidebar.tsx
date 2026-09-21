import { forwardRef } from 'react';
import clsx from 'clsx';
import { useVellum } from '../context/VellumContext';
import { AnnotationsPanel } from './AnnotationsPanel';
import { EditorPanel } from './EditorPanel';
import styles from './Sidebar.module.css';

export interface SidebarProps {
  className?: string;
  popover?: 'manual' | 'auto';
}

export const Sidebar = forwardRef<HTMLElement, SidebarProps>(function Sidebar(
  { className, popover },
  ref,
) {
  const { state, dispatch } = useVellum();
  const activeTab = state.sidebarTab;

  return (
    <aside
      ref={ref}
      className={clsx(styles.sidebar, className)}
      popover={popover}
      data-vellum
    >
      <div className={styles.tabs}>
        <div className={styles.tabGroup} role="tablist" aria-label="Vellum panels">
          <button
            role="tab"
            aria-selected={activeTab === 'annotations'}
            className={clsx(
              styles.tab,
              activeTab === 'annotations' && styles.tabActive,
            )}
            onClick={() =>
              dispatch({ type: 'SET_SIDEBAR_TAB', tab: 'annotations' })
            }
          >
            Annotations
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'editor'}
            className={clsx(
              styles.tab,
              activeTab === 'editor' && styles.tabActive,
            )}
            onClick={() => dispatch({ type: 'SET_SIDEBAR_TAB', tab: 'editor' })}
          >
            Editor (alpha)
          </button>
        </div>
      </div>
      <div className={clsx(styles.body, styles.bodyFlex)}>
        {activeTab === 'annotations' && <AnnotationsPanel />}
        {activeTab === 'editor' && <EditorPanel />}
      </div>
    </aside>
  );
});
