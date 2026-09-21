import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
  type Dispatch,
} from 'react';
import type { FiberRoot } from 'bippy';
import type {
  VellumState,
  VellumAction,
  Annotation,
  AnnotationTag,
  VellumTheme,
} from '../types/vellum';
import type {
  VellumFilter,
  DisplayFilters,
  ComposedFilters,
} from '../core/filters/types';
import {
  composeFilters,
  IDENTITY_FILTERS,
  IDENTITY_DISPLAY_FILTERS,
} from '../core/filters/compose';
import { setAnchorName, removeAnchorName } from '../core/anchors';
import { findElementBySelector, getUniqueSelector } from '../core/selectors';
import { DEFAULT_TAGS } from '../core/tags';
import { applyCssEdits, clearCssEdits } from '../core/cssEdits';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useFiberRoot } from '../hooks/useFiberRoot';
import {
  findOwnerComponentFromElement,
  getRenderedElements,
} from '../core/fibers';
import { getDisplayName } from 'bippy';
import { useHotkeys } from '../hooks/useHotkeys';
import { useVellumActions } from '../hooks/useVellumActions';
import { useEventIsolation } from '../hooks/useEventIsolation';
import { reducer, migrateAnnotation } from './reducer';
import { useSelectionMode } from '../hooks/useSelectionMode';

type VellumActions = ReturnType<typeof useVellumActions>;

type VellumContextValue = {
  state: VellumState;
  dispatch: Dispatch<VellumAction>;
  fiberRoot: FiberRoot | null;
  treeRevision: number;
  selectElement: (el: HTMLElement) => void;
  actions: VellumActions;
  /** Display-safe filters (cheap, real-time). Use for tree, labels, panels. */
  displayFilters: DisplayFilters;
  /** Full composed filters (includes source filtering). Use for clipboard/reference context. */
  composedFilters: ComposedFilters;
  /** Current pathname, supplied by the host app's router. Source of truth for "what page are we on". */
  pathname: string;
  /** Host-app navigation handler — Vellum never reads/writes `window.location` itself. */
  navigate: (route: string) => void;
};

const VellumContext = createContext<VellumContextValue | null>(null);

export function useVellum(): VellumContextValue {
  const ctx = useContext(VellumContext);
  if (!ctx) throw new Error('useVellum must be used within VellumProvider');
  return ctx;
}

export function VellumProvider({
  children,
  filters = [],
  pathname,
  navigate,
}: {
  children: ReactNode;
  filters?: VellumFilter[];
  /** Current pathname from the host app's router. */
  pathname: string;
  /** Host-app navigation handler — receives a previously-captured pathname. */
  navigate: (route: string) => void;
}) {
  const { fiberRoot, treeRevision } = useFiberRoot();
  const composedFilters = useMemo(() => composeFilters(filters), [filters]);
  const [savedAnnotationsRaw, setSavedAnnotations] = useLocalStorage<Annotation[]>(
    'vellum-annotations',
    [],
  );
  // Migrate any legacy annotations missing `kind` (everything stored before
  // the css-edit feature). Runs once per render cycle but useLocalStorage
  // returns a stable reference until storage changes, so this is cheap.
  const savedAnnotations = useMemo(
    () => savedAnnotationsRaw.map(migrateAnnotation),
    [savedAnnotationsRaw],
  );

  const [savedTags, setSavedTags] = useLocalStorage<AnnotationTag[]>(
    'vellum-tags',
    DEFAULT_TAGS,
  );
  const [savedTheme, setSavedTheme] = useLocalStorage<VellumTheme>(
    'vellum-theme',
    'dark',
  );
  const [savedClearOnCopy, setSavedClearOnCopy] = useLocalStorage<boolean>(
    'vellum-clear-on-copy',
    false,
  );

  // Merge saved tags with defaults so new built-in tags are always present
  const mergedTags = useMemo(() => {
    const savedIds = new Set(savedTags.map(t => t.id));
    const missing = DEFAULT_TAGS.filter(d => !savedIds.has(d.id));
    return [...savedTags, ...missing];
  }, [savedTags]);

  const [state, dispatch] = useReducer(reducer, {
    mode: 'idle',
    hoveredElement: null,
    selectedElement: null,
    selectedComponentName: null,
    selectedComponentElements: [],
    editingAnnotationId: null,
    annotations: savedAnnotations,
    tags: mergedTags,
    activeTagFilter: [],
    sidebarVisible: false,
    sidebarTab: 'annotations',
    dotsVisible: true,
    settingsVisible: false,
    theme: savedTheme,
    clearOnCopy: savedClearOnCopy,
    filtersEnabled: true,
  });

  // Sync annotations to localStorage and clean up removed dot anchors
  const prevAnnotationsRef = useRef(state.annotations);
  useEffect(() => {
    if (state.annotations !== prevAnnotationsRef.current) {
      const nextIds = new Set(state.annotations.map(a => a.id));
      for (const prev of prevAnnotationsRef.current) {
        if (!nextIds.has(prev.id)) {
          const el = findElementBySelector(prev.elementSelector);
          if (el) {
            removeAnchorName(el, `--vellum-dot-${prev.id}`);
            // If a css-edit annotation was deleted, restore the element's
            // original inline styles for the props we touched.
            if (prev.kind === 'css-edit') {
              clearCssEdits(el);
            }
          }
        }
      }
      prevAnnotationsRef.current = state.annotations;
      setSavedAnnotations(state.annotations);
    }
  }, [state.annotations, setSavedAnnotations]);

  // Sync tags to localStorage
  const prevTagsRef = useRef(state.tags);
  useEffect(() => {
    if (state.tags !== prevTagsRef.current) {
      prevTagsRef.current = state.tags;
      setSavedTags(state.tags);
    }
  }, [state.tags, setSavedTags]);

  // Sync sidebar visibility to <html> attribute
  useEffect(() => {
    if (state.sidebarVisible) {
      document.documentElement.setAttribute('data-vellum-sidebar-open', '');
    } else {
      document.documentElement.removeAttribute('data-vellum-sidebar-open');
    }
  }, [state.sidebarVisible]);

  // Sync theme to <html> attribute and localStorage
  useEffect(() => {
    document.documentElement.setAttribute('data-vellum-theme', state.theme);
    setSavedTheme(state.theme);
  }, [state.theme, setSavedTheme]);

  // Sync clearOnCopy to localStorage
  useEffect(() => {
    setSavedClearOnCopy(state.clearOnCopy);
  }, [state.clearOnCopy, setSavedClearOnCopy]);

  // Re-apply anchor names for persisted annotations on mount
  useEffect(() => {
    for (const annotation of savedAnnotations) {
      const el = findElementBySelector(annotation.elementSelector);
      if (el) {
        setAnchorName(el, `--vellum-dot-${annotation.id}`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stable ref for annotations used by selectElement to avoid stale closures
  const annotationsRef = useRef(state.annotations);
  annotationsRef.current = state.annotations;

  // Unified selection: resolves component info, checks for existing annotation, dispatches
  const selectElement = useCallback((el: HTMLElement) => {
    setAnchorName(el, '--vellum-selected');

    const ownerFiber = findOwnerComponentFromElement(el);
    const componentName = ownerFiber ? getDisplayName(ownerFiber.type) : null;
    const componentElements = ownerFiber ? getRenderedElements(ownerFiber) : [];

    const selector = getUniqueSelector(el);
    // Only the comment popover responds to selection. css-edit annotations
    // live in the PropertiesPanel and shouldn't auto-open the popover.
    const existing = annotationsRef.current.find(
      a => a.kind === 'comment' && a.elementSelector === selector,
    );

    if (existing) {
      dispatch({
        type: 'EDIT_ANNOTATION',
        id: existing.id,
        element: el,
        componentName: componentName ?? null,
        componentElements,
      });
    } else {
      dispatch({
        type: 'SELECT_ELEMENT',
        element: el,
        componentName: componentName ?? null,
        componentElements,
      });
    }
  }, []);

  useEventIsolation();
  useSelectionMode(state, dispatch, selectElement);

  // Centralized cleanup: when selectedElement changes, remove --vellum-selected from the previous one
  const prevSelectedRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const prev = prevSelectedRef.current;
    const next = state.selectedElement;

    if (prev && prev !== next) {
      removeAnchorName(prev, '--vellum-selected');
    }
    prevSelectedRef.current = next;
  }, [state.selectedElement]);

  // Clear selection when the selected element is removed from the DOM (e.g. tab switch)
  // Uses a synchronous MutationObserver so cleanup happens before browser paints.
  // Note: we deliberately only watch `selectedElement` here. `selectedComponentElements`
  // is a snapshot of sibling host nodes rendered by the owner component at selection
  // time; transient siblings (Fluent UI hover indicators, focus rings, tooltips) commonly
  // unmount during normal interaction and previously caused the selection to be cleared
  // out from under the user. The selected element itself is the source of truth.
  const selectedElRef = useRef(state.selectedElement);
  selectedElRef.current = state.selectedElement;

  useEffect(() => {
    const observer = new MutationObserver(mutations => {
      const hasRemovals = mutations.some(m => m.removedNodes.length > 0);
      if (!hasRemovals) return;

      const sel = selectedElRef.current;
      if (sel && !document.contains(sel)) {
        dispatch({ type: 'CLEAR_SELECTION' });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // Re-apply dot anchors for annotations whose elements may have remounted
  useEffect(() => {
    for (const annotation of state.annotations) {
      const el = findElementBySelector(annotation.elementSelector);
      if (el) {
        setAnchorName(el, `--vellum-dot-${annotation.id}`);
      }
    }
  }, [treeRevision, state.annotations]);

  // Re-apply css-edit inline styles after every commit. React will overwrite
  // our inline styles if the host re-renders with a `style` prop, so we have
  // to re-establish them. `applyCssEdits` is idempotent and bookkeeps the
  // pre-existing values so it can restore them if the edit is removed.
  useEffect(() => {
    for (const annotation of state.annotations) {
      if (annotation.kind !== 'css-edit') continue;
      const el = findElementBySelector(annotation.elementSelector);
      if (el) applyCssEdits(el, annotation.edits);
    }
  }, [treeRevision, state.annotations]);

  // dispatch from useReducer is stable, but include it so eslint doesn't warn
  const stableDispatch = useCallback(
    (action: VellumAction) => dispatch(action),
    [dispatch],
  );

  // Resolve active filters: identity when toggled off, composed when on
  const activeFilters = state.filtersEnabled
    ? composedFilters
    : IDENTITY_FILTERS;
  const activeDisplayFilters: DisplayFilters = state.filtersEnabled
    ? composedFilters
    : IDENTITY_DISPLAY_FILTERS;

  const actions = useVellumActions(state, stableDispatch, activeFilters);
  useHotkeys(state, actions);

  return (
    <VellumContext.Provider
      value={{
        state,
        dispatch: stableDispatch,
        fiberRoot,
        treeRevision,
        selectElement,
        actions,
        displayFilters: activeDisplayFilters,
        composedFilters: activeFilters,
        pathname,
        navigate,
      }}
    >
      {children}
    </VellumContext.Provider>
  );
}
