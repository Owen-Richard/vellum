import { test, expect, chromium, type BrowserContext, type CDPSession, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { captureState, snapshotDocument, writeStateHtml } from './capture-state';
import { storageKey } from '../../src/extension/protocol';

let context: BrowserContext;
let cdp: CDPSession;
let extensionId: string;
test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: process.env.VELLUM_BROWSER ?? 'msedge',
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
    viewport: { width: 1440, height: 1000 },
  });
  cdp = await context.browser()!.newBrowserCDPSession();
  const loaded = await cdp.send('Extensions.loadUnpacked', { path: resolve('dist') });
  extensionId = loaded.id;
});
test.afterAll(async () => { await context?.close(); });
test.beforeEach(async () => {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(() => chrome.storage.local.clear());
});

async function openAction(page: Page) {
  await page.bringToFront();
  const { targetInfos } = await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] });
  const tab = targetInfos.find(target => target.url === page.url());
  if (!tab) throw new Error(`No browser tab target for ${page.url()}: ${JSON.stringify(targetInfos)}`);
  await cdp.send('Extensions.triggerAction', { id: extensionId, targetId: tab.targetId });
  let popupId = '';
  await expect.poll(async () => {
    const { targetInfos } = await cdp.send('Target.getTargets');
    popupId = targetInfos.find(target => target.url === `chrome-extension://${extensionId}/popup.html`)?.targetId ?? '';
    return popupId;
  }).not.toBe('');
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: popupId, flatten: false });
  let nextId = 0;
  const evaluate = (expression: string): Promise<unknown> => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { cdp.off('Target.receivedMessageFromTarget', listener); reject(new Error('Popup command timed out')); }, 10_000);
    const listener = (event: { sessionId: string; message: string }) => {
      if (event.sessionId !== sessionId) return;
      const message = JSON.parse(event.message);
      if (message.id !== id) return;
      clearTimeout(timer);
      cdp.off('Target.receivedMessageFromTarget', listener);
      if (message.error || message.result?.exceptionDetails) reject(new Error(JSON.stringify(message)));
      else resolve(message.result.result.value);
    };
    cdp.on('Target.receivedMessageFromTarget', listener);
    void cdp.send('Target.sendMessageToTarget', {
      sessionId, message: JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true, userGesture: true } }),
    }).catch(reject);
  });
  await expect.poll(() => evaluate("document.querySelector('#activate') !== null")).toBe(true);
  return {
    async click(action: 'Start Vellum' | 'Stop Vellum', capture?: string) {
      await expect.poll(() => evaluate("document.querySelector('#activate')?.textContent")).toBe(action);
      const html = await evaluate(`document.querySelector('#activate').click(); (${snapshotDocument.toString()})()`);
      if (capture) await writeStateHtml(capture, String(html));
      const next = action === 'Start Vellum' ? 'Stop Vellum' : 'Start Vellum';
      await expect.poll(() => evaluate("document.querySelector('#error').hidden ? document.querySelector('#activate').textContent : document.querySelector('#error').textContent")).toBe(next);
    },
    close: () => cdp.send('Target.closeTarget', { targetId: popupId }),
    evaluate,
    async capture(name: string) {
      await writeStateHtml(name, String(await evaluate(`(${snapshotDocument.toString()})()`)));
    },
  };
}

async function startPage(path = '/fixture') {
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:5198${path}`);
  const popup = await openAction(page);
  await expect.poll(() => popup.evaluate("document.querySelector('#activate').textContent")).toBe('Start Vellum');
  await popup.capture('21-popup-ready');
  await popup.click('Start Vellum', '22-popup-starting');
  await popup.capture('23-popup-active');
  await popup.close();
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toBeVisible();
  await captureState(page, '01-toolbar-idle');
  return page;
}

async function annotate(page: Page, text = 'Review spacing') {
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByTestId('review-action').hover();
  await captureState(page, '02-selecting-highlight');
  await page.getByTestId('review-action').click();
  await page.getByPlaceholder('Add annotation...').fill(text);
  await captureState(page, '03-new-annotation');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Annotation 1', exact: true })).toBeVisible();
}

test('real extension action starts, selects, saves and stops', async () => {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5198/fixture');
  const popup = await openAction(page);
  await popup.click('Start Vellum');
  await popup.close();
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByTestId('review-action').click();
  await expect(page.locator('#click-count')).toHaveText('Host clicks: 0');
  await page.getByPlaceholder('Add annotation...').fill('Increase the spacing around this action.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Show sidebar' }).click();
  await expect(page.getByText('Increase the spacing around this action.', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/annotations-dark.png' });
  await captureState(page, '04-annotations-populated');
  const stopPopup = await openAction(page);
  await stopPopup.click('Stop Vellum');
  await stopPopup.close();
  await expect(page.locator('[data-vellum-extension-root]')).toHaveCount(0);
  await page.getByTestId('review-action').click();
  await expect(page.locator('#click-count')).toHaveText('Host clicks: 1');
  expect(await page.evaluate(() => localStorage.getItem('vellum-annotations'))).toBeNull();
  expect(errors).toEqual([]);
  await page.close();
});

test('notes survive reload, remain page-scoped and navigate from the site list', async () => {
  const page = await startPage();
  const originalUrl = page.url();
  await annotate(page, 'Persistent page feedback');
  const stop = await openAction(page);
  await stop.click('Stop Vellum');
  await stop.close();
  await page.reload();
  await expect(page.locator('[data-vellum-extension-root]')).toHaveCount(0);
  const restart = await openAction(page);
  await restart.click('Start Vellum');
  await restart.close();
  await page.getByRole('button', { name: 'Show sidebar' }).click();
  await expect(page.getByText('Persistent page feedback', { exact: true })).toBeVisible();
  await page.locator('#navigate').click();
  await expect(page.getByRole('button', { name: 'Annotation 1', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show sidebar' }).click();
  await expect(page.getByText('Persistent page feedback', { exact: true })).toBeVisible();
  await expect(page.getByText('/fixture', { exact: true })).toBeVisible();
  await captureState(page, '05-annotations-cross-page');
  await page.getByRole('button', { name: 'Open annotation 1 on /fixture' }).click();
  await page.waitForURL(originalUrl);
  await expect(page.locator('[data-vellum-extension-root]')).toHaveCount(0);
  const resume = await openAction(page);
  await resume.click('Start Vellum');
  await resume.close();
  await expect(page.getByRole('button', { name: 'Annotation 1', exact: true })).toBeVisible();
  await page.close();
});

test('DOM editor applies, resets and restores CSS when stopped', async () => {
  const page = await startPage();
  const original = await page.getByTestId('review-action').getAttribute('style');
  await page.getByRole('button', { name: 'Show sidebar' }).click();
  await page.getByRole('tab', { name: 'Editor (alpha)' }).click();
  await expect(page.getByRole('tree', { name: 'Page layers' })).toBeVisible();
  await captureState(page, '06-editor-empty');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByTestId('review-action').click();
  const editor = page.getByRole('textbox', { name: 'Applied CSS' });
  await expect(editor).toBeVisible();
  const base = await editor.inputValue();
  expect(base).not.toContain('crosshair');
  await captureState(page, '07-editor-selected');
  await editor.fill(base + '\npadding: 40px;');
  await expect(page.getByTestId('review-action')).toHaveCSS('padding-top', '40px');
  await page.screenshot({ path: 'artifacts/css-editor-dark.png' });
  await captureState(page, '08-css-edit');
  await page.getByRole('button', { name: 'All Rules', exact: true }).click();
  await captureState(page, '09-css-all-rules');
  await page.getByRole('button', { name: 'Applied', exact: true }).click();
  await page.getByRole('button', { name: 'Reset CSS edits' }).click();
  await expect(page.getByTestId('review-action')).toHaveCSS('padding-top', '10px');
  await editor.fill(base + '\npadding: 32px;');
  await expect(page.getByTestId('review-action')).toHaveCSS('padding-top', '32px');
  const stop = await openAction(page);
  await stop.click('Stop Vellum');
  await stop.close();
  await expect(page.getByTestId('review-action')).toHaveCSS('padding-top', '10px');
  expect((await page.getByTestId('review-action').getAttribute('style')) || null).toBe(original);
  await page.close();
});

test('keyboard activation, tags, edit, theme, shortcuts and gallery work', async () => {
  const page = await startPage();
  const select = page.getByRole('button', { name: 'Select', exact: true });
  await select.focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('review-action').click();
  await page.getByPlaceholder('Add annotation...').fill('Tagged feedback');
  await page.getByRole('button', { name: 'Tag', exact: true }).click();
  await page.getByRole('button', { name: 'New tag' }).click();
  await page.getByPlaceholder('Tag name…').fill('Review');
  await page.screenshot({ path: 'artifacts/create-tag-dark.png' });
  await captureState(page, '10-tag-create');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Annotation 1', exact: true }).click();
  await page.getByPlaceholder('Add annotation...').fill('Updated feedback');
  await captureState(page, '11-annotation-edit');
  await page.getByRole('button', { name: 'Element actions' }).click();
  await captureState(page, '12-element-actions');
  await page.getByRole('button', { name: 'Element actions' }).click();
  await page.getByRole('button', { name: 'Update', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle settings' }).click();
  await captureState(page, '13-settings-dark');
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('[data-vellum-extension-root]')).toHaveAttribute('data-vellum-theme', 'light');
  await page.screenshot({ path: 'artifacts/settings-light.png' });
  await captureState(page, '14-settings-light');
  await page.getByRole('button', { name: 'Hotkeys', exact: true }).click();
  await expect(page.getByText('Press twice to confirm')).toBeVisible();
  await page.screenshot({ path: 'artifacts/shortcuts-light.png' });
  await captureState(page, '15-shortcuts');
  await page.getByRole('button', { name: 'Hotkeys', exact: true }).click();
  await page.getByRole('button', { name: 'Component Gallery', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: 'artifacts/component-gallery-light.png' });
  await captureState(page, '16-gallery-controls');
  await page.getByRole('dialog').locator('main').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await captureState(page, '17-gallery-remaining-controls');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.close();
});

test('clipboard exports context and clear-on-copy clears only after success', async () => {
  const page = await startPage();
  await annotate(page, 'Copy this review');
  await page.getByRole('button', { name: 'Copy annotations as markdown' }).click();
  await expect(page.getByText('Copied!', { exact: true })).toBeVisible();
  await captureState(page, '18-copy-success');
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:5198' });
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('Copy this review');
  expect(clipboard).toContain('button');
  await page.getByRole('button', { name: 'Toggle settings' }).click();
  await page.getByLabel('Clear on copy').check();
  await page.getByRole('button', { name: 'Toggle settings' }).click();
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true, value: () => Promise.reject(new Error('Test: clipboard denied')),
    });
  });
  await page.getByRole('button', { name: 'Copy annotations as markdown' }).click();
  await expect(page.getByRole('alert')).toContainText('Could not copy');
  await expect(page.getByRole('button', { name: 'Annotation 1', exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/clipboard-error.png' });
  await captureState(page, '19-clipboard-error');
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await page.evaluate(() => { Reflect.deleteProperty(navigator.clipboard, 'writeText'); });
  await page.getByRole('button', { name: 'Copy annotations as markdown' }).click();
  await expect(page.getByRole('button', { name: 'Annotation 1', exact: true })).toHaveCount(0);
  await page.close();
});

test('React metadata, page CSP, restricted pages and host typing are supported', async () => {
  const react = await startPage('/react');
  await react.getByRole('button', { name: 'Select', exact: true }).click();
  await react.getByTestId('react-target').click();
  await expect(react.getByText('ReviewButton.button', { exact: true })).toBeVisible();
  await react.getByRole('button', { name: 'Show sidebar' }).click();
  await react.getByRole('tab', { name: 'Editor (alpha)' }).click();
  await expect(react.getByRole('tree')).toContainText('ProjectReview');
  await captureState(react, '20-react-component-context');
  await react.close();
  const csp = await startPage('/csp');
  await csp.locator('#host-input').fill('schx/12');
  await expect(csp.locator('[data-vellum-selecting]')).toHaveCount(0);
  await annotate(csp);
  await csp.close();
  const restricted = await context.newPage();
  await restricted.goto(process.env.VELLUM_BROWSER === 'chromium' ? 'chrome://settings' : 'edge://settings');
  const popup = await openAction(restricted);
  await expect.poll(() => popup.evaluate("document.querySelector('#activate').textContent")).toBe('Unavailable');
  await expect.poll(() => popup.evaluate("document.querySelector('#activate').disabled")).toBe(true);
  await popup.capture('24-popup-restricted');
  await popup.close();
  await restricted.close();
});

test('two-step delete, marker visibility and light sidebar preserve source behavior', async () => {
  const page = await startPage();
  await annotate(page, 'Delete confirmation example');
  await page.keyboard.press('h');
  await expect(page.getByRole('button', { name: 'Annotation 1', exact: true })).toBeHidden();
  await captureState(page, '25-markers-hidden');
  await page.keyboard.press('h');
  await expect(page.getByRole('button', { name: 'Annotation 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle settings' }).click();
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await page.getByRole('button', { name: 'Toggle settings' }).click();
  await page.getByRole('button', { name: 'Show sidebar' }).click();
  await captureState(page, '26-annotations-light');
  await page.getByRole('button', { name: 'Delete all annotations', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirm delete all annotations' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Annotation 1', exact: true })).toBeVisible();
  await captureState(page, '27-delete-confirmation');
  await page.getByRole('button', { name: 'Confirm delete all annotations' }).click();
  await expect(page.getByText('No annotations yet.')).toBeVisible();
  await page.close();
});

test('invalid stored data surfaces a startup error without overwriting it', async () => {
  const key = storageKey('http://127.0.0.1:5198/fixture', 'vellum-annotations');
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(async key => { await chrome.storage.local.set({ [key]: [{ broken: true }] }); }, key);
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5198/fixture');
  const popup = await openAction(page);
  await expect.poll(() => popup.evaluate("document.querySelector('#activate').textContent")).toBe('Start Vellum');
  await popup.evaluate("document.querySelector('#activate').click()");
  await expect.poll(() => popup.evaluate("document.querySelector('#error').textContent")).toContain('invalid');
  await popup.capture('28-popup-storage-error');
  await expect(page.locator('[data-vellum-extension-root]')).toHaveCount(0);
  expect(await worker.evaluate(async key => (await chrome.storage.local.get(key))[key], key)).toEqual([{ broken: true }]);
  await popup.close();
  await page.close();
});

test('route load failures stay visible and can be stopped without overwriting notes', async () => {
  const page = await startPage();
  const nextUrl = 'http://127.0.0.1:5198/fixture?broken';
  const key = storageKey(nextUrl, 'vellum-annotations');
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(async key => { await chrome.storage.local.set({ [key]: [{ broken: true }] }); }, key);
  await page.evaluate(url => history.pushState({}, '', url), nextUrl);
  await expect(page.getByRole('alert')).toContainText('invalid');
  await expect(page.getByRole('alert')).toContainText('Stop Vellum from the extension menu');
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveCount(0);
  const popup = await openAction(page);
  await popup.click('Stop Vellum');
  await popup.close();
  await expect(page.locator('[data-vellum-extension-root]')).toHaveCount(0);
  expect(await worker.evaluate(async key => (await chrome.storage.local.get(key))[key], key)).toEqual([{ broken: true }]);
  await page.close();
});
