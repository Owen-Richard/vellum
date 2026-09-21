import type { VellumState, VellumAction, Annotation } from '../types/vellum';

/**
 * Backward-compat: localStorage may contain annotations from before the `kind`
 * discriminator existed. Stamp them all as `'comment'` so the discriminated
 * union resolves cleanly.
 */
export function migrateAnnotation(a: Annotation): Annotation {
  if ((a as { kind?: string }).kind == null) {
    return { ...(a as unknown as Annotation), kind: 'comment' } as Annotation;
  }
  return a;
}

export function reducer(state: VellumState, action: VellumAction): VellumState {
  switch (action.type) {
    case 'SET_MODE':
      return {
        ...state,
        mode: action.mode,
        hoveredElement: null,
        selectedElement: action.mode === 'idle' ? null : state.selectedElement,
        selectedComponentName: action.mode === 'idle' ? null : state.selectedComponentName,
        selectedComponentElements: action.mode === 'idle' ? [] : state.selectedComponentElements,
        editingAnnotationId: action.mode === 'idle' ? null : state.editingAnnotationId,
      };
    case 'HOVER_ELEMENT':
      return { ...state, hoveredElement: action.element };
    case 'SELECT_ELEMENT':
      return {
        ...state,
        mode: 'annotating',
        selectedElement: action.element,
        selectedComponentName: action.componentName,
        selectedComponentElements: action.componentElements,
        hoveredElement: null,
        editingAnnotationId: null,
      };
    case 'ADD_ANNOTATION':
      return {
        ...state,
        mode: 'idle',
        selectedElement: null,
        selectedComponentName: null,
        selectedComponentElements: [],
        editingAnnotationId: null,
        annotations: [...state.annotations, action.annotation],
      };
    case 'EDIT_ANNOTATION':
      return {
        ...state,
        mode: 'annotating',
        selectedElement: action.element,
        selectedComponentName: action.componentName,
        selectedComponentElements: action.componentElements,
        editingAnnotationId: action.id,
      };
    case 'UPDATE_ANNOTATION':
      return {
        ...state,
        mode: 'idle',
        selectedElement: null,
        selectedComponentName: null,
        selectedComponentElements: [],
        editingAnnotationId: null,
        annotations: state.annotations.map(a =>
          a.id === action.id && a.kind === 'comment'
            ? { ...a, text: action.text, tag: action.tag }
            : a,
        ),
      };
    case 'UPSERT_CSS_EDIT': {
      const incoming = action.annotation;
      const existingIdx = state.annotations.findIndex(
        a => a.kind === 'css-edit' && a.elementSelector === incoming.elementSelector,
      );
      if (existingIdx >= 0) {
        // Preserve the existing id + timestamp so the dot anchor stays stable.
        const existing = state.annotations[existingIdx];
        const merged = { ...incoming, id: existing.id, timestamp: existing.timestamp };
        const next = state.annotations.slice();
        next[existingIdx] = merged;
        return { ...state, annotations: next };
      }
      return { ...state, annotations: [...state.annotations, incoming] };
    }
    case 'CANCEL_ANNOTATION':
    case 'CLEAR_SELECTION':
      return {
        ...state,
        mode: 'idle',
        selectedElement: null,
        selectedComponentName: null,
        selectedComponentElements: [],
        editingAnnotationId: null,
      };
    case 'DELETE_ANNOTATION':
      return {
        ...state,
        mode: state.editingAnnotationId === action.id ? 'idle' : state.mode,
        selectedElement: state.editingAnnotationId === action.id ? null : state.selectedElement,
        selectedComponentName:
          state.editingAnnotationId === action.id ? null : state.selectedComponentName,
        selectedComponentElements:
          state.editingAnnotationId === action.id ? [] : state.selectedComponentElements,
        editingAnnotationId:
          state.editingAnnotationId === action.id ? null : state.editingAnnotationId,
        annotations: state.annotations.filter(a => a.id !== action.id),
      };
    case 'HYDRATE_ANNOTATIONS':
      return { ...state, annotations: action.annotations.map(migrateAnnotation) };
    case 'ADD_TAG':
      return { ...state, tags: [...state.tags, action.tag] };
    case 'UPDATE_TAG':
      return {
        ...state,
        tags: state.tags.map(t =>
          t.id === action.id
            ? {
                ...t,
                ...(action.label !== undefined && { label: action.label }),
                ...(action.color !== undefined && { color: action.color }),
              }
            : t,
        ),
      };
    case 'DELETE_TAG':
      return {
        ...state,
        tags: state.tags.filter(t => t.id !== action.id),
        annotations: state.annotations.map(a =>
          a.kind === 'comment' && a.tag === action.id ? { ...a, tag: undefined } : a,
        ),
        activeTagFilter: state.activeTagFilter.filter(id => id !== action.id),
      };
    case 'SET_TAG_FILTER':
      if (action.tagId === null) {
        return { ...state, activeTagFilter: [] };
      }
      return {
        ...state,
        activeTagFilter: state.activeTagFilter.includes(action.tagId)
          ? state.activeTagFilter.filter(id => id !== action.tagId)
          : [...state.activeTagFilter, action.tagId],
      };
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarVisible: !state.sidebarVisible };
    case 'TOGGLE_DOTS':
      return { ...state, dotsVisible: !state.dotsVisible };
    case 'SET_SIDEBAR_TAB':
      return { ...state, sidebarTab: action.tab };
    case 'TOGGLE_SETTINGS':
      return { ...state, settingsVisible: !state.settingsVisible };
    case 'TOGGLE_THEME':
      return { ...state, theme: state.theme === 'dark' ? 'light' : 'dark' };
    case 'TOGGLE_CLEAR_ON_COPY':
      return { ...state, clearOnCopy: !state.clearOnCopy };
    case 'TOGGLE_FILTERS':
      return { ...state, filtersEnabled: !state.filtersEnabled };
    case 'CLEAR_ANNOTATIONS':
      return {
        ...state,
        mode: 'idle',
        hoveredElement: null,
        selectedElement: null,
        selectedComponentName: null,
        selectedComponentElements: [],
        editingAnnotationId: null,
        annotations: [],
      };
    default:
      return state;
  }
}
