import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestGate } from '../src/request-gate.mjs';

test('only the newest asynchronous request may commit its result', () => {
  const gate = createRequestGate();
  const oldRequest = gate.next();
  const newRequest = gate.next();
  assert.equal(gate.isCurrent(oldRequest), false);
  assert.equal(gate.isCurrent(newRequest), true);
});

test('invalidating a request makes its result stale', () => {
  const gate = createRequestGate();
  const request = gate.next();
  gate.invalidate();
  assert.equal(gate.isCurrent(request), false);
});

test('rapid series switching keeps the newest series and episode selection', async () => {
  const gate = createRequestGate();
  let selection = { seriesId: 'old-series', episode: 1 };
  let resolveOld;
  const oldResponse = new Promise((resolve) => { resolveOld = resolve; });
  const oldRequest = gate.next();
  const oldSelection = oldResponse.then((result) => {
    if (gate.isCurrent(oldRequest)) selection = result;
  });

  const newRequest = gate.next();
  if (gate.isCurrent(newRequest)) selection = { seriesId: 'new-series', episode: 8 };
  resolveOld({ seriesId: 'old-series', episode: 2 });
  await oldSelection;

  assert.deepEqual(selection, { seriesId: 'new-series', episode: 8 });
});
