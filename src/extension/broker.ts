import {
  ANNOTATION_PAGES_KEY,
  annotationRouteFromStorageKey,
  CHANNEL,
  isRecord,
  STORAGE_KEYS,
  storageKey,
  validStoredValue,
} from './protocol';

declare global {
  interface Window {
    __vellumBrokerInstalled?: boolean;
  }
}

if (!window.__vellumBrokerInstalled) {
  window.__vellumBrokerInstalled = true;
  const loadedPages = new Set<string>();
  let queue = Promise.resolve();

  window.addEventListener('message', event => {
    const message: unknown = event.data;
    if (event.source !== window || event.origin !== location.origin || !isRecord(message) ||
      message.channel !== CHANNEL || message.direction !== 'request' ||
      typeof message.id !== 'string' || typeof message.url !== 'string') return;
    const { id, url } = message;
    const reply = (result: unknown, error?: string) => window.postMessage({
      channel: CHANNEL, direction: 'response', id, result, error,
    }, location.origin);

    queue = queue.then(async () => {
      try {
        if (new URL(url).origin !== location.origin) throw new Error('Cross-origin storage is not allowed.');
        if (message.operation === 'load') {
          if (url !== location.href) throw new Error('The page changed. Start Vellum again.');
          const names = STORAGE_KEYS.map(key => storageKey(url, key));
          const stored = await chrome.storage.local.get(names);
          const values: Record<string, unknown> = {};
          for (const key of STORAGE_KEYS) {
            const value: unknown = stored[storageKey(url, key)];
            if (value !== undefined) {
              if (!validStoredValue(key, value)) throw new Error(`Saved ${key} data is invalid. It was not overwritten.`);
              values[key] = value;
            }
          }
          const origin = new URL(url).origin;
          const annotationPages: Record<string, unknown> = {};
          const allStored = await chrome.storage.local.get(null);
          for (const [key, value] of Object.entries(allStored)) {
            const route = annotationRouteFromStorageKey(key, origin);
            if (route === null) continue;
            if (!validStoredValue('vellum-annotations', value)) {
              throw new Error('Saved vellum-annotations data is invalid. It was not overwritten.');
            }
            if (Array.isArray(value) && value.length > 0) annotationPages[route] = value;
          }
          values[ANNOTATION_PAGES_KEY] = annotationPages;
          loadedPages.add(url);
          reply(values);
        } else if (message.operation === 'save') {
          if (!loadedPages.has(url) || typeof message.key !== 'string' ||
            !validStoredValue(message.key, message.value)) throw new Error('Invalid Vellum storage request.');
          if (JSON.stringify(message.value).length > 1_000_000) throw new Error('This page has too many notes to save.');
          const key = STORAGE_KEYS.find(key => key === message.key);
          if (!key) throw new Error('Unknown storage key.');
          await chrome.storage.local.set({ [storageKey(url, key)]: message.value });
          reply(true);
        } else {
          throw new Error('Unknown Vellum operation.');
        }
      } catch (error) {
        reply(null, error instanceof Error ? error.message : 'Extension storage failed.');
      }
    });
  });
}
