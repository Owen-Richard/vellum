import { supportedUrl } from './protocol';

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
});

const pending = new Set<number>();

chrome.action.onClicked.addListener(tab => {
  if (tab.id === undefined || pending.has(tab.id)) return;
  const tabId = tab.id;
  pending.add(tabId);
  void toggle(tabId, tab.url).catch(cause => {
    console.error('[Vellum]', cause);
  }).finally(() => pending.delete(tabId));
});

async function toggle(tabId: number, url?: string) {
  let active = false;
  try {
    if (!url || !supportedUrl(url)) {
      throw new Error('Open a regular http or https page. Browser settings and extension stores are blocked.');
    }
    const [state] = await chrome.scripting.executeScript({
      target: { tabId }, world: 'MAIN',
      func: () => Boolean(window.__vellumExtension?.active),
    });
    active = Boolean(state.result);
    if (active) {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId }, world: 'MAIN',
        func: async () => {
          try { await window.__vellumExtension?.stop(); return { ok: true }; }
          catch (error) { return { ok: false, error: String(error) }; }
        },
      });
      if (!result.result?.ok) throw new Error(result.result?.error ?? 'Could not stop Vellum.');
      await chrome.scripting.removeCSS({ target: { tabId }, files: ['page.css'] });
      active = false;
    } else {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['broker.js'] });
      await chrome.scripting.insertCSS({ target: { tabId }, files: ['page.css'] });
      await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['page.js'] });
      const [result] = await chrome.scripting.executeScript({
        target: { tabId }, world: 'MAIN',
        func: async () => {
          try { await window.__vellumExtension?.start(); return { ok: Boolean(window.__vellumExtension?.active) }; }
          catch (error) { return { ok: false, error: String(error) }; }
        },
      });
      if (!result.result?.ok) throw new Error(result.result?.error ?? 'Vellum did not start.');
      active = true;
    }
    await chrome.action.setBadgeText({ tabId, text: '' });
    await chrome.action.setTitle({ tabId, title: active ? 'Stop Vellum' : 'Start Vellum' });
  } catch (cause) {
    if (!active) {
      try {
        await chrome.scripting.removeCSS({ target: { tabId }, files: ['page.css'] });
      } catch (cleanupError) {
        console.error('[Vellum] Could not remove injected styles:', cleanupError);
      }
    }
    const message = cause instanceof Error ? cause.message : String(cause);
    await chrome.action.setBadgeText({ tabId, text: '!' });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#b91c1c' });
    await chrome.action.setTitle({ tabId, title: `Vellum: ${message}` });
  }
}
