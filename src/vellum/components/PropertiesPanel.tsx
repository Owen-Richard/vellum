import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, RotateCcw } from 'lucide-react';
import { useVellum } from '../context/VellumContext';
import { describeElement } from '../core/describeElement';
import {
  getComponentAncestorsFromElement,
  getRenderedElements,
} from '../core/fibers';
import {
  collectCascadeSources,
  getAppliedStyles,
  getAuthorStylesText,
} from '../core/elementStyles';
import { getUniqueSelector } from '../core/selectors';
import { useCssEditAnnotation } from '../hooks/useCssEditAnnotation';
import { formatBaseSnapshotText } from '../core/cssEdits';
import { formatAnnotationForClipboard } from '../core/clipboardContext';
import { Button, ButtonGroup, Textarea, Tooltip } from '../common';
import styles from './PropertiesPanel.module.css';

/**
 * Inserts <wbr> before CSS-class punctuation (`.`, `#`, `>`, `,`, `:`, space)
 * so long element/component selectors break at meaningful boundaries instead
 * of mid-identifier. The break opportunity sits before the separator so the
 * leading `.` stays attached to the following class name on the new line.
 */
function withWordBreaks(text: string): React.ReactNode {
  const parts = text.split(/([.#>,:\s]+)/);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      // Separator chunk — emit a break opportunity then the separator.
      // Use Fragment instead of <span> so we don't add a DOM node per break.
      return (
        <Fragment key={i}>
          <wbr />
          {part}
        </Fragment>
      );
    }
    return part;
  });
}

/**
 * Renders a `describeElement` 'medium' string (`tag.class1.class2`) with the
 * tag in normal text color and the class suffix muted — matching the layer
 * tree's tag/suffix coloring. Also inserts <wbr> before each class so long
 * selectors wrap at meaningful boundaries.
 */
function renderElementName(text: string): React.ReactNode {
  const dotIndex = text.indexOf('.');
  if (dotIndex === -1) return text;
  const tag = text.slice(0, dotIndex);
  const suffix = text.slice(dotIndex);
  return (
    <>
      {tag}
      <span className={styles.elementClasses}>{withWordBreaks(suffix)}</span>
    </>
  );
}

export function PropertiesPanel() {
  const { state, dispatch, displayFilters, composedFilters, treeRevision } = useVellum();
  const { selectedElement, selectedComponentName, selectedComponentElements } = state;

  // Mirror the layer tree's component-row selection logic: a composite
  // ancestor is "selected" iff the set of host elements it renders matches
  // `selectedComponentElements` exactly. For wrapper chains that ultimately
  // render the same element(s), multiple components legitimately match.
  // Then drop any whose name fails the active filter, and — when
  // `collapseWrappers` is on — dedupe consecutive same-name ancestors so
  // wrapper chains (e.g. Button > Button > Button) show as a single row, the
  // same way the layer tree collapses them.
  const selectedComponents = useMemo(() => {
    if (!selectedElement || selectedComponentElements.length === 0) return [];
    // O(1) membership check inside the inner .every() — avoids an O(N²) scan
    // when wrapper chains render many shared host elements.
    const selectedSet = new Set(selectedComponentElements);
    const matches = getComponentAncestorsFromElement(selectedElement).filter(a => {
      if (!displayFilters.filterComponent(a.name)) return false;
      const elements = getRenderedElements(a.fiber);
      if (elements.length === 0) return false;
      if (elements.length !== selectedComponentElements.length) return false;
      return elements.every(el => selectedSet.has(el));
    });
    // `getComponentAncestorsFromElement` walks innermost → outermost. Reverse
    // so the order matches the layer tree (outermost ancestor first).
    const ordered = matches.reverse();
    if (!displayFilters.collapseWrappers) return ordered;
    // Outermost wins: walking outer → inner, skip any entry whose name
    // matches the previously kept one. Matches `collapseWrappedItems` in
    // core/layerTree.ts where the parent stays and the same-name child is
    // dropped in favor of promoting its grandchildren.
    const collapsed: typeof ordered = [];
    for (const m of ordered) {
      const last = collapsed[collapsed.length - 1];
      if (last && last.name === m.name) continue;
      collapsed.push(m);
    }
    return collapsed;
    // exhaustive-deps disabled: `treeRevision` isn't read directly inside the
    // memo, but `getComponentAncestorsFromElement` and `getRenderedElements`
    // walk the live fiber tree. Bumping `treeRevision` on every commit forces
    // this to recompute when the tree shape changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElement, selectedComponentElements, displayFilters, treeRevision]);

  // Compute the cascade once per selection change; both the "All Rules"
  // text view and the "Applied" editor (via useCssEditAnnotation) derive
  // from it. Walking every stylesheet is the expensive step — sharing the
  // result eliminates ~2 redundant walks per selection.
  const cascade = useMemo(
    () => (selectedElement ? collectCascadeSources(selectedElement) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedElement, treeRevision],
  );

  const authorStylesText = useMemo(
    () => (cascade ? getAuthorStylesText(cascade) : ''),
    [cascade],
  );

  const applied = useMemo(() => (cascade ? getAppliedStyles(cascade) : []), [cascade]);

  const [stylesTab, setStylesTab] = useState<'applied' | 'all'>('applied');

  // Editable "Applied" buffer is uncontrolled-after-initial: we seed it via
  // `defaultValue` keyed on the selected element so it resets cleanly on
  // selection change but never re-sorts under the user's caret while typing.
  // Mirrors how the browser DevTools "Styles" pane behaves.
  //
  // `initialBuffer` and the diff baseline are both derived from the same
  // frozen base snapshot inside the hook, so the displayed starting text and
  // the saved diff agree exactly (no ghost edits from cascade transitions).
  const {
    existing: cssEditAnnotation,
    initialBuffer,
    saveEditorBuffer,
  } = useCssEditAnnotation(selectedElement, applied);
  // Stable per-element identity used as the textarea's `key`. We memoize so
  // we don't re-run `getUniqueSelector` (a non-trivial DOM walk) on every
  // render — only when the selection changes.
  const editorKey = useMemo(
    () => (selectedElement ? getUniqueSelector(selectedElement) : 'none'),
    [selectedElement],
  );
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const handleReset = () => {
    if (!cssEditAnnotation || !editorRef.current) return;
    // Re-seed the textarea imperatively. We deliberately do NOT key the
    // textarea on the annotation id (doing so would remount it the moment
    // the user's first keystroke creates the annotation, stealing focus
    // mid-word). The trade-off: Reset has to push the original text back
    // into the buffer itself.
    const original = formatBaseSnapshotText(cssEditAnnotation.baseSnapshot);
    dispatch({ type: 'DELETE_ANNOTATION', id: cssEditAnnotation.id });
    editorRef.current.value = original;
  };

  const handleCopyDiff = async () => {
    if (!cssEditAnnotation) return;
    try {
      // Same payload the bulk annotations export would produce for this row:
      // diff block + element context. Lets users paste a single annotation
      // straight into an agent chat without needing the surrounding list.
      const block = await formatAnnotationForClipboard(
        cssEditAnnotation,
        composedFilters,
        state.tags,
      );
      await navigator.clipboard.writeText(block);
      setCopySuccess(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopySuccess(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  };

  // Copy-feedback state for the Tooltip button (mirrors AnnotationPopover).
  const [copySuccess, setCopySuccess] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    },
    [],
  );
  // Reset feedback when the annotation is gone (Reset clicked, or user
  // erased their edits back to the original).
  useEffect(() => {
    if (!cssEditAnnotation) setCopySuccess(false);
  }, [cssEditAnnotation]);

  if (!selectedElement && !selectedComponentName) {
    return <p className={styles.empty}>Select an element or component.</p>;
  }

  return (
    <div className={styles.panel} data-vellum>
      {selectedComponents.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            Components ({selectedComponents.length})
          </div>
          <ul className={styles.elementList}>
            {selectedComponents.map((a, i) => (
              <li key={i} className={styles.componentListItem}>
                {withWordBreaks(a.name)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedElement && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>Element</div>
          <div className={styles.elementName}>
            {renderElementName(describeElement(selectedElement, { detail: 'medium', filters: displayFilters }))}
          </div>
        </div>
      )}

      {!selectedElement && selectedComponentName && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>Component</div>
          <div className={styles.componentName}>{withWordBreaks(selectedComponentName)}</div>
        </div>
      )}

      {!selectedElement && selectedComponentElements.length > 1 && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            Rendered Elements ({selectedComponentElements.length})
          </div>
          <ul className={styles.elementList}>
            {selectedComponentElements.map((el, i) => (
              <li key={i} className={styles.elementListItem}>
                {renderElementName(describeElement(el, { detail: 'medium', filters: displayFilters }))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedElement && authorStylesText && (
        <div className={styles.section}>
          <div className={styles.stylesHeader}>
            <ButtonGroup className={styles.stylesTabs}>
              <Button
                size="sm"
                active={stylesTab === 'applied'}
                onPointerUp={() => setStylesTab('applied')}
              >
                Applied
              </Button>
              <Button
                size="sm"
                active={stylesTab === 'all'}
                onPointerUp={() => setStylesTab('all')}
              >
                All Rules
              </Button>
            </ButtonGroup>
            {stylesTab === 'applied' && cssEditAnnotation && (
              <div className={styles.stylesHeaderActions}>
                <Tooltip
                  text={copySuccess ? 'Copied!' : 'Copy CSS edits with context'}
                  forceShow={copySuccess}
                >
                  <Button
                    variant={copySuccess ? 'secondary' : 'ghost'}
                    intent={copySuccess ? 'success' : 'info'}
                    size="icon"
                    onPointerUp={handleCopyDiff}
                    aria-label="Copy CSS edits with context"
                  >
                    <Copy size={14} />
                  </Button>
                </Tooltip>
                <Tooltip text="Reset CSS edits">
                  <Button
                    variant="ghost"
                    intent="danger"
                    size="icon"
                    onPointerUp={handleReset}
                    aria-label="Reset CSS edits"
                  >
                    <RotateCcw size={14} />
                  </Button>
                </Tooltip>
              </div>
            )}
          </div>
          {stylesTab === 'applied' ? (
            // `key` is the selected element identity ONLY — not the
            // annotation id. The textarea must stay mounted while the user
            // types, even as the annotation goes from undefined -> defined.
            // (Keying on the annotation id stole focus on the first
            // keystroke that created the diff.)
            //
            // Selecting a different element still remounts (new key), so
            // `defaultValue` re-seeds correctly from whichever buffer
            // applies (saved annotation or freshly-formatted base snapshot).
            <Textarea
              key={editorKey}
              ref={editorRef}
              className={styles.stylesTextarea}
              defaultValue={initialBuffer}
              spellCheck={false}
              onChange={e => saveEditorBuffer(e.target.value)}
            />
          ) : (
            <Textarea
              className={styles.stylesTextarea}
              readOnly
              value={authorStylesText}
            />
          )}
        </div>
      )}
    </div>
  );
}
