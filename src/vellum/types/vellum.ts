export type VellumTheme = 'dark' | 'light';

export type VellumMode = 'idle' | 'selecting' | 'annotating';

export type AnnotationTag = {
  id: string;
  label: string;
  color: string;
};

/** Discriminator on Annotation. New annotation flavors slot in here. */
export type AnnotationKind = 'comment' | 'css-edit';

type AnnotationBase = {
  id: string;
  elementSelector: string;
  timestamp: number;
  kind: AnnotationKind;
};

/** Free-form note attached to an element. */
export type CommentAnnotation = AnnotationBase & {
  kind: 'comment';
  text: string;
  tag?: string;
  /** Pathname captured at annotation creation, used to navigate back to the page. */
  route?: string;
};

/** Per-property override applied as inline style + saved as a diff. */
export type CssEditAnnotation = AnnotationBase & {
  kind: 'css-edit';
  /** Verbatim textarea contents. Preserved so the editor round-trips order, comments, and whitespace. */
  editorBuffer: string;
  /** Frozen snapshot of the element's applied styles at first-edit time. */
  baseSnapshot: Record<string, { value: string; important: boolean }>;
  /** Computed diff vs baseSnapshot. The thing that gets applied + copied. */
  edits: Array<
    | { prop: string; action: 'add'; after: string; important: boolean }
    | {
        prop: string;
        action: 'change';
        before: string;
        after: string;
        importantBefore: boolean;
        important: boolean;
      }
    | {
        prop: string;
        action: 'remove';
        before: string;
        importantBefore: boolean;
      }
  >;
};

export type Annotation = CommentAnnotation | CssEditAnnotation;
export type AnnotationPage = {
  route: string;
  annotations: Annotation[];
};

export type SidebarTab = 'annotations' | 'editor';

export type VellumState = {
  mode: VellumMode;
  hoveredElement: HTMLElement | null;
  selectedElement: HTMLElement | null;
  selectedComponentName: string | null;
  selectedComponentElements: HTMLElement[];
  editingAnnotationId: string | null;
  annotations: Annotation[];
  tags: AnnotationTag[];
  activeTagFilter: string[];
  sidebarVisible: boolean;
  sidebarTab: SidebarTab;
  dotsVisible: boolean;
  settingsVisible: boolean;
  theme: VellumTheme;
  clearOnCopy: boolean;
  filtersEnabled: boolean;
};

export type VellumAction =
  | { type: 'SET_MODE'; mode: VellumMode }
  | { type: 'HOVER_ELEMENT'; element: HTMLElement | null }
  | {
      type: 'SELECT_ELEMENT';
      element: HTMLElement;
      componentName: string | null;
      componentElements: HTMLElement[];
    }
  | { type: 'ADD_ANNOTATION'; annotation: Annotation }
  | {
      type: 'EDIT_ANNOTATION';
      id: string;
      element: HTMLElement;
      componentName: string | null;
      componentElements: HTMLElement[];
    }
  | { type: 'UPDATE_ANNOTATION'; id: string; text: string; tag?: string }
  | {
      type: 'UPSERT_CSS_EDIT';
      annotation: CssEditAnnotation;
    }
  | { type: 'DELETE_ANNOTATION'; id: string }
  | { type: 'CANCEL_ANNOTATION' }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'HYDRATE_ANNOTATIONS'; annotations: Annotation[] }
  | { type: 'ADD_TAG'; tag: AnnotationTag }
  | { type: 'UPDATE_TAG'; id: string; label?: string; color?: string }
  | { type: 'DELETE_TAG'; id: string }
  | { type: 'SET_TAG_FILTER'; tagId: string | null }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'TOGGLE_DOTS' }
  | { type: 'SET_SIDEBAR_TAB'; tab: SidebarTab }
  | { type: 'TOGGLE_SETTINGS' }
  | { type: 'TOGGLE_THEME' }
  | { type: 'TOGGLE_CLEAR_ON_COPY' }
  | { type: 'TOGGLE_FILTERS' }
  | { type: 'CLEAR_ANNOTATIONS' };
