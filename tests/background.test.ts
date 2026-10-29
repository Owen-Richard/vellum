import assert from 'node:assert/strict';
import test from 'node:test';

test('browser action handles delayed tab grants without hiding startup errors', async t => {
  const previous = globalThis.chrome;
  let onClick: (tab: chrome.tabs.Tab) => void;
  let failures = 0;
  let probes = 0;
  let probed = false;
  let starts = 0;
  let badge = '';
  let failure: Error;
  let completed: (title: string) => void;

  globalThis.chrome = {
    runtime: { onInstalled: { addListener() {} } },
    action: {
      onClicked: { addListener(listener: typeof onClick) { onClick = listener; } },
      async setBadgeText({ text }: { text: string }) { badge = text; },
      async setBadgeBackgroundColor() {},
      async setTitle({ title }: { title: string }) { completed(title); },
    },
    scripting: {
      async executeScript({ files }: { files?: string[] }) {
        if (files) return [];
        if (!probed) {
          probes++;
          if (probes <= failures) throw failure;
          probed = true;
          return [{ result: false }];
        }
        starts++;
        return [{ result: { ok: true } }];
      },
      async insertCSS() {},
      async removeCSS() {},
    },
  } as unknown as typeof chrome;

  async function click(id: number, failedAttempts: number, error: Error) {
    failures = failedAttempts;
    probes = starts = 0;
    probed = false;
    badge = '';
    failure = error;
    const result = new Promise<string>(resolve => { completed = resolve; });
    onClick({ id, url: 'https://example.com' } as chrome.tabs.Tab);
    return result;
  }

  try {
    await import('../src/extension/background');
    await t.test('a delayed grant starts once and clears the error badge', async () => {
      assert.equal(await click(1, 1, new Error('Cannot access contents of the page.')), 'Stop Vellum');
      assert.equal(probes, 2);
      assert.equal(starts, 1);
      assert.equal(badge, '');
    });
    await t.test('a persistent denial stops retrying and reports the error', async () => {
      assert.match(await click(2, Infinity, new Error('Cannot access contents of the page.')), /Cannot access contents/);
      assert.equal(probes, 5);
      assert.equal(starts, 0);
      assert.equal(badge, '!');
    });
    await t.test('other failures are reported without retrying', async () => {
      assert.match(await click(3, Infinity, new Error('The tab was closed.')), /The tab was closed/);
      assert.equal(probes, 1);
      assert.equal(starts, 0);
      assert.equal(badge, '!');
    });
  } finally {
    globalThis.chrome = previous;
  }
});
