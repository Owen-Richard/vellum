import { supportedUrl } from './protocol';
import './popup.css';

const status = document.querySelector<HTMLParagraphElement>('#status')!;
const site = document.querySelector<HTMLParagraphElement>('#site')!;
const error = document.querySelector<HTMLParagraphElement>('#error')!;
const button = document.querySelector<HTMLButtonElement>('#activate')!;
let tabId: number;
let active = false;

function showError(cause: unknown) {
  error.hidden = false;
  error.textContent = cause instanceof Error ? cause.message : 'Vellum could not start. Reload the page and try again.';
}

function update() {
  status.textContent = active ? 'Vellum is running on this page.' : 'Inspect and annotate the current page.';
  button.textContent = active ? 'Stop Vellum' : 'Start Vellum';
  button.disabled = false;
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !supportedUrl(tab.url)) {
    status.textContent = 'Open a regular http or https page. Browser settings and extension stores are blocked.';
    button.textContent = 'Unavailable';
    return;
  }
  tabId = tab.id;
  site.textContent = new URL(tab.url).hostname;
  const [result] = await chrome.scripting.executeScript({
    target: { tabId }, world: 'MAIN',
    func: () => Boolean(window.__vellumExtension?.active),
  });
  active = Boolean(result.result);
  update();
}

button.addEventListener('click', async () => {
  button.disabled = true;
  button.textContent = active ? 'Stopping...' : 'Starting...';
  error.hidden = true;
  try {
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
    update();
  } catch (cause) {
    if (!active) {
      try {
        await chrome.scripting.removeCSS({ target: { tabId }, files: ['page.css'] });
      } catch (cleanupError) {
        console.error('[Vellum] Could not remove injected styles:', cleanupError);
      }
    }
    showError(cause);
    update();
  }
});

void init().catch(cause => {
  showError(cause);
  button.textContent = 'Unavailable';
});
