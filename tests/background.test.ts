import assert from 'node:assert/strict';
import test from 'node:test';

test('browser action preserves errors and cleans up only injected styles', async t => {
  const previous = globalThis.chrome;
  let onClick: (tab: chrome.tabs.Tab) => void;
  let failures = 0;
  let probes = 0;
  let probed = false;
  let starts = 0;
  let scriptCalls = 0;
  let insertions = 0;
  let removals = 0;
  let badge = '';
  let failure: Error;
  let startupFailure: string | undefined;
  let cleanupFailure: Error | undefined;
  let completed: (title: string) => void;

  globalThis.chrome = {
    runtime: { onInstalled: { addListener() {} } },
    tabs: { onUpdated: { addListener() {} }, onRemoved: { addListener() {} } },
    storage: { session: { async set() {}, async remove() {} } },
    action: {
      onClicked: { addListener(listener: typeof onClick) { onClick = listener; } },
      async setBadgeText({ text }: { text: string }) { badge = text; },
      async setBadgeBackgroundColor() {},
      async setTitle({ title }: { title: string }) { completed(title); },
    },
    scripting: {
      async executeScript({ files }: { files?: string[] }) {
        scriptCalls++;
        if (files) return [];
        if (!probed) {
          probes++;
          if (probes <= failures) throw failure;
          probed = true;
          return [{ result: false }];
        }
        starts++;
        return [{ result: startupFailure ? { ok: false, error: startupFailure } : { ok: true } }];
      },
      async insertCSS() { insertions++; },
      async removeCSS() {
        removals++;
        if (cleanupFailure) throw cleanupFailure;
      },
    },
  } as unknown as typeof chrome;

  async function click(id: number, options: {
    failedAttempts?: number;
    error?: Error;
    url?: string;
    startupError?: string;
    cleanupError?: Error;
  } = {}) {
    failures = options.failedAttempts ?? 0;
    probes = starts = 0;
    scriptCalls = insertions = removals = 0;
    probed = false;
    badge = '';
    failure = options.error ?? new Error('Cannot access contents of the page.');
    startupFailure = options.startupError;
    cleanupFailure = options.cleanupError;
    const result = new Promise<string>(resolve => { completed = resolve; });
    onClick({ id, url: options.url ?? 'https://example.com' } as chrome.tabs.Tab);
    return result;
  }

  try {
    await import('../src/extension/background');
    await t.test('a delayed grant starts once and clears the error badge', async () => {
      assert.equal(await click(1, { failedAttempts: 1 }), 'Stop Vellum');
      assert.equal(probes, 2);
      assert.equal(starts, 1);
      assert.equal(badge, '');
    });
    await t.test('a persistent denial stops retrying and reports the error', async () => {
      assert.match(await click(2, { failedAttempts: Infinity }), /Cannot access contents/);
      assert.equal(probes, 5);
      assert.equal(starts, 0);
      assert.equal(badge, '!');
      assert.equal(removals, 0);
    });
    await t.test('other failures are reported without retrying', async () => {
      assert.match(await click(3, { failedAttempts: Infinity, error: new Error('The tab was closed.') }), /The tab was closed/);
      assert.equal(probes, 1);
      assert.equal(starts, 0);
      assert.equal(badge, '!');
      assert.equal(removals, 0);
    });
    for (const [id, url] of [[4, 'chrome://settings/'], [5, 'edge://settings/']] as const) {
      await t.test(`${url} reports a warning without scripting or cleanup`, async t => {
        const errors = t.mock.method(console, 'error', () => {});
        assert.match(await click(id, {
          url,
          cleanupError: new Error('Cannot access chrome:// and edge:// URLs'),
        }), /Open a regular http or https page/);
        assert.equal(scriptCalls, 0);
        assert.equal(insertions, 0);
        assert.equal(removals, 0);
        assert.equal(badge, '!');
        assert.equal(errors.mock.calls.length, 0);
      });
    }
    await t.test('failed startup removes injected styles and reports the startup error', async () => {
      assert.equal(await click(6, { startupError: 'The startup script failed.' }), 'Vellum: The startup script failed.');
      assert.equal(insertions, 1);
      assert.equal(removals, 1);
      assert.equal(badge, '!');
    });
    await t.test('real cleanup failures remain logged without replacing the startup warning', async t => {
      const cleanupError = new Error('The tab was closed.');
      const errors = t.mock.method(console, 'error', () => {});
      assert.equal(await click(7, {
        startupError: 'The startup script failed.',
        cleanupError,
      }), 'Vellum: The startup script failed.');
      assert.equal(insertions, 1);
      assert.equal(removals, 1);
      assert.equal(badge, '!');
      assert.equal(errors.mock.calls.length, 1);
      assert.deepEqual(errors.mock.calls[0].arguments, ['[Vellum] Could not remove injected styles:', cleanupError]);
    });
  } finally {
    globalThis.chrome = previous;
  }
});
