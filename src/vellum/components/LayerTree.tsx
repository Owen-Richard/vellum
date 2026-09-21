import { useState, useCallback, useRef, useEffect, useMemo, memo } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useVellum } from '../context/VellumContext';
import { useTagColorMap } from '../hooks/useTagColorMap';
import { hasAnchorNamePrefix } from '../core/anchors';
import { buildTree, buildDomTree, type TreeItem } from '../core/layerTree';
import { findElementBySelector } from '../core/selectors';
import styles from './LayerTree.module.css';

const TreeNode = memo(function TreeNode({
  item,
  depth,
  selectedElement,
  selectedComponentElements,
  ancestorsOfSelected,
  elementTagColorMap,
  onSelectElement,
  onClearSelection,
  shouldScrollRef,
}: {
  item: TreeItem;
  depth: number;
  selectedElement: HTMLElement | null;
  selectedComponentElements: HTMLElement[];
  ancestorsOfSelected: Set<TreeItem>;
  elementTagColorMap: Map<HTMLElement, string | undefined>;
  onSelectElement: (el: HTMLElement) => void;
  onClearSelection: () => void;
  shouldScrollRef: React.RefObject<boolean>;
}) {
  const isAncestorOfSelected = ancestorsOfSelected.has(item);
  // Default collapsed; if this node is on the ancestor path of the current
  // selection at mount time, start expanded so the selected node is revealed.
  const [expanded, setExpanded] = useState(isAncestorOfSelected);

  // When the selection changes (or this node newly becomes an ancestor of the
  // selection), expand to reveal it. We never auto-collapse — user-initiated
  // collapses are sticky.
  useEffect(() => {
    if (isAncestorOfSelected) {
      setExpanded(true);
    }
  }, [isAncestorOfSelected, selectedElement, selectedComponentElements]);

  const hasChildren = item.children.length > 0;

  let isSelected = false;
  if (item.kind === 'element') {
    isSelected = item.element != null && item.element === selectedElement;
  } else if (
    item.kind === 'component' &&
    selectedComponentElements.length > 0
  ) {
    isSelected =
      item.elements.length > 0 &&
      item.elements.length === selectedComponentElements.length &&
      item.elements.every(el => selectedComponentElements.includes(el));
  }

  const hasAnnotation =
    item.kind === 'element' &&
    item.element != null &&
    hasAnchorNamePrefix(item.element, '--vellum-dot-');

  const annotationDotColor =
    hasAnnotation && item.element
      ? elementTagColorMap.get(item.element)
      : undefined;

  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isSelected && shouldScrollRef.current && rowRef.current) {
      rowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      shouldScrollRef.current = false;
    }
  }, [isSelected, shouldScrollRef]);

  const handleClick = () => {
    if (isSelected) {
      onClearSelection();
    } else if (item.kind === 'element' && item.element) {
      onSelectElement(item.element);
    } else if (item.kind === 'component') {
      // For components, select via their single rendered element when possible
      if (item.elements.length === 1) {
        onSelectElement(item.elements[0]);
      }
    }
  };

  // Toggle expand/collapse without touching selection state. Stops propagation
  // so the row's click handler (which toggles selection) doesn't also fire.
  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => !prev);
  };

  return (
    <li className={styles.node}>
      <div
        ref={rowRef}
        role="treeitem"
        tabIndex={0}
        aria-selected={isSelected}
        aria-expanded={hasChildren ? expanded : undefined}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleClick();
          } else if (event.key === 'ArrowRight' && hasChildren) {
            event.preventDefault();
            setExpanded(true);
          } else if (event.key === 'ArrowLeft' && hasChildren) {
            event.preventDefault();
            setExpanded(false);
          }
        }}
        className={clsx(
          styles.row,
          isSelected && styles.rowSelected,
          item.hidden && styles.rowHidden,
        )}
        style={{ paddingLeft: `${depth * 12 + 10}px` }}
        onClick={handleClick}
      >
        {hasAnnotation && (
          <span
            className={styles.annotationDot}
            style={
              annotationDotColor
                ? { background: annotationDotColor }
                : undefined
            }
          />
        )}
        <button
          className={styles.toggle}
          onClick={handleToggleClick}
          style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <span
          className={clsx(
            styles.label,
            item.kind === 'component' && styles.labelComponent,
          )}
        >
          {item.label}
          {item.suffix && (
            <span className={styles.labelSuffix}>{item.suffix}</span>
          )}
        </span>
      </div>
      {hasChildren && expanded && (
        <ul className={styles.children}>
          {item.children.map((child, i) => (
            <TreeNode
              key={i}
              item={child}
              depth={depth + 1}
              selectedElement={selectedElement}
              selectedComponentElements={selectedComponentElements}
              ancestorsOfSelected={ancestorsOfSelected}
              elementTagColorMap={elementTagColorMap}
              onSelectElement={onSelectElement}
              onClearSelection={onClearSelection}
              shouldScrollRef={shouldScrollRef}
            />
          ))}
        </ul>
      )}
    </li>
  );
});

export function LayerTree() {
  const {
    state,
    dispatch,
    fiberRoot,
    treeRevision,
    selectElement,
    displayFilters,
  } = useVellum();

  const tree = useMemo(
    () => (fiberRoot ? buildTree(fiberRoot.current.child, displayFilters) : buildDomTree()),
    [fiberRoot, treeRevision, displayFilters],
  );

  // Resolve a per-element tag color for annotation dots in the tree. Mirrors
  // the lookup used by SelectionHighlight / AnnotationDots so dots are colored
  // consistently across surfaces.
  const tagColorMap = useTagColorMap(state.tags);
  const elementTagColorMap = useMemo(() => {
    const map = new Map<HTMLElement, string | undefined>();
    for (const a of state.annotations) {
      const el = findElementBySelector(a.elementSelector);
      if (!el || map.has(el)) continue;
      const tag = a.kind === 'comment' ? a.tag : undefined;
      const color = tag ? tagColorMap.get(tag) : undefined;
      map.set(el, color);
    }
    return map;
    // exhaustive-deps disabled: `state.tags` and `treeRevision` aren't read
    // directly inside the memo, but the result depends on them — `tagColorMap`
    // is derived from `state.tags`, and `findElementBySelector` reads the live
    // DOM whose mutations are tracked by `treeRevision`. Both must be in deps
    // for the cache to invalidate at the right time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.annotations, state.tags, tagColorMap, treeRevision]);

  // Compute the set of TreeItems that are ancestors of (or are) the currently
  // selected element/component. Nodes in this set should be expanded on mount
  // and re-expanded whenever the selection changes.
  const ancestorsOfSelected = useMemo(() => {
    const set = new Set<TreeItem>();
    const { selectedElement, selectedComponentElements } = state;
    if (!selectedElement && selectedComponentElements.length === 0) {
      return set;
    }

    const matchesSelection = (item: TreeItem): boolean => {
      if (item.kind === 'element') {
        return item.element != null && item.element === selectedElement;
      }
      if (selectedComponentElements.length === 0) return false;
      return (
        item.elements.length === selectedComponentElements.length &&
        item.elements.length > 0 &&
        item.elements.every(el => selectedComponentElements.includes(el))
      );
    };

    // Single shared stack tracking the chain from root to the current node's
    // parent — push before recursing into children, pop after. Avoids the
    // per-call `ancestors.concat(item)` allocation the previous version did
    // at every level of every subtree.
    const stack: TreeItem[] = [];
    const visit = (item: TreeItem): boolean => {
      let contains = matchesSelection(item);
      stack.push(item);
      for (const child of item.children) {
        if (visit(child)) contains = true;
      }
      stack.pop();
      if (contains) {
        // `item` was just popped, so the stack now holds exactly the
        // ancestors of `item` — what we want to add to the expanded set.
        for (const a of stack) set.add(a);
      }
      return contains;
    };

    for (const root of tree) visit(root);
    return set;
  }, [tree, state.selectedElement, state.selectedComponentElements]);

  // Track whether selection came from inside the tree
  const shouldScrollRef = useRef(true);

  const handleSelectFromTree = useCallback(
    (el: HTMLElement) => {
      shouldScrollRef.current = false;
      selectElement(el);
    },
    [selectElement],
  );

  // When selectedElement changes externally, enable scroll
  const prevSelectedRef = useRef(state.selectedElement);
  useEffect(() => {
    if (state.selectedElement !== prevSelectedRef.current) {
      // shouldScrollRef is already false if selection came from tree
      // It stays true (default) for external selections
      prevSelectedRef.current = state.selectedElement;
    }
  }, [state.selectedElement]);

  // Reset scroll flag after each render so next external selection triggers scroll
  useEffect(() => {
    shouldScrollRef.current = true;
  });

  const handleClearSelection = useCallback(
    () => dispatch({ type: 'CLEAR_SELECTION' }),
    [dispatch],
  );

  if (tree.length === 0) return null;

  return (
    <ul className={styles.tree} data-vellum role="tree" aria-label="Page layers">
      {tree.map((item, i) => (
        <TreeNode
          key={i}
          item={item}
          depth={0}
          selectedElement={state.selectedElement}
          selectedComponentElements={state.selectedComponentElements}
          ancestorsOfSelected={ancestorsOfSelected}
          elementTagColorMap={elementTagColorMap}
          onSelectElement={handleSelectFromTree}
          onClearSelection={handleClearSelection}
          shouldScrollRef={shouldScrollRef}
        />
      ))}
    </ul>
  );
}
