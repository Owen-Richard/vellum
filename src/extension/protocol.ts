export const CHANNEL = 'vellum-extension-v1';
export const STORAGE_KEYS = [
  'vellum-annotations',
  'vellum-tags',
  'vellum-theme',
  'vellum-clear-on-copy',
  'vellum-toolbar-pos',
] as const;
export type StorageKey = typeof STORAGE_KEYS[number];
export const ANNOTATION_PAGES_KEY = 'vellum-annotation-pages';
export type StoredValues = Partial<Record<StorageKey | typeof ANNOTATION_PAGES_KEY, unknown>>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function pagePath(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname + parsed.search + parsed.hash;
}

export function storageKey(url: string, key: StorageKey): string {
  const parsed = new URL(url);
  const scope = key === 'vellum-annotations' ? pagePath(url) : '';
  return JSON.stringify(['vellum', 1, parsed.origin, scope, key]);
}

export function annotationRouteFromStorageKey(key: string, origin: string): string | null {
  try {
    const parsed: unknown = JSON.parse(key);
    if (!Array.isArray(parsed) || parsed.length !== 5 ||
      parsed[0] !== 'vellum' || parsed[1] !== 1 || parsed[2] !== origin ||
      typeof parsed[3] !== 'string' || parsed[4] !== 'vellum-annotations') {
      return null;
    }
    return parsed[3];
  } catch {
    return null;
  }
}

export function supportedUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return ['https:', 'http:'].includes(protocol) &&
      !['chromewebstore.google.com', 'chrome.google.com', 'microsoftedge.microsoft.com'].includes(hostname);
  } catch {
    return false;
  }
}

export function validStoredValue(key: string, value: unknown): boolean {
  if (key === 'vellum-theme') return value === 'dark' || value === 'light';
  if (key === 'vellum-clear-on-copy') return typeof value === 'boolean';
  if (key === 'vellum-toolbar-pos') {
    return value === null || (isRecord(value) && isRecord(value.anchor) &&
      ['top', 'bottom'].includes(String(value.anchor.v)) &&
      ['left', 'right'].includes(String(value.anchor.h)) &&
      isRecord(value.offset) && typeof value.offset.x === 'number' &&
      Number.isFinite(value.offset.x) && typeof value.offset.y === 'number' &&
      Number.isFinite(value.offset.y));
  }
  if (key === 'vellum-tags') {
    return Array.isArray(value) && value.length <= 100 && value.every(tag =>
      isRecord(tag) && typeof tag.id === 'string' && typeof tag.label === 'string' &&
      tag.label.length <= 200 && typeof tag.color === 'string' && tag.color.length <= 100);
  }
  if (key === 'vellum-annotations') {
    return Array.isArray(value) && value.length <= 500 && value.every(note => {
      if (!isRecord(note) || typeof note.id !== 'string' ||
        typeof note.elementSelector !== 'string' || note.elementSelector.length > 10_000 ||
        typeof note.timestamp !== 'number' || !Number.isFinite(note.timestamp)) return false;
      if (note.kind === 'comment') {
        return typeof note.text === 'string' && note.text.length <= 100_000 &&
          (note.tag === undefined || typeof note.tag === 'string') &&
          (note.route === undefined || typeof note.route === 'string');
      }
      if (note.kind !== 'css-edit' || typeof note.editorBuffer !== 'string' ||
        !isRecord(note.baseSnapshot) || !Array.isArray(note.edits)) return false;
      return Object.values(note.baseSnapshot).every(decl =>
        isRecord(decl) && typeof decl.value === 'string' && typeof decl.important === 'boolean') &&
        note.edits.every(edit => isRecord(edit) && typeof edit.prop === 'string' &&
          (edit.action === 'remove'
            ? typeof edit.before === 'string' && typeof edit.importantBefore === 'boolean'
            : (edit.action === 'add' || edit.action === 'change') &&
              typeof edit.after === 'string' && typeof edit.important === 'boolean' &&
              (edit.action !== 'change' ||
                (typeof edit.before === 'string' && typeof edit.importantBefore === 'boolean'))));
    });
  }
  return false;
}
