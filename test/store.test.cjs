'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const store = require('../src/store');

test('settings survive repeated saves and reinitializing the data file resets the cache', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hongguo-store-test-'));
  try {
    const firstFile = path.join(directory, 'first', 'data.json');
    store.init(firstFile);
    store.saveSettings({ root: 'D:\\Videos', max_concurrent: 4 });
    store.saveSettings({ root: 'E:\\Drama', max_concurrent: 2 });
    assert.deepEqual(store.getSettings(), { root: 'E:\\Drama', max_concurrent: 2 });
    assert.deepEqual(JSON.parse(fs.readFileSync(firstFile, 'utf8')).settings, { root: 'E:\\Drama', max_concurrent: 2 });

    const secondFile = path.join(directory, 'second', 'data.json');
    store.init(secondFile);
    assert.deepEqual(store.getSettings(), {});
    store.saveSettings({ root: 'F:\\Media' });
    assert.deepEqual(JSON.parse(fs.readFileSync(secondFile, 'utf8')).settings, { root: 'F:\\Media' });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
