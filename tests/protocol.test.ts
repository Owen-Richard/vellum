import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  annotationRouteFromStorageKey,
  pagePath,
  storageKey,
  supportedUrl,
  validStoredValue,
} from '../src/extension/protocol';
import { computeEdits, formatCssEditsDiff, parseEditorBuffer } from '../src/vellum/core/cssEdits';

test('activation permits web pages but not browser pages or stores', () => {
  for (const url of ['https://example.com', 'http://localhost:3000/a']) assert.ok(supportedUrl(url));
  for (const url of ['edge://settings', 'chrome://extensions', 'file:///tmp/a', 'about:blank',
    'https://chromewebstore.google.com/a', 'https://microsoftedge.microsoft.com/addons', 'bad']) {
    assert.equal(supportedUrl(url), false);
  }
});
test('notes are isolated by origin, path, query and hash', () => {
  const urls = ['https://a.test/a', 'https://b.test/a', 'https://a.test/b', 'https://a.test/a?q=1', 'https://a.test/a#b'];
  assert.equal(new Set(urls.map(url => storageKey(url, 'vellum-annotations'))).size, urls.length);
  assert.equal(storageKey(urls[0], 'vellum-theme'), storageKey(urls[2], 'vellum-theme'));
  assert.equal(pagePath('https://a.test/a?b=1#c'), '/a?b=1#c');
});
test('annotation storage keys reveal routes only for the requested origin', () => {
  const key = storageKey('https://a.test/a?b=1#c', 'vellum-annotations');
  assert.equal(annotationRouteFromStorageKey(key, 'https://a.test'), '/a?b=1#c');
  assert.equal(annotationRouteFromStorageKey(key, 'https://b.test'), null);
  assert.equal(annotationRouteFromStorageKey(
    storageKey('https://a.test/a', 'vellum-theme'),
    'https://a.test',
  ), null);
  assert.equal(annotationRouteFromStorageKey('not-json', 'https://a.test'), null);
});
test('bridge accepts bounded, valid values only', () => {
  const note = { id: '1', kind: 'comment', text: 'Spacing', elementSelector: 'button', timestamp: 1 };
  assert.ok(validStoredValue('vellum-annotations', [note]));
  assert.equal(validStoredValue('vellum-annotations', [{ ...note, text: 4 }]), false);
  assert.equal(validStoredValue('vellum-annotations', Array(501).fill(note)), false);
  assert.equal(validStoredValue('vellum-annotations', [{ ...note, kind: 'css-edit', edits: [{}] }]), false);
  assert.equal(validStoredValue('arbitrary-extension-key', []), false);
  assert.equal(validStoredValue('vellum-theme', 'injected'), false);
  assert.equal(validStoredValue('vellum-toolbar-pos', { anchor: {}, offset: { x: NaN, y: 0 } }), false);
});
test('CSS editing preserves add, change, remove and important semantics', () => {
  const base = { color: { value: 'red', important: false }, margin: { value: '2px', important: true } };
  const edits = computeEdits(base, parseEditorBuffer('color: blue !important; padding: 4px;'));
  assert.deepEqual(edits.map(edit => edit.action), ['change', 'add', 'remove']);
  const output = formatCssEditsDiff('button', edits);
  assert.match(output, /\+ color: blue !important;/);
  assert.match(output, /\+ margin: unset !important;/);
});
