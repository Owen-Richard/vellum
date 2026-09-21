import { Component, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Vellum } from '../vellum/components/Vellum';
import { clearAllCssEdits } from '../vellum/core/cssEdits';
import { clearVellumAnchors } from '../vellum/core/anchors';
import { pagePath } from './protocol';
import { clearError, flushStorage, getError, loadStorage, reportError, retryStorage, subscribeErrors } from './storage';
import styles from './page.module.css';

declare global {
  interface Window {
    __vellumExtension?: {
      active: boolean;
      start: () => Promise<void>;
      stop: () => Promise<void>;
    };
  }
}

function ErrorNotice({ requiresRestart = false }: { requiresRestart?: boolean }) {
  const error = useSyncExternalStore(subscribeErrors, getError);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error && ref.current && !ref.current.matches(':popover-open')) ref.current.showPopover();
  }, [error]);
  if (!error) return null;
  return <div data-vellum ref={ref} popover="manual" role="alert" className={styles.error}>
    <p>{error}</p>
    {requiresRestart ? <p>Stop Vellum from the extension menu, then start it again to retry.</p> : <>
      <button onClick={() => { void retryStorage().catch(cause => reportError(String(cause))); }}>Retry save</button>
      <button onClick={clearError}>Dismiss</button>
    </>}
  </div>;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { reportError(`Vellum could not render. ${error.message}`); }
  render() {
    return this.state.failed
      ? <p role="alert" className={styles.error}>Vellum could not render. Stop it from the extension menu, then reload this page.</p>
      : this.props.children;
  }
}

if (!window.__vellumExtension) {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  let routeTimer: ReturnType<typeof setInterval> | undefined;
  let currentUrl = '';
  let task: Promise<void> | null = null;
  let focusBefore: HTMLElement | null = null;

  function unmount() {
    if (root) flushSync(() => root?.unmount());
    root = null;
    container?.remove();
    container = null;
    clearAllCssEdits();
    clearVellumAnchors();
  }

  function mount(requiresRestart = false) {
    container = document.createElement('div');
    container.setAttribute('data-vellum-extension-root', '');
    container.setAttribute('data-vellum', '');
    container.className = styles.root;
    document.body.append(container);
    root = createRoot(container);
    flushSync(() => root?.render(<ErrorBoundary>
      {!requiresRestart && <Vellum pathname={pagePath(currentUrl)} navigate={route => {
        const next = new URL(route, location.href);
        if (next.origin !== location.origin) {
          reportError('Vellum navigation must stay on the current site.');
          return;
        }
        void flushStorage().then(() => location.assign(next.href)).catch(cause => reportError(String(cause)));
      }} />}
      <ErrorNotice requiresRestart={requiresRestart} />
    </ErrorBoundary>));
  }

  function serialized(action: () => Promise<void>) {
    if (task) return task;
    task = action().finally(() => { task = null; });
    return task;
  }

  const runtime = {
    active: false,
    start: () => serialized(async () => {
      if (runtime.active) return;
      if (document.querySelector('[data-vellum]')) {
        throw new Error('This page already contains Vellum. Disable the embedded instance first.');
      }
      if (!document.body || !('showPopover' in HTMLElement.prototype) ||
        !CSS.supports('anchor-name', '--vellum-test')) {
        throw new Error('This page needs a current version of Microsoft Edge with HTML and CSS anchor support.');
      }
      focusBefore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      currentUrl = location.href;
      await loadStorage(currentUrl);
      mount();
      runtime.active = true;
      routeTimer = setInterval(() => {
        if (location.href === currentUrl || task) return;
        void serialized(async () => {
          await flushStorage();
          const nextUrl = location.href;
          unmount();
          await loadStorage(nextUrl);
          currentUrl = nextUrl;
          mount();
        }).catch(cause => {
          reportError(String(cause));
          if (!container) {
            clearInterval(routeTimer);
            mount(true);
          }
        });
      }, 250);
    }),
    stop: async () => {
      if (task) await task;
      await serialized(async () => {
        await flushStorage();
        clearInterval(routeTimer);
        unmount();
        runtime.active = false;
        clearError();
        focusBefore?.focus({ preventScroll: true });
      });
    },
  };
  window.__vellumExtension = runtime;
}
