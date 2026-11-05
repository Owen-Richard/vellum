import { test, expect, chromium, type BrowserContext, type CDPSession, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { captureState } from './capture-state';
import { storageKey } from '../../src/extension/protocol';

let context: BrowserContext;
let cdp: CDPSession;
let extensionId: string;
test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: process.env.VELLUM_BROWSER ?? 'chromium',
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
  await context.clearPermissions();
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(() => chrome.storage.local.clear());
});
test.afterEach(async () => {
  await Promise.all(context.pages().map(page => page.close()));
});

async function clickAction(page: Page) {
  await page.bringToFront();
  await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true);
  const { targetInfos } = await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] });
  const tab = targetInfos.find(target => target.url === page.url());
  if (!tab) throw new Error(`No browser tab target for ${page.url()}: ${JSON.stringify(targetInfos)}`);
  await cdp.send('Extensions.triggerAction', { id: extensionId, targetId: tab.targetId });
}

async function actionTitle() {
  return context.serviceWorkers()[0].evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return chrome.action.getTitle({ tabId: tab.id });
  });
}

async function startPage(path = '/fixture') {
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:5198${path}`);
  await clickAction(page);
  await expect.poll(actionTitle).toBe('Stop Vellum');
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
  expect(await context.serviceWorkers()[0].evaluate(() => chrome.runtime.getManifest().action?.default_popup)).toBeUndefined();
  await clickAction(page);
  await expect.poll(actionTitle).toBe('Stop Vellum');
  const { targetInfos } = await cdp.send('Target.getTargets');
  expect(targetInfos.some(target => target.url === `chrome-extension://${extensionId}/popup.html`)).toBe(false);
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
  await clickAction(page);
  await expect.poll(actionTitle).toBe('Start Vellum');
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
  await clickAction(page);
  await expect.poll(actionTitle).toBe('Start Vellum');
  await page.reload();
  await expect(page.locator('[data-vellum-extension-root]')).toHaveCount(0);
  await clickAction(page);
  await expect.poll(actionTitle).toBe('Stop Vellum');
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
  await clickAction(page);
  await expect.poll(actionTitle).toBe('Stop Vellum');
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
  await clickAction(page);
  await expect.poll(actionTitle).toBe('Start Vellum');
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
  await restricted.goto(process.env.VELLUM_BROWSER === 'msedge' ? 'edge://settings' : 'chrome://settings');
  await clickAction(restricted);
  await expect.poll(actionTitle).toContain('Browser settings and extension stores are blocked.');
  await expect(restricted.locator('[data-vellum-extension-root]')).toHaveCount(0);
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
  await clickAction(page);
  await expect.poll(actionTitle).toContain('invalid');
  await expect(page.locator('[data-vellum-extension-root]')).toHaveCount(0);
  expect(await worker.evaluate(async key => (await chrome.storage.local.get(key))[key], key)).toEqual([{ broken: true }]);
  await worker.evaluate(async key => { await chrome.storage.local.remove(key); }, key);
  await clickAction(page);
  await expect.poll(actionTitle).toBe('Stop Vellum');
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toBeVisible();
  expect(await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return chrome.action.getBadgeText({ tabId: tab.id });
  })).toBe('');
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
  await expect(page.getByRole('alert')).toContainText('Click the Vellum browser icon to stop it');
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveCount(0);
  await clickAction(page);
  await expect.poll(actionTitle).toBe('Start Vellum');
  await expect(page.locator('[data-vellum-extension-root]')).toHaveCount(0);
  expect(await worker.evaluate(async key => (await chrome.storage.local.get(key))[key], key)).toEqual([{ broken: true }]);
  await page.close();
});

test('selection of an SVG icon annotates its HTML control and survives reload', async () => {
  const page = await startPage();
  await page.getByTestId('review-action').evaluate(button => {
    button.innerHTML = '<svg width="32" height="32" viewBox="0 0 32 32"><path d="M0 0h32v32H0z"/></svg> Review project';
  });
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByTestId('review-action').locator('svg').click();
  await page.getByPlaceholder('Add annotation...').fill('Review the icon button');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Annotation 1', exact: true })).toBeVisible();
  await expect(page.locator('#click-count')).toHaveText('Host clicks: 0');
  await clickAction(page);
  await expect.poll(actionTitle).toBe('Start Vellum');
  await page.reload();
  await clickAction(page);
  await expect.poll(actionTitle).toBe('Stop Vellum');
  await expect(page.getByRole('button', { name: 'Annotation 1', exact: true })).toBeVisible();
});

test('host select controls, shadow inputs and consumed keys do not trigger shortcuts', async () => {
  const page = await startPage();
  await page.evaluate(() => {
    const select = document.createElement('select');
    select.id = 'host-select';
    select.innerHTML = '<option>High</option><option>Small</option>';
    document.querySelector('main')!.append(select);
    const host = document.createElement('div');
    host.id = 'shadow-field';
    host.attachShadow({ mode: 'open' }).innerHTML = '<input aria-label="Shadow input">';
    document.querySelector('main')!.append(host);
  });
  await page.locator('#host-select').focus();
  await page.keyboard.press('s');
  await expect(page.locator('[data-vellum-selecting]')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Shadow input' }).pressSequentially('schx/12');
  await expect(page.locator('[data-vellum-selecting]')).toHaveCount(0);
  for (const kind of ['consumed', 'composing', 'repeated']) {
    await page.evaluate(kind => {
      const event = new KeyboardEvent('keydown', {
        key: 's', bubbles: true, cancelable: true,
        isComposing: kind === 'composing', repeat: kind === 'repeated',
      });
      if (kind === 'consumed') event.preventDefault();
      document.body.dispatchEvent(event);
    }, kind);
    await expect(page.locator('[data-vellum-selecting]')).toHaveCount(0);
  }
});

test('host CSS anchors and inline importance survive selection and stop', async () => {
  const page = await startPage();
  await page.addStyleTag({ content: '#target { anchor-name: --host-action !important; }' });
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByTestId('review-action').hover();
  await expect(page.getByTestId('review-action')).toHaveCSS('anchor-name', /--host-action/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('review-action')).toHaveCSS('anchor-name', '--host-action');
  expect(await page.getByTestId('review-action').evaluate(button =>
    (button as HTMLElement).style.getPropertyValue('anchor-name'))).toBe('');
  await page.getByTestId('review-action').evaluate(button => {
    (button as HTMLElement).style.setProperty('anchor-name', '--host-inline, --vellum-host', 'important');
  });
  await annotate(page, 'Keep host anchors');
  expect(await page.getByTestId('review-action').evaluate(button =>
    (button as HTMLElement).style.getPropertyPriority('anchor-name'))).toBe('important');
  await clickAction(page);
  await expect.poll(actionTitle).toBe('Start Vellum');
  await expect(page.getByTestId('review-action')).toHaveCSS('anchor-name', '--host-inline, --vellum-host');
  expect(await page.getByTestId('review-action').evaluate(button =>
    (button as HTMLElement).style.getPropertyPriority('anchor-name'))).toBe('important');
});

test('DOM replacement reattaches notes and missing targets remain in the list', async () => {
  const page = await startPage();
  await annotate(page, 'Survive a DOM refresh');
  await page.getByTestId('review-action').evaluate(button => {
    const replacement = button.cloneNode(true) as HTMLElement;
    replacement.removeAttribute('style');
    button.replaceWith(replacement);
  });
  const marker = page.getByRole('button', { name: 'Annotation 1', exact: true });
  await expect(marker).toBeVisible();
  await expect.poll(() => page.getByTestId('review-action').evaluate(button =>
    getComputedStyle(button).getPropertyValue('anchor-name'))).toContain('--vellum-dot-');
  await marker.click();
  await expect(page.getByPlaceholder('Add annotation...')).toHaveValue('Survive a DOM refresh');
  await page.getByRole('button', { name: 'Update', exact: true }).click();
  await page.getByTestId('review-action').evaluate(button => button.remove());
  await expect(marker).toHaveCount(0);
  await page.getByRole('button', { name: 'Show sidebar' }).click();
  await expect(page.getByText('Survive a DOM refresh', { exact: true })).toBeVisible();
});

test('failed saves block stop, preserve notes and recover through Retry save', async () => {
  const page = await startPage();
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      func: () => {
        const original = chrome.storage.local.set.bind(chrome.storage.local);
        chrome.storage.local.set = async () => { throw new Error('Test: storage quota reached'); };
        window.addEventListener('vellum-test-restore-storage', () => {
          chrome.storage.local.set = original;
        }, { once: true });
      },
    });
  });
  await annotate(page, 'Do not lose this note');
  await expect(page.getByRole('alert')).toContainText('Not saved.');
  await clickAction(page);
  await expect.poll(actionTitle).toContain('not saved');
  await expect(page.getByRole('button', { name: 'Annotation 1', exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('vellum-test-restore-storage')));
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await clickAction(page);
  await expect.poll(actionTitle).toBe('Start Vellum');
  await page.reload();
  await clickAction(page);
  await expect.poll(actionTitle).toBe('Stop Vellum');
  await page.getByRole('button', { name: 'Show sidebar' }).click();
  await expect(page.getByText('Do not lose this note', { exact: true })).toBeVisible();
});

test('query, hash and history navigation isolate notes and flush pending saves', async () => {
  const page = await startPage();
  const original = page.url();
  await annotate(page, 'Base route note');
  await page.evaluate(() => history.pushState({}, '', '?review=1#details'));
  await expect(page.getByRole('button', { name: 'Annotation 1', exact: true })).toHaveCount(0);
  await annotate(page, 'Query and hash note');
  await page.evaluate(() => history.back());
  await page.waitForURL(original);
  await expect(page.getByRole('button', { name: 'Annotation 1', exact: true })).toHaveAttribute('title', 'Base route note');
  await page.evaluate(() => history.forward());
  await page.waitForURL(`${original}?review=1#details`);
  await expect(page.getByRole('button', { name: 'Annotation 1', exact: true })).toHaveAttribute('title', 'Query and hash note');
  await expect(page.locator('[data-vellum-extension-root]')).toHaveCount(1);
  await clickAction(page);
  await expect.poll(actionTitle).toBe('Start Vellum');
  await expect(page.locator('[data-vellum-selecting]')).toHaveCount(0);
  await expect(page.getByTestId('review-action')).toHaveCSS('anchor-name', 'none');
});

test('saved toolbar positions remain on screen after resize and restart', async () => {
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(async key => {
    await chrome.storage.local.set({
      [key]: { anchor: { v: 'top', h: 'left' }, offset: { x: 3000, y: 3000 } },
    });
  }, storageKey('http://127.0.0.1:5198/fixture', 'vellum-toolbar-pos'));
  const page = await startPage();
  const toolbar = page.locator('[data-vellum-toolbar]');
  async function expectInViewport() {
    await expect.poll(async () => toolbar.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 && rect.top >= 0 &&
        rect.right <= innerWidth && rect.bottom <= innerHeight;
    })).toBe(true);
  }
  await expectInViewport();
  await page.setViewportSize({ width: 800, height: 600 });
  await expectInViewport();
  await clickAction(page);
  await expect.poll(actionTitle).toBe('Start Vellum');
  await clickAction(page);
  await expect.poll(actionTitle).toBe('Stop Vellum');
  await expectInViewport();
});

test('markers stay aligned while scrolling and resizing the host page', async () => {
  const page = await startPage();
  await page.addStyleTag({ content: 'body { min-height: 2500px; } main { margin-top: 500px; }' });
  await annotate(page, 'Scroll with the target');
  const marker = page.getByRole('button', { name: 'Annotation 1', exact: true });
  async function expectAligned() {
    await expect.poll(async () => {
      const dot = await marker.boundingBox();
      const target = await page.getByTestId('review-action').boundingBox();
      if (!dot || !target) return false;
      return Math.abs(dot.x + dot.width / 2 - target.x - target.width) < 1 &&
        Math.abs(dot.y + dot.height / 2 - target.y) < 1;
    }).toBe(true);
  }
  await expectAligned();
  await page.evaluate(() => scrollBy(0, 100));
  await expectAligned();
  await page.setViewportSize({ width: 900, height: 700 });
  await expectAligned();
});

test('repeated start and stop restores focus and keyboard selection preserves native popovers', async () => {
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5198/fixture');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (let cycle = 0; cycle < 10; cycle++) {
    await page.locator('#host-popover').evaluate(element => (element as HTMLElement).hidePopover());
    await page.locator('#host-input').focus();
    await clickAction(page);
    await expect.poll(actionTitle).toBe('Stop Vellum');
    await expect(page.locator('[data-vellum-extension-root]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Host popover', exact: true }).click();
    await expect(page.locator('#host-popover')).toBeVisible();
    await page.keyboard.press('s');
    await expect(page.locator('#host-popover')).toBeVisible();
    await page.getByTestId('review-action').hover();
    await clickAction(page);
    await expect.poll(actionTitle).toBe('Start Vellum');
    await expect(page.locator('[data-vellum-extension-root], [data-vellum-selecting]')).toHaveCount(0);
    await expect(page.getByTestId('review-action')).toHaveCSS('anchor-name', 'none');
    await expect(page.locator('#host-input')).toBeFocused();
  }
  await page.getByTestId('review-action').click();
  await expect(page.locator('#click-count')).toHaveText('Host clicks: 1');
  expect(errors).toEqual([]);
});

test('toolbar interaction is isolated from earlier host document dismiss handlers', async () => {
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5198/fixture');
  await page.evaluate(() => {
    const menu = document.createElement('aside');
    menu.id = 'host-menu';
    menu.textContent = 'Host menu stays open';
    document.body.append(menu);
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && !menu.contains(event.target)) menu.hidden = true;
    };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('click', dismiss, true);
  });
  await clickAction(page);
  await expect.poll(actionTitle).toBe('Stop Vellum');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(page.locator('#host-menu')).toBeVisible();
  await page.getByTestId('review-action').click();
  await expect(page.locator('#host-menu')).toBeVisible();
  await expect(page.locator('#click-count')).toHaveText('Host clicks: 0');
  await clickAction(page);
  await expect.poll(actionTitle).toBe('Start Vellum');
  await page.getByTestId('review-action').click();
  await expect(page.locator('#host-menu')).toBeHidden();
  await expect(page.locator('#click-count')).toHaveText('Host clicks: 1');
});

test('settings persist on the same origin without leaking into a different origin', async () => {
  const page = await startPage();
  await annotate(page, 'Only this origin');
  await page.getByRole('button', { name: 'Toggle settings' }).click();
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await clickAction(page);
  await expect.poll(actionTitle).toBe('Start Vellum');
  await page.goto('http://127.0.0.1:5198/other');
  await clickAction(page);
  await expect.poll(actionTitle).toBe('Stop Vellum');
  await expect(page.locator('[data-vellum-extension-root]')).toHaveAttribute('data-vellum-theme', 'light');
  await expect(page.getByRole('button', { name: 'Annotation 1', exact: true })).toHaveCount(0);
  await clickAction(page);
  await expect.poll(actionTitle).toBe('Start Vellum');
  await page.goto('http://localhost:5198/fixture');
  await clickAction(page);
  await expect.poll(actionTitle).toBe('Stop Vellum');
  await expect(page.locator('[data-vellum-extension-root]')).toHaveAttribute('data-vellum-theme', 'dark');
  await page.getByRole('button', { name: 'Show sidebar' }).click();
  await expect(page.getByText('No annotations yet.')).toBeVisible();
  await expect(page.getByText('Only this origin', { exact: true })).toHaveCount(0);
});

test('missing browser features produce a clear startup error without partial UI', async () => {
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5198/fixture');
  await page.evaluate(() => {
    const supports = CSS.supports.bind(CSS);
    CSS.supports = (property: string, value?: string) => property === 'anchor-name'
      ? false : value === undefined ? supports(property) : supports(property, value);
  });
  await clickAction(page);
  await expect.poll(actionTitle).toContain('HTML popover and CSS anchor support');
  await expect(page.locator('[data-vellum-extension-root]')).toHaveCount(0);
  await page.getByTestId('review-action').click();
  await expect(page.locator('#click-count')).toHaveText('Host clicks: 1');
});
