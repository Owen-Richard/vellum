import { type RefObject } from 'react';
import { PanelLeft, ClipboardCopy, Trash2, Settings } from 'lucide-react';
import { useVellum } from '../context/VellumContext';
import { Button, ButtonGroup, Badge, Tooltip } from '../common';
import { FloatingBar } from './FloatingBar';
import styles from './Toolbar.module.css';

export function Toolbar({
  settingsBtnRef,
}: {
  settingsBtnRef: RefObject<HTMLButtonElement | null>;
}) {
  const { state, dispatch, actions } = useVellum();
  const isSelecting = state.mode === 'selecting';
  const hasAnnotations = state.annotations.length > 0;
  const annotationCount = state.annotations.length;

  return (
    <FloatingBar
      storageKey="vellum-toolbar-pos"
      data-vellum-toolbar
      onDragStart={() => {
        if (state.mode !== 'idle') {
          dispatch({ type: 'SET_MODE', mode: 'idle' });
        }
      }}
    >
      <ButtonGroup>
        <Tooltip text="Select" shortcut="S">
          <Button
            variant="secondary"
            size="md"
            active={isSelecting}
            onPointerUp={actions.toggleSelect}
          >
            Select
          </Button>
        </Tooltip>
      </ButtonGroup>
      <ButtonGroup>
        <Tooltip
          text={state.sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
          shortcut="L"
        >
          <span className={styles.sidebarBtnWrapper}>
            <Button
              variant="ghost"
              size="icon"
              active={state.sidebarVisible}
              onPointerUp={actions.toggleSidebar}
              aria-label={
                state.sidebarVisible ? 'Hide sidebar' : 'Show sidebar'
              }
            >
              <PanelLeft
                size={14}
                aria-hidden="true"
                style={{ transform: 'scaleX(-1)' }}
              />
            </Button>
            {annotationCount > 0 && (
              <Badge variant="overlay">{annotationCount}</Badge>
            )}
          </span>
        </Tooltip>
        <Tooltip
          text={actions.copySuccess ? 'Copied!' : 'Copy as markdown'}
          shortcut={actions.copySuccess ? undefined : 'C'}
          forceShow={actions.copySuccess}
        >
          <Button
            variant={actions.copySuccess ? 'secondary' : 'ghost'}
            intent={actions.copySuccess ? 'success' : 'info'}
            size="icon"
            onPointerUp={actions.copyAnnotations}
            disabled={!hasAnnotations}
            aria-label="Copy annotations as markdown"
          >
            <ClipboardCopy size={14} aria-hidden="true" />
          </Button>
        </Tooltip>
        <Tooltip
          text={actions.deleteArmed ? 'Press again to confirm' : 'Delete all'}
          shortcut="X"
          forceShow={actions.deleteArmed}
        >
          <Button
            variant="ghost"
            intent="danger"
            size="icon"
            armed={actions.deleteArmed}
            onPointerUp={actions.clearAnnotations}
            disabled={!hasAnnotations}
            aria-label={
              actions.deleteArmed
                ? 'Confirm delete all annotations'
                : 'Delete all annotations'
            }
          >
            <Trash2 size={14} aria-hidden="true" />
          </Button>
        </Tooltip>
        <Tooltip text="Settings" shortcut="/">
          <Button
            ref={settingsBtnRef}
            variant="ghost"
            size="icon"
            active={state.settingsVisible}
            onPointerUp={actions.toggleSettings}
            aria-label="Toggle settings"
            style={
              { anchorName: '--vellum-settings-btn' } as React.CSSProperties
            }
          >
            <Settings size={14} aria-hidden="true" />
          </Button>
        </Tooltip>
      </ButtonGroup>
    </FloatingBar>
  );
}
