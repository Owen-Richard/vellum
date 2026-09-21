import { CHANNEL, isRecord, type StoredValues, type StorageKey } from './protocol';

let currentUrl = '';
let values: StoredValues = {};
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
const writes = new Map<string, Promise<void>>();
const failed = new Map<string, { url: string; key: StorageKey; value: unknown }>();
const subscribers = new Set<() => void>();
let lastError = '';

export function reportError(message: string) {
  console.error('[Vellum]', message);
  lastError = message;
  subscribers.forEach(fn => fn());
}
export function clearError() {
  lastError = '';
  subscribers.forEach(fn => fn());
}
export const getError = () => lastError;
export const subscribeErrors = (fn: () => void) => {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
};

window.addEventListener('message', event => {
  const message: unknown = event.data;
  if (event.source !== window || event.origin !== location.origin || !isRecord(message) ||
    message.channel !== CHANNEL || message.direction !== 'response' || typeof message.id !== 'string') return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (typeof message.error === 'string') request.reject(new Error(message.error));
  else request.resolve(message.result);
});

function request(operation: 'load' | 'save', url: string, key?: StorageKey, value?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('The extension did not respond. Reload the page and try again.'));
    }, 8_000);
    pending.set(id, {
      resolve: result => { clearTimeout(timer); resolve(result); },
      reject: error => { clearTimeout(timer); reject(error); },
    });
    window.postMessage({ channel: CHANNEL, direction: 'request', id, operation, url, key, value }, location.origin);
  });
}

export async function loadStorage(url: string) {
  await flushStorage();
  const result = await request('load', url);
  if (!isRecord(result)) throw new Error('The extension returned invalid storage data.');
  values = result;
  currentUrl = url;
}

export function readStored<T>(key: string, fallback: T): T {
  return (values[key as StorageKey] as T | undefined) ?? fallback;
}

export function writeStored(key: string, value: unknown) {
  const storageKey = key as StorageKey;
  values[storageKey] = value;
  persist(currentUrl, storageKey, value);
}

function persist(url: string, key: StorageKey, value: unknown) {
  const id = JSON.stringify([url, key]);
  const previous = writes.get(id) ?? Promise.resolve();
  const next = previous.then(async () => {
    try {
      await request('save', url, key, value);
      failed.delete(id);
    } catch (error) {
      failed.set(id, { url, key, value });
      reportError(`Not saved. ${error instanceof Error ? error.message : 'Storage failed.'} Retry before closing this page.`);
    }
  });
  writes.set(id, next);
  void next.then(() => { if (writes.get(id) === next) writes.delete(id); });
}

export async function flushStorage() {
  while (writes.size) await Promise.all([...writes.values()]);
  if (failed.size) throw new Error('Some Vellum changes are not saved. Use Retry before stopping or changing pages.');
}

export async function retryStorage() {
  for (const { url, key, value } of failed.values()) persist(url, key, value);
  await flushStorage();
  clearError();
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    const message = `Could not copy. ${error instanceof Error ? error.message : 'Clipboard access was denied.'}`;
    reportError(message);
    throw new Error(message, { cause: error });
  }
}
