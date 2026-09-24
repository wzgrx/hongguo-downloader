'use strict';

const ALLOWED_TRANSITIONS = Object.freeze({
  pending: new Set(['downloading', 'paused', 'cancelled', 'interrupted', 'failed', 'completed', 'missing']),
  downloading: new Set(['paused', 'cancelled', 'interrupted', 'failed', 'completed', 'missing']),
  paused: new Set(['pending', 'cancelled', 'completed', 'missing']),
  interrupted: new Set(['pending', 'cancelled', 'completed', 'missing']),
  cancelled: new Set(['pending', 'completed', 'missing']),
  failed: new Set(['pending', 'completed', 'missing']),
  missing: new Set(['pending', 'completed']),
  completed: new Set(['missing']),
});

const RETRYABLE_STATUSES = new Set(['paused', 'interrupted', 'cancelled', 'failed', 'missing', 'stopped']);
const RECOVERY_STATUSES = new Set(['interrupted']);

function transitionTask(task, status, updates = {}) {
  if (!task || typeof task !== 'object') throw new TypeError('task must be an object');
  if (!ALLOWED_TRANSITIONS[status]) throw new Error(`Unknown task status: ${status}`);
  const current = task.status || 'pending';
  if (current !== status && !ALLOWED_TRANSITIONS[current]?.has(status)) {
    throw new Error(`Invalid task transition: ${current} -> ${status}`);
  }
  return { ...task, ...updates, status };
}

function restoreTask(task) {
  if (!task || typeof task !== 'object') return task;
  if (task.status === 'pending' || task.status === 'downloading') {
    return transitionTask(task, 'interrupted', {
      error: '应用上次关闭时任务未完成，可选择重新排队',
      interruptedAt: task.interruptedAt || Date.now(),
      cancelled: false,
    });
  }
  // 旧版本的 stopped 同时代表暂停或用户停止，恢复时按可重试状态展示。
  if (task.status === 'stopped') {
    return { ...task, status: 'paused', error: task.error || '' };
  }
  return { ...task };
}

function prepareTaskForRetry(task) {
  if (!task || !RETRYABLE_STATUSES.has(task.status)) {
    throw new Error(`Task cannot be retried from status: ${task && task.status}`);
  }
  const source = task.status === 'stopped' ? { ...task, status: 'paused' } : task;
  const next = transitionTask(source, 'pending', {
    progress: 0,
    receivedBytes: 0,
    totalBytes: 0,
    cancelled: false,
  });
  delete next.error;
  delete next.interruptedAt;
  delete next.cancelReason;
  delete next.cancelSource;
  delete next.writer;
  return next;
}

function normalizePathKey(filePath) {
  return String(filePath || '').replace(/[\\/]+/g, '\\').replace(/\\+$/, '').toLowerCase();
}

/** Reconcile saved task rows against a fresh list of files on disk. */
function reconcileTaskFiles(tasks, files, minCompleteBytes = 100 * 1024) {
  const fileSizes = new Map();
  for (const file of files || []) {
    if (file && file.path) fileSizes.set(normalizePathKey(file.path), Number(file.size) || 0);
  }

  let missing = 0;
  let recovered = 0;
  const nextTasks = (tasks || []).map((task) => {
    if (!task || !task.savePath) return task;
    const key = normalizePathKey(task.savePath);
    const present = fileSizes.has(key);
    const size = present ? fileSizes.get(key) : 0;

    if (task.status === 'completed' && !present) {
      missing++;
      return transitionTask(task, 'missing', { error: '本地文件不存在，可重新下载' });
    }

    if (present && size >= minCompleteBytes && task.status !== 'completed') {
      const current = task.status === 'stopped' ? { ...task, status: 'paused' } : task;
      if (ALLOWED_TRANSITIONS[current.status]?.has('completed')) {
        recovered++;
        const next = transitionTask(current, 'completed', {
          progress: 100,
          receivedBytes: size,
          totalBytes: size,
          endTime: current.endTime || Date.now(),
        });
        delete next.error;
        return next;
      }
    }
    return task;
  });

  return { tasks: nextTasks, missing, recovered };
}

module.exports = {
  ALLOWED_TRANSITIONS,
  RECOVERY_STATUSES,
  RETRYABLE_STATUSES,
  normalizePathKey,
  prepareTaskForRetry,
  reconcileTaskFiles,
  restoreTask,
  transitionTask,
};
