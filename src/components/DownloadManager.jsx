import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './DownloadManager.css';
import { Download, Trash2, RefreshCw, X, Film, Square, Folder, Zap, CheckSquare, Play, Pause, Layers } from './icons';

const STATUS_TEXT = {
  pending: '等待中',
  downloading: '下载中',
  paused: '已暂停',
  interrupted: '上次中断',
  cancelled: '已取消',
  completed: '已完成',
  failed: '失败',
  missing: '文件缺失',
  stopped: '已停止',
};

const STATUS_ORDER = {
  downloading: 0,
  pending: 1,
  interrupted: 2,
  paused: 3,
  failed: 4,
  cancelled: 5,
  missing: 6,
  stopped: 7,
  completed: 8,
};

function sortTasks(list) {
  return [...list].sort((a, b) => {
    const wa = STATUS_ORDER[a.status] ?? 99;
    const wb = STATUS_ORDER[b.status] ?? 99;
    if (wa !== wb) return wa - wb;
    if (wa <= 1) {
      return (a.hongguoInfo?.vid_index || 0) - (b.hongguoInfo?.vid_index || 0) || (a.startTime || 0) - (b.startTime || 0);
    }
    return (b.endTime || b.startTime || 0) - (a.endTime || a.startTime || 0);
  });
}


function fmtBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return v.toFixed(v >= 100 || i === 0 ? 0 : 1) + ' ' + units[i];
}

function DownloadManager({ onNavigate }) {
  const [tasks, setTasks] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [toast, setToast] = useState(null);
  const [queue, setQueue] = useState({ active: 0, queued: 0, maxConcurrent: 3 });
  const [seriesList, setSeriesList] = useState([]);
  const [mergeSeriesId, setMergeSeriesId] = useState('');
  const [merging, setMerging] = useState(false);
  const [mergeTasks, setMergeTasks] = useState([]);
  const [confirmAsk, setConfirmAsk] = useState(null); // 删除确认（可勾选删除本地文件）
  const [mergeAsk, setMergeAsk] = useState(false);    // 合并格式选择
  const listenersRef = useRef([]);
  const toastTimerRef = useRef(null);

  const refresh = useCallback(async () => {
    const list = await window.electronAPI.getDownloadTasks();
    setTasks(list);
  }, []);

  const loadQueue = useCallback(async () => {
    try {
      const q = await window.electronAPI.getQueueStatus();
      if (q) setQueue(q);
    } catch (_) {}
  }, []);

  const loadSeriesList = useCallback(async () => {
    try {
      const list = (await window.electronAPI.getSeriesList()) || [];
      setSeriesList(list);
      setMergeSeriesId((prev) => prev || (list[0] ? String(list[0].series_id) : ''));
    } catch (_) {}
  }, []);

  const loadMergeTasks = useCallback(async () => {
    try {
      const list = (await window.electronAPI.getMergeTasks()) || [];
      setMergeTasks(list);
    } catch (_) {}
  }, []);

  const showToast = useCallback((text, type = 'success') => {
    setToast({ text, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    refresh();
    loadSeriesList();
    loadMergeTasks();
    const cleanups = [
      window.electronAPI.onDownloadProgress((data) => {
        setTasks((prev) =>
          prev.map((t) => (t.id === data.id && ['pending', 'downloading'].includes(t.status)
            ? { ...t, progress: data.progress, receivedBytes: data.receivedBytes, totalBytes: data.totalBytes, status: 'downloading' }
            : t))
        );
      }),
      window.electronAPI.onDownloadTaskAdded(() => refresh()),
      window.electronAPI.onDownloadCompleted((data) => {
        setTasks((prev) => prev.map((t) => (t.id === data.id ? { ...t, status: 'completed', progress: 100 } : t)));
      }),
      window.electronAPI.onDownloadFailed((data) => {
        setTasks((prev) => prev.map((t) => (t.id === data.id ? { ...t, status: 'failed', error: data.error } : t)));
      }),
      window.electronAPI.onDownloadStopped((data) => {
        setTasks((prev) => prev.map((t) => (t.id === data.id ? { ...t, status: 'cancelled' } : t)));
      }),
      window.electronAPI.onDownloadQueueChanged(() => {
        refresh();
        loadQueue();
      }),
      window.electronAPI.onMergeTaskAdded(() => loadMergeTasks()),
      window.electronAPI.onMergeProgress((data) => {
        setMergeTasks((prev) =>
          prev.map((t) => (t.id === data.id ? { ...t, progress: data.progress, status: 'running' } : t))
        );
      }),
      window.electronAPI.onMergeCompleted((data) => {
        loadMergeTasks();
        showToast('合并完成：' + (data.path ? data.path.split('\\').pop() : ''));
      }),
      window.electronAPI.onMergeFailed((data) => {
        loadMergeTasks();
        showToast('合并失败：' + (data.error || '未知错误'), 'error');
      }),
    ];
    listenersRef.current = cleanups;
    return () => cleanups.forEach((c) => c());
  }, [refresh, loadQueue, loadMergeTasks, showToast]);

  // 队列状态轮询：让「进行中 x / 并发上限 y」实时可见
  useEffect(() => {
    refresh();
    loadSeriesList();
    loadMergeTasks();
  }, [refresh, loadSeriesList, loadMergeTasks]);

  // 队列状态轮询：让「进行中 x / 并发上限 y」实时可见
  useEffect(() => {
    loadQueue();
    const timer = setInterval(() => {
      loadQueue();
      // 并发任务完成时状态需要刷新（completed/failed 事件已覆盖，这里兜底）
      refresh();
      // 合并进度兜底刷新
      setMergeTasks((prev) => {
        if (prev.some((t) => t.status === 'running')) loadMergeTasks();
        return prev;
      });
    }, 2000);
    return () => clearInterval(timer);
  }, [loadQueue, refresh, loadMergeTasks]);

  const toggleSelect = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const clearSelection = () => setSelected(new Set());

  const deleteTask = async (id) => {
    await window.electronAPI.deleteTask(id);
    refresh();
  };

  const fmtSize = (b) => {
    if (!b || b <= 0) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let v = b;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return v.toFixed(v >= 100 || i === 0 ? 0 : 1) + ' ' + u[i];
  };

  /** 弹删除确认：默认只删记录，可勾选同时删除本地文件 */
  const askDelete = async (list, label) => {
    const items = (list || []).filter(Boolean);
    if (!items.length) return;
    const preview = await window.electronAPI.previewDeleteTasks(items.map((task) => task.id));
    const estBytes = preview?.bytes || 0;
    const withFile = preview?.count || 0;
    setConfirmAsk({
      title: label,
      count: items.length,
      withFile,
      estBytes,
      onOk: async (deleteFiles) => {
        const ids = items.map((t) => t.id);
        const res = await window.electronAPI.deleteTasksWithFiles(ids, deleteFiles);
        setSelected(new Set());
        await refresh();
        if (res && res.success) {
          showToast(deleteFiles
            ? `已删除 ${res.count} 个任务，${res.fileCount || 0} 个文件已移入回收站`
            : `已删除 ${res.count} 个任务记录（本地文件已保留）`);
        } else if (res && res.error) {
          showToast(res.error, 'error');
        }
      },
    });
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    askDelete(tasks.filter((t) => selected.has(t.id)), '删除选中任务');
  };
  const retrySelected = async () => {
    if (selected.size === 0) return;
    const res = await window.electronAPI.retryTasks(Array.from(selected));
    setSelected(new Set());
    await refresh();
    if (res && res.success) {
      showToast(res.count > 0 ? `已重新加入队列：${res.count} 项` : '选中项中没有可重试的任务');
    } else {
      showToast((res && res.error) || '重试失败', 'error');
    }
  };

  // 一键合并选中的短剧
  const doMerge = async (compatible) => {
    if (!mergeSeriesId) {
      showToast('请先选择要合并的短剧', 'error');
      return;
    }
    setMergeAsk(false);
    setMerging(true);
    try {
      const res = await window.electronAPI.mergeSeries(mergeSeriesId, '', { compatible });
      if (!res || !res.success) {
        showToast((res && res.error) || '合并失败', 'error');
        return;
      }
      await loadMergeTasks();
      const sizeGb = (res.totalBytes / 1073741824).toFixed(2);
      const mins = Math.round(res.totalDuration / 60);
      showToast(compatible
        ? `开始兼容格式合并 ${res.count} 集（H.264，耗时较长）`
        : `开始合并 ${res.count} 集（约 ${sizeGb} GB / ${mins} 分钟）`);
      if (res.codecWarning) showToast(res.codecWarning, 'error');
    } catch (e) {
      showToast('合并异常: ' + e.message, 'error');
    } finally {
      setMerging(false);
    }
  };

  const cancelMerge = async (id) => {
    await window.electronAPI.cancelMerge(id);
    await loadMergeTasks();
    showToast('已取消合并');
  };

  const openMergedFile = async (path) => {
    if (!path) return;
    await window.electronAPI.showInFolder(path);
  };

  // 一键暂停：取消进行中的 + 清空等待队列
  const pauseAll = async () => {
    const res = await window.electronAPI.pauseAll();
    await refresh();
    await loadQueue();
    showToast(res && res.success ? `已暂停 ${res.count} 个任务` : '暂停失败', res && res.success ? 'success' : 'error');
  };

  // 一键启动：只恢复用户暂停或尚未开始的任务
  const resumeAll = async () => {
    const res = await window.electronAPI.resumeAll();
    await refresh();
    await loadQueue();
    showToast(res && res.success ? `已启动 ${res.count} 个任务` : '启动失败', res && res.success ? 'success' : 'error');
  };

  const retryableStatus = (status) => ['failed', 'cancelled', 'missing', 'interrupted', 'stopped'].includes(status);

  // 一键重试全部失败或上次中断的任务
  const retryAllFailed = async () => {
    const ids = tasks.filter((t) => retryableStatus(t.status)).map((t) => t.id);
    if (ids.length === 0) return;
    const res = await window.electronAPI.retryTasks(ids);
    await refresh();
    if (res && res.success) {
      showToast(`已重新加入队列：${res.count} 项`);
    } else {
      showToast((res && res.error) || '重试失败', 'error');
    }
  };

  // 一键选中全部可重试任务（选中后可再点「重试选中」）
  const selectAllFailed = () => {
    const ids = tasks.filter((t) => retryableStatus(t.status)).map((t) => t.id);
    if (ids.length === 0) {
      showToast('没有可重试的任务');
      return;
    }
    setSelected(new Set(ids));
    showToast(`已选中 ${ids.length} 项，可点「重试选中」重新下载`);
  };

  const clearCompleted = async () => {
    const done = tasks.filter((t) => t.status === 'completed');
    if (done.length === 0) return;
    askDelete(done, '清空已完成任务');
  };

  const sortedTasks = useMemo(() => sortTasks(tasks), [tasks]);

  const activeCount = tasks.filter((t) => t.status === 'downloading' || t.status === 'pending').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const failedTasks = useMemo(
    () => tasks.filter((t) => retryableStatus(t.status)),
    [tasks]
  );
  const failedCount = failedTasks.length;
  const interruptedTasks = tasks.filter((task) => task.status === 'interrupted');

  // 可暂停的任务：正在下载、等待中、已停止（未跑完的都算）
  const pausableCount = useMemo(
    () => tasks.filter((t) => ['downloading', 'pending', 'paused'].includes(t.status)).length,
    [tasks]
  );

  // 已选中项里真正可重试的数量
  const retryableSelectedCount = useMemo(
    () =>
      Array.from(selected).filter((id) => {
        const t = tasks.find((x) => x.id === id);
        return t && retryableStatus(t.status);
      }).length,
    [selected, tasks]
  );

  return (
    <div className="dm-container">
      <div className="dm-header">
        <div className="dm-title">
          <Download size={22} />
          <h2>下载管理</h2>
        </div>
        <div className="dm-stats">
          <span className="stat stat-active">进行中 {activeCount}</span>
          <span className="stat stat-done">已完成 {completedCount}</span>
          <span className="stat stat-fail">需重试 {failedCount}</span>
        </div>
      </div>

      <div className="dm-toolbar">
        <button
          className="btn btn-primary"
          onClick={resumeAll}
          disabled={queue.active > 0 || pausableCount === 0}
          title="重新启动等待中和已暂停的任务"
        >
          <Play size={15} />
          一键启动
        </button>
        <button
          className="btn btn-danger-solid"
          onClick={pauseAll}
          disabled={pausableCount === 0}
          title="暂停全部：取消正在下载的并清空等待队列"
        >
          <Pause size={15} />
          一键暂停
        </button>
        <button
          className="btn btn-primary"
          onClick={retryAllFailed}
          disabled={failedCount === 0}
          title="重试失败、取消、中断或文件缺失的任务"
        >
          <Zap size={15} />
          {failedCount > 0 ? `重试全部可恢复任务 (${failedCount})` : '重试全部可恢复任务'}
        </button>
        <button
          className="btn btn-outline"
          onClick={selectAllFailed}
          disabled={failedCount === 0}
          title="一键勾选所有可重试任务"
        >
          <CheckSquare size={15} />
          {failedCount > 0 ? `选中可重试项 (${failedCount})` : '选中可重试项'}
        </button>
        <button className="btn btn-outline" onClick={retrySelected} disabled={retryableSelectedCount === 0}>
          <RefreshCw size={15} />
          重试选中 ({retryableSelectedCount})
        </button>
        <button className="btn btn-outline" onClick={deleteSelected} disabled={selected.size === 0}>
          <Trash2 size={15} />
          删除选中
        </button>
        <button className="btn btn-outline" onClick={clearCompleted} disabled={completedCount === 0}>
          <X size={15} />
          清空已完成
        </button>
        <button className="btn btn-outline" onClick={clearSelection} disabled={selected.size === 0}>
          取消选择
        </button>
        <button
          className="btn btn-outline"
          onClick={async () => {
            const r = await window.electronAPI.rescanDownloads();
            await refresh();
            showToast(r && r.success
              ? `校准完成：补登记 ${r.added || 0}，恢复 ${r.recovered || 0}，缺失 ${r.missing || 0}`
              : '扫描失败');
          }}
          title="核对下载任务记录与磁盘上的实际文件"
        >
          <RefreshCw size={15} />
          校准文件库
        </button>
        {seriesList.length > 0 && (
          <div className="merge-inline">
            <select
              className="input-field merge-select"
              value={mergeSeriesId}
              onChange={(e) => setMergeSeriesId(e.target.value)}
              title="选择要合并的短剧"
            >
              {seriesList.map((s) => (
                <option key={s.series_id} value={String(s.series_id)}>
                  {s.series_title}
                </option>
              ))}
            </select>
            <button className="btn btn-outline" onClick={() => setMergeAsk(true)} disabled={merging} title="把该剧已下载的分集合并成单个 mp4">
              <Layers size={15} />
              {merging ? '合并中...' : '一键合并本剧'}
            </button>
          </div>
        )}
        {onNavigate && (
          <button className="btn btn-primary dm-toolbar-end" onClick={() => onNavigate('download')}>
            <Film size={15} />
            去下载
          </button>
        )}
      </div>

      {/* 合并任务 */}
      {mergeTasks.length > 0 && (
        <div className="merge-list">
          {mergeTasks.map((m) => (
            <div key={m.id} className={`merge-card merge-${m.status}`}>
              <Layers size={16} />
              <div className="merge-body">
                <div className="merge-title">
                  合并《{m.seriesTitle}》· {m.done || 0}/{m.total} 集
                </div>
                <div className="merge-sub">
                  {m.status === 'running' && <>正在合并… {m.progress || 0}%</>}
                  {m.status === 'completed' && (
                    <>
                      已完成 · {m.outputName}
                      {m.outputBytes ? ` · ${(m.outputBytes / 1073741824).toFixed(2)} GB` : ''}
                    </>
                  )}
                  {m.status === 'failed' && <>失败：{m.error}</>}
                  {m.status === 'stopped' && <>已取消</>}
                </div>
                {(m.status === 'running') && (
                  <div className="dm-progress">
                    <div className="dm-progress-bar">
                      <div className="dm-progress-fill" style={{ width: `${m.progress || 0}%` }} />
                    </div>
                    <span className="dm-pct">{m.progress || 0}%</span>
                  </div>
                )}
              </div>
              <div className="merge-actions">
                {m.status === 'running' && (
                  <button className="icon-btn" title="取消合并" onClick={() => cancelMerge(m.id)}>
                    <X size={16} />
                  </button>
                )}
                {m.status === 'completed' && (
                  <button className="icon-btn" title="打开所在文件夹" onClick={() => openMergedFile(m.output)}>
                    <Folder size={16} />
                  </button>
                )}
                {m.status !== 'running' && (
                  <button
                    className="icon-btn icon-btn-danger"
                    title="移除记录"
                    onClick={async () => {
                      await window.electronAPI.deleteMergeTask(m.id);
                      loadMergeTasks();
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {queue.active > 0 && (
        <div className="dm-queue-bar">
          <span className="dm-queue-running">
            <span className="dm-queue-pulse" />
            正在并发下载 <b>{queue.active}</b> / {queue.maxConcurrent}
            {queue.queued > 0 ? <> · 队列等待 <b>{queue.queued}</b></> : null}
          </span>
          <span className="dm-queue-hint">
            并发数可在「设置 → 最大并发下载数」调整
          </span>
        </div>
      )}

      {interruptedTasks.length > 0 && (
        <div className="dm-hint dm-recovery">
          <span>检测到上次退出时中断的 <b>{interruptedTasks.length}</b> 个任务。选择重试后会重新下载。</span>
          <button className="btn btn-primary btn-sm" onClick={async () => {
            const result = await window.electronAPI.retryTasks(interruptedTasks.map((task) => task.id));
            await refresh();
            showToast(result?.success ? `已重新排队 ${result.count} 个中断任务` : (result?.error || '恢复失败'), result?.success ? 'success' : 'error');
          }}>重新排队全部</button>
        </div>
      )}

      {retryableSelectedCount > 0 && (
        <div className="dm-hint">
          已选中 <b>{retryableSelectedCount}</b> 个失败项，点
          <b>「重试选中」</b> 即会重新下载（无需重新解析）。
        </div>
      )}

      {sortedTasks.length === 0 ? (
        <div className="dm-empty">
          <Download size={40} />
          <p>暂无下载任务</p>
          <p className="dm-empty-sub">前往「红果下载」解析短剧并提交下载</p>
        </div>
      ) : (
        <div className="dm-list">
          {sortedTasks.map((task) => {

            const isSel = selected.has(task.id);
            const isActive = task.status === 'downloading' || task.status === 'pending';
            const canStop = task.status === 'downloading' || task.status === 'pending';
            const canRetry = retryableStatus(task.status);
            const pct = task.progress || 0;
            return (
              <div key={task.id} className={`dm-task ${isSel ? 'selected' : ''}`} onClick={() => toggleSelect(task.id)}>
                <div className="dm-task-cover">
                  {task.videoInfo && task.videoInfo.cover ? (
                    <img src={task.videoInfo.cover} alt="" />
                  ) : (
                    <div className="cover-placeholder"><Film size={18} /></div>
                  )}
                </div>
                <div className="dm-task-body">
                  <div className="dm-task-title">{task.title || task.filename}</div>
                  <div className="dm-task-meta">
                    <span className={`status-tag status-${task.status}`}>{STATUS_TEXT[task.status] || task.status}</span>
                    {task.status === 'downloading' && task.totalBytes > 0 && (
                      <span className="dm-size">{fmtBytes(task.receivedBytes)} / {fmtBytes(task.totalBytes)}</span>
                    )}
                    {['failed', 'interrupted', 'missing'].includes(task.status) && task.error && <span className="dm-error">{task.error}</span>}
                  </div>
                  {(task.status === 'downloading' || task.status === 'pending') && (
                    <div className="dm-progress">
                      <div className="dm-progress-bar">
                        <div className="dm-progress-fill" style={{ width: pct + '%' }}></div>
                      </div>
                      <span className="dm-pct">{pct}%</span>
                    </div>
                  )}
                </div>
                <div className="dm-task-actions" onClick={(e) => e.stopPropagation()}>
                  {canStop && (
                    <button className="icon-btn" title="停止" onClick={() => { window.electronAPI.stopDownload(task.id); refresh(); }}>
                      <Square size={16} />
                    </button>
                  )}
                  {canRetry && (
                    <button className="icon-btn" title="重试" onClick={() => { window.electronAPI.retryTask(task.id); }}>
                      <RefreshCw size={16} />
                    </button>
                  )}
                  <button className="icon-btn" title="打开文件夹" onClick={() => window.electronAPI.openFolder(task.id)}>
                    <Folder size={16} />
                  </button>
                  <button
                    className="icon-btn icon-btn-danger"
                    title="删除任务（可选是否同时删除本地文件）"
                    onClick={() => {
                      askDelete([task], `删除《${task.hongguoInfo && task.hongguoInfo.series_title ? task.hongguoInfo.series_title : ''}》第 ${task.hongguoInfo ? task.hongguoInfo.vid_index : ''} 集任务`);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {toast && (
        <div className={`dm-toast dm-toast-${toast.type}`} onClick={() => setToast(null)}>
          {toast.text}
        </div>
      )}

      {/* 合并格式选择 */}
      {mergeAsk && (
        <div className="player-confirm-mask" onClick={() => setMergeAsk(false)}>
          <div className="player-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="player-confirm-title" style={{ color: 'var(--accent)' }}>
              <Layers size={17} />
              合并导出全集
            </div>
            <div className="player-confirm-msg">
              <p>把该剧已下载的分集合并为一个 mp4。</p>
              <p><b>快速合并</b>：原画质直接拼接，秒级完成，但格式仍是 HEVC —— 在部分电脑上可能黑屏有声。</p>
              <p><b>兼容合并</b>：转码为 H.264，任何电脑/播放器都能播，但速度慢（约每分钟视频需数秒）。</p>
            </div>
            <div className="player-confirm-foot">
              <button className="btn btn-outline" onClick={() => setMergeAsk(false)}>取消</button>
              <button className="btn btn-outline" onClick={() => doMerge(true)} disabled={merging}>
                兼容合并（H.264）
              </button>
              <button className="btn btn-primary" onClick={() => doMerge(false)} disabled={merging}>
                快速合并
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认（可选是否连本地文件一起删） */}
      {confirmAsk && (
        <div className="player-confirm-mask" onClick={() => setConfirmAsk(null)}>
          <div className="player-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="player-confirm-title">
              <Trash2 size={17} />
              {confirmAsk.title}
            </div>
            <div className="player-confirm-msg">
              <p>共 {confirmAsk.count} 个任务，发现 {confirmAsk.withFile} 个本地文件，合计 {fmtSize(confirmAsk.estBytes)}。</p>
              <label className="dm-confirm-check">
                <input
                  type="checkbox"
                  checked={!!confirmAsk._del}
                  onChange={(e) => setConfirmAsk({ ...confirmAsk, _del: e.target.checked })}
                />
                <span>
                  同时移入 Windows 回收站（可从回收站恢复）
                </span>
              </label>
              <p className="dm-confirm-hint">
                勾选后显示的文件数量和大小会移入回收站；不勾选则只移除任务记录，保留本地文件。
              </p>
            </div>
            <div className="player-confirm-foot">
              <button className="btn btn-outline" onClick={() => setConfirmAsk(null)}>取消</button>
              <button
                className={`btn ${confirmAsk._del ? 'btn-danger-solid' : 'btn-primary'}`}
                onClick={async () => {
                  const fn = confirmAsk.onOk;
                  const del = !!confirmAsk._del;
                  setConfirmAsk(null);
                  await fn(del);
                }}
              >
                {confirmAsk._del ? '移入回收站并删除任务' : '仅删除任务记录'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DownloadManager;
