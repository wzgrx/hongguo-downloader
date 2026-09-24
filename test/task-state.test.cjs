'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  prepareTaskForRetry,
  reconcileTaskFiles,
  restoreTask,
  transitionTask,
} = require('../src/task-state.cjs');

test('startup marks pending and downloading tasks interrupted without auto-resuming them', () => {
  assert.equal(restoreTask({ id: 'a', status: 'pending' }).status, 'interrupted');
  assert.equal(restoreTask({ id: 'b', status: 'downloading' }).status, 'interrupted');
  assert.equal(restoreTask({ id: 'c', status: 'completed' }).status, 'completed');
});

test('task transitions reject invalid state changes', () => {
  assert.equal(transitionTask({ status: 'pending' }, 'downloading').status, 'downloading');
  assert.throws(() => transitionTask({ status: 'completed' }, 'pending'), /Invalid task transition/);
});

test('interrupted tasks can be explicitly retried and stale error details are cleared', () => {
  const retried = prepareTaskForRetry({ id: 'a', status: 'interrupted', error: 'old', progress: 52 });
  assert.equal(retried.status, 'pending');
  assert.equal(retried.progress, 0);
  assert.equal('error' in retried, false);
});

test('disk reconciliation marks missing files and recovers complete files', () => {
  const result = reconcileTaskFiles([
    { id: 'missing', status: 'completed', savePath: 'C:\\video\\missing.mp4' },
    { id: 'interrupted', status: 'interrupted', savePath: 'C:\\video\\ready.mp4' },
    { id: 'small', status: 'interrupted', savePath: 'C:\\video\\partial.mp4' },
  ], [
    { path: 'c:/video/ready.mp4', size: 500_000 },
    { path: 'c:/video/partial.mp4', size: 20_000 },
  ], 100_000);

  assert.equal(result.missing, 1);
  assert.equal(result.recovered, 1);
  assert.equal(result.tasks.find((task) => task.id === 'missing').status, 'missing');
  assert.equal(result.tasks.find((task) => task.id === 'interrupted').status, 'completed');
  assert.equal(result.tasks.find((task) => task.id === 'small').status, 'interrupted');
});
