import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './Player.css';
import { Play, Film, Download, Check, RefreshCw, Layers, X, Trash2, ChevronDown, Zap } from './icons';
import { createRequestGate } from '../request-gate.mjs';

/**
 * Player —— 内置播放器
 *
 * 设计要点：
 *  - 直接播本地 file:// 文件（实测支持 seek），无需流服务器
 *  - 「边下边看」：下一集若还在下载，显示等待态并轮询，下完自动接上
 *  - 断点续播：按 series_id 记住看到第几集、第几秒
 */
function Player({ target, onNavigate }) {
  const [seriesList, setSeriesList] = useState([]);
  const [activeSeriesId, setActiveSeriesId] = useState('');
  const [detail, setDetail] = useState(null); // { series_title, episodes: [...], total, completedCount }
  const [currentIndex, setCurrentIndex] = useState(1);
  const [autoNext, setAutoNext] = useState(true);
  const [waitingFor, setWaitingFor] = useState(null); // 正在等待下载的集号
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);   // 剧集选择面板
  const [pickerQuery, setPickerQuery] = useState('');
  const [dismissedCount, setDismissedCount] = useState(0);

  // 在线播放（内存缓存，不落盘）
  const [onlineVid, setOnlineVid] = useState(null);
  const [onlineUrl, setOnlineUrl] = useState('');
  const [onlineProgress, setOnlineProgress] = useState(null); // {percent, phase}
  const [cacheInfo, setCacheInfo] = useState({ count: 0, bytes: 0 });
  const [downloadedMap, setDownloadedMap] = useState({}); // series_id -> {completed,total}
  const [storageMap, setStorageMap] = useState({});       // series_id -> {files,bytes}
  const [storageTotal, setStorageTotal] = useState({ files: 0, bytes: 0 });
  const [autoDelete, setAutoDelete] = useState(false);    // 看完自动删本地文件
  const [confirmAsk, setConfirmAsk] = useState(null);     // {title, message, danger, onOk}

  // 兼容模式：本机解不了 HEVC 时转码为 H.264
  const [autoCompat, setAutoCompat] = useState(true);
  const [compatMap, setCompatMap] = useState({});         // vidIndex -> 转码后 url
  const [compatProgress, setCompatProgress] = useState(null); // {vidIndex, percent}
  const [decodeFailed, setDecodeFailed] = useState(false);    // 当前集解不出画面
  const [compatCache, setCompatCache] = useState({ files: 0, bytes: 0 });
  const [mergeAsk, setMergeAsk] = useState(false);            // 合并格式选择

  const videoRef = useRef(null);
  const toastTimer = useRef(null);
  const pendingSeekRef = useRef(0); // 切集后要跳转的秒数
  const lastSavedRef = useRef(0);
  const seriesListRequestGate = useRef(createRequestGate());
  const detailRequestGate = useRef(createRequestGate());
  const selectionRequestGate = useRef(createRequestGate());
  const stateRef = useRef({ currentIndex, autoNext, activeSeriesId });
  stateRef.current = { currentIndex, autoNext, activeSeriesId };

  const showToast = useCallback((text) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // 载入已登记的剧集列表
  const loadSeriesList = useCallback(async () => {
    const requestId = seriesListRequestGate.current.next();
    const list = (await window.electronAPI.getSeriesList()) || [];
    if (!seriesListRequestGate.current.isCurrent(requestId)) return [];
    setSeriesList(list);
    return list;
  }, []);

  // 载入某剧的分集状态
  const loadDetail = useCallback(async (seriesId, opts = {}) => {
    if (!seriesId) return null;
    const requestId = detailRequestGate.current.next();
    const res = await window.electronAPI.getSeriesEpisodes(seriesId);
    if (!res || !res.success) return null;
    if (!detailRequestGate.current.isCurrent(requestId)) return null;
    setDetail(res.data);
    return res.data;
  }, []);

  const refreshCacheInfo = useCallback(async () => {
    try {
      const res = await window.electronAPI.onlineCacheStatus();
      if (res && res.success) setCacheInfo({ count: res.count, bytes: res.bytes });
      const dc = await window.electronAPI.dismissedCount();
      setDismissedCount(dc || 0);
      const st = await window.electronAPI.getStorageUsage();
      if (st && st.success) {
        const map = {};
        for (const s of st.series) map[String(s.series_id)] = { files: s.files, bytes: s.bytes, merged: s.merged };
        setStorageMap(map);
        setStorageTotal({ files: st.totalFiles, bytes: st.totalBytes });
      }
    } catch (_) {}
  }, []);

  const fmtSize = (b) => {
    if (!b || b <= 0) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let v = b;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return v.toFixed(v >= 100 || i === 0 ? 0 : 1) + ' ' + u[i];
  };

  useEffect(() => {
    refreshCacheInfo();
    window.electronAPI.getSettings().then((s) => {
      if (s) {
        setAutoDelete(s.auto_delete_watched === true);
        setAutoCompat(s.compat_mode !== false); // 默认开启
      }
    });
    window.electronAPI.compatCacheStatus().then((r) => {
      if (r && r.success) setCompatCache({ files: r.files, bytes: r.bytes });
    });
  }, [refreshCacheInfo]);

  useEffect(() => {
    if (!window.electronAPI.onTranscodeProgress) return undefined;
    return window.electronAPI.onTranscodeProgress((d) => {
      if (d.done) return;
      setCompatProgress({ vidIndex: d.vidIndex, percent: d.percent || 0 });
    });
  }, []);

  /**
   * 注意：以下三个用到 episodes 的函数必须定义在 episodes 之后。
   * useCallback 的依赖数组在「定义时」就会求值，若提前引用后声明的 const
   * 会触发 TDZ（Cannot access 'X' before initialization）导致整页白屏。
   */
  const toggleAutoCompat = async () => {
    const next = !autoCompat;
    setAutoCompat(next);
    try {
      const s = await window.electronAPI.getSettings();
      await window.electronAPI.saveSettings({ ...s, compat_mode: next });
      showToast(next ? '兼容模式已开启：无法解码时自动转码' : '兼容模式已关闭');
    } catch (_) {}
  };

  const toggleAutoDelete = async () => {
    const next = !autoDelete;
    setAutoDelete(next);
    try {
      const s = await window.electronAPI.getSettings();
      await window.electronAPI.saveSettings({ ...s, auto_delete_watched: next });
      showToast(next ? '已开启：看完一集自动删除本地文件' : '已关闭自动删除');
    } catch (_) {}
  };

  // 打开剧集面板时，补全各剧的下载进度（只拉一次）
  useEffect(() => {
    if (!pickerOpen) return;
    let cancelled = false;
    (async () => {
      const map = {};
      for (const s of seriesList) {
        try {
          const res = await window.electronAPI.getSeriesEpisodes(s.series_id);
          if (res && res.success) map[String(s.series_id)] = { completed: res.data.completedCount, total: res.data.total };
        } catch (_) {}
        if (cancelled) return;
      }
      if (!cancelled) setDownloadedMap(map);
    })();
    return () => { cancelled = true; };
  }, [pickerOpen, seriesList]);

  useEffect(() => {
    if (!window.electronAPI.onOnlinePlayProgress) return undefined;
    return window.electronAPI.onOnlinePlayProgress((d) => {
      setOnlineProgress({
        vid: d.vid,
        percent: d.percent || 0,
        phase: d.phase || 'downloading',
        received: d.received,
        total: d.total,
      });
    });
  }, []);

  useEffect(() => {
    const requestId = selectionRequestGate.current.next();
    (async () => {
      setLoading(true);
      const list = await loadSeriesList();
      if (!selectionRequestGate.current.isCurrent(requestId)) return;
      if (list.length) {
        // 浏览页点播时优先用指定剧，否则选最近更新的那部
        const wanted = target && target.seriesId ? String(target.seriesId) : '';
        const exists = wanted && list.some((s) => String(s.series_id) === wanted);
        const sorted = [...list].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        const sid = exists ? wanted : sorted[0].series_id;
        setActiveSeriesId(sid);
        const d = await loadDetail(sid);
        if (!selectionRequestGate.current.isCurrent(requestId)) return;

        if (exists && target.vidIndex) {
          // 点播指定集：优先播它（若尚未下载则交给等待逻辑）
          setCurrentIndex(target.vidIndex);
          const ep = d && d.episodes.find((e) => e.vid_index === target.vidIndex);
          if (ep && ep.status !== 'completed') setWaitingFor(target.vidIndex);
        } else {
          // 恢复断点
          const saved = await window.electronAPI.getPlaybackPosition(sid);
          if (!selectionRequestGate.current.isCurrent(requestId)) return;
          if (saved && saved.vid_index) setCurrentIndex(saved.vid_index);
          else if (d) {
            const firstPlayable = d.episodes.find((e) => e.status === 'completed');
            setCurrentIndex(firstPlayable ? firstPlayable.vid_index : 1);
          }
          pendingSeekRef.current = saved ? saved.currentTime || 0 : 0;
        }
      }
      if (selectionRequestGate.current.isCurrent(requestId)) setLoading(false);
    })();
    return () => {
      selectionRequestGate.current.invalidate();
      seriesListRequestGate.current.invalidate();
      detailRequestGate.current.invalidate();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSeriesList, loadDetail]);

  // 浏览页再次点播（组件已挂载时）
  const handledTargetRef = useRef(0);
  useEffect(() => {
    if (!target || !target.seriesId || !target.ts) return;
    if (handledTargetRef.current === target.ts) return;
    handledTargetRef.current = target.ts;
    const requestId = selectionRequestGate.current.next();
    (async () => {
      const list = await loadSeriesList();
      if (!selectionRequestGate.current.isCurrent(requestId)) return;
      const wanted = String(target.seriesId);
      if (!list.some((s) => String(s.series_id) === wanted)) return;
      setActiveSeriesId(wanted);
      setWaitingFor(null);
      pendingSeekRef.current = 0;
      const d = await loadDetail(wanted);
      if (!selectionRequestGate.current.isCurrent(requestId)) return;
      if (target.vidIndex) {
        setCurrentIndex(target.vidIndex);
        const ep = d && d.episodes.find((e) => e.vid_index === target.vidIndex);
        if (ep && ep.status !== 'completed') setWaitingFor(target.vidIndex);
      } else if (d) {
        const firstPlayable = d.episodes.find((e) => e.status === 'completed');
        setCurrentIndex(firstPlayable ? firstPlayable.vid_index : 1);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target && target.ts]);

  // 轮询：让「正在下载」的集实时更新，并在等待时自动接上
  useEffect(() => {
    if (!activeSeriesId) return;
    const timer = setInterval(async () => {
      const d = await loadDetail(activeSeriesId);
      if (!d) return;
      const { waitingFor: wf } = stateRef.current;
      if (wf != null) {
        const ep = d.episodes.find((e) => e.vid_index === wf);
        if (ep && ep.status === 'completed') {
          // 等待中的下一集下好了 -> 自动切过去
          setWaitingFor(null);
          goToEpisode(wf, true);
        }
      }
    }, 2000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSeriesId, loadDetail]);

  const episodes = detail ? detail.episodes : [];
  const current = useMemo(
    () => episodes.find((e) => e.vid_index === currentIndex) || null,
    [episodes, currentIndex]
  );

  const playableCount = episodes.filter((e) => e.status === 'completed').length;

  /** 转码当前集为 H.264 后播放（解决本机无法解码 HEVC 的黑屏问题） */
  const startCompatPlay = useCallback(
    async (vidIndex) => {
      const ep = episodes.find((e) => e.vid_index === vidIndex);
      if (!ep) return;
      setCompatProgress({ vidIndex, percent: 0 });
      try {
        const res = await window.electronAPI.transcodeForPlayback({
          seriesId: activeSeriesId,
          vidIndex,
          vid: ep.vid,
          filePath: ep.savePath || null,
        });
        if (res && res.success) {
          setCompatMap((prev) => ({ ...prev, [vidIndex]: res.url }));
          setDecodeFailed(false);
          setCompatProgress(null);
          showToast(res.cached ? '已切换为兼容格式播放' : `已转码为兼容格式（用时 ${res.elapsed}s），开始播放`);
          window.electronAPI.compatCacheStatus().then((r) => {
            if (r && r.success) setCompatCache({ files: r.files, bytes: r.bytes });
          });
        } else {
          setCompatProgress(null);
          showToast((res && res.error) || '转码失败');
        }
      } catch (e) {
        setCompatProgress(null);
        showToast('转码异常: ' + e.message);
      }
    },
    [episodes, activeSeriesId, showToast]
  );

  const clearCompatCache = async () => {
    const r = await window.electronAPI.clearCompatCache();
    setCompatCache({ files: 0, bytes: 0 });
    showToast(r && r.count > 0 ? `已清理转码缓存，释放 ${fmtSize(r.freed)}` : '转码缓存已是空的');
  };

  // 播放中若始终解不出画面（videoWidth 一直为 0），判定为解码不兼容。
  // 必须定义在早返回之前 —— hooks 不能出现在条件分支之后。
  const handlePlaying = useCallback(() => {
    setDecodeFailed(false);
    const idx = currentIndex;
    setTimeout(() => {
      const v = videoRef.current;
      if (!v) return;
      if (v.videoWidth === 0 && !v.paused && v.currentTime > 0.3) {
        setDecodeFailed(true);
        if (autoCompat && !compatMap[idx]) {
          showToast('该视频格式（HEVC）本机无法解码，正在转码为兼容格式…');
          startCompatPlay(idx);
        }
      }
    }, 2600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCompat, compatMap, currentIndex, startCompatPlay, showToast]);

  /**
   * 在线播放：让主进程把该集下载+解密到内存，拿回可播放的流地址。
   * 不写本地文件、不占用下载目录，看完可选择清理内存缓存。
   */
  const startOnlinePlay = useCallback(
    async (vidIndex) => {
      const ep = episodes.find((e) => e.vid_index === vidIndex);
      if (!ep || !ep.vid) {
        showToast('这一集缺少 vid，无法在线播放');
        return;
      }
      setCurrentIndex(vidIndex);
      setWaitingFor(null);
      setOnlineProgress({ vid: ep.vid, percent: 0, phase: 'downloading' });
      setOnlineVid(ep.vid);
      setOnlineUrl('');
      try {
        const res = await window.electronAPI.prepareOnlinePlay({
          vid: ep.vid,
          seriesId: activeSeriesId,
          vidIndex,
        });
        if (!res || !res.success) {
          showToast((res && res.error) || '在线播放准备失败');
          setOnlineVid(null);
          setOnlineProgress(null);
          return;
        }
        setOnlineUrl(res.url);
        setOnlineProgress(null);
        refreshCacheInfo();
      } catch (e) {
        showToast('在线播放失败: ' + e.message);
        setOnlineVid(null);
        setOnlineProgress(null);
      }
    },
    [episodes, activeSeriesId, showToast, refreshCacheInfo]
  );

  // 切集
  const goToEpisode = useCallback(
    (vidIndex, keepPlaying = true) => {
      setCurrentIndex(vidIndex);
      setWaitingFor(null);
      pendingSeekRef.current = 0;
      // 换集时清掉上一集的在线流（下载好的集直接走本地文件）
      const ep = episodes.find((e) => e.vid_index === vidIndex);
      if (!ep || ep.status === 'completed') {
        setOnlineVid(null);
        setOnlineUrl('');
        setOnlineProgress(null);
      }
      const v = videoRef.current;
      if (v && keepPlaying) {
        // 等 src 更新后再播
        setTimeout(() => {
          v.play().catch(() => {});
        }, 80);
      }
    },
    [episodes]
  );

  // 找下一集（按集号顺序）
  const findNext = useCallback(
    (fromIndex) => {
      const idx = episodes.findIndex((e) => e.vid_index === fromIndex);
      if (idx === -1 || idx + 1 >= episodes.length) return null;
      return episodes[idx + 1];
    },
    [episodes]
  );
  const findPrev = useCallback(
    (fromIndex) => {
      const idx = episodes.findIndex((e) => e.vid_index === fromIndex);
      if (idx <= 0) return null;
      return episodes[idx - 1];
    },
    [episodes]
  );

  // 播放结束 -> 连播（未下载的集自动转在线播放，做到「不下载也能连着看」）
  const handleEnded = useCallback(() => {
    const { currentIndex: ci, autoNext: an, activeSeriesId: sid } = stateRef.current;
    const finished = episodes.find((e) => e.vid_index === ci);

    // 看完自动删：先把刚看完这集的本地文件清掉，再决定下一集怎么播
    if (autoDelete && finished && finished.status === 'completed' && sid) {
      window.electronAPI.deleteEpisodeFile(sid, ci).then((r) => {
        if (r && r.success && r.count > 0) {
          showToast(`第 ${ci} 集已看完，自动删除本地文件（释放 ${fmtSize(r.freed)}）`);
          refreshCacheInfo();
          loadDetail(sid);
        }
      });
    }

    if (!an) return;
    const next = findNext(ci);
    if (!next) {
      showToast('已经是最后一集');
      return;
    }
    if (sid) window.electronAPI.savePlaybackPosition(sid, next.vid_index, 0);

    const nextIsLocal = next.status === 'completed' && next.fileUrl && !(autoDelete && finished && finished.status === 'completed');
    if (nextIsLocal) {
      goToEpisode(next.vid_index, true);
    } else if (next.status === 'downloading' || next.status === 'pending') {
      // 正在下载：等它下完自动接上
      setWaitingFor(next.vid_index);
      setCurrentIndex(next.vid_index);
      showToast(`第 ${next.vid_index} 集正在下载，完成后自动播放`);
    } else {
      // 未下载（或被自动删了）-> 直接在线播放
      showToast(`第 ${next.vid_index} 集转在线播放`);
      startOnlinePlay(next.vid_index);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findNext, goToEpisode, showToast, startOnlinePlay, autoDelete, episodes, refreshCacheInfo, loadDetail]);

  // 记住播放进度（每 5 秒 + 切集时）
  const persistPosition = useCallback(() => {
    const v = videoRef.current;
    const { activeSeriesId: sid, currentIndex: ci } = stateRef.current;
    if (!v || !sid) return;
    if (Math.abs(v.currentTime - lastSavedRef.current) < 3) return;
    lastSavedRef.current = v.currentTime;
    window.electronAPI.savePlaybackPosition(sid, ci, v.currentTime);
  }, []);

  useEffect(() => {
    const timer = setInterval(persistPosition, 5000);
    return () => {
      clearInterval(timer);
      persistPosition();
    };
  }, [persistPosition]);

  // 切集 / 恢复断点
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !current || current.status !== 'completed') return;
    const seekTo = pendingSeekRef.current || 0;
    const onLoaded = () => {
      if (seekTo > 0 && seekTo < v.duration - 3) {
        v.currentTime = seekTo;
        showToast(`从 ${Math.floor(seekTo / 60)}:${String(Math.floor(seekTo % 60)).padStart(2, '0')} 继续播放`);
      }
      pendingSeekRef.current = 0;
      v.play().catch(() => {});
    };
    v.addEventListener('loadedmetadata', onLoaded, { once: true });
    return () => v.removeEventListener('loadedmetadata', onLoaded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current && current.fileUrl]);

  // 快捷键
  useEffect(() => {
    const onKey = (e) => {
      const v = videoRef.current;
      if (!v || e.target.tagName === 'INPUT') return;
      const { currentIndex: ci, activeSeriesId: sid, autoNext: an } = stateRef.current;
      if (e.code === 'Space') {
        e.preventDefault();
        v.paused ? v.play().catch(() => {}) : v.pause();
      } else if (e.key === 'ArrowRight') {
        v.currentTime = Math.min(v.duration || 0, v.currentTime + 5);
      } else if (e.key === 'ArrowLeft') {
        v.currentTime = Math.max(0, v.currentTime - 5);
      } else if (e.key === 'ArrowUp') {
        const p = findPrev(ci);
        if (p) {
          if (sid) window.electronAPI.savePlaybackPosition(sid, ci, v.currentTime);
          goToEpisode(p.vid_index, true);
        }
      } else if (e.key === 'ArrowDown') {
        const n = findNext(ci);
        if (n && n.status === 'completed') goToEpisode(n.vid_index, true);
        else if (n) setWaitingFor(n.vid_index);
      } else if (e.key.toLowerCase() === 'a') {
        setAutoNext(!an);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [findNext, findPrev, goToEpisode]);

  const switchSeries = async (sid) => {
    const requestId = selectionRequestGate.current.next();
    persistPosition();
    setActiveSeriesId(sid);
    setDetail(null);
    setWaitingFor(null);
    setOnlineVid(null);
    setOnlineUrl('');
    setOnlineProgress(null);
    const d = await loadDetail(sid);
    if (!selectionRequestGate.current.isCurrent(requestId)) return;
    const saved = await window.electronAPI.getPlaybackPosition(sid);
    if (!selectionRequestGate.current.isCurrent(requestId)) return;
    if (saved && saved.vid_index) setCurrentIndex(saved.vid_index);
    else if (d) {
      const firstPlayable = d.episodes.find((e) => e.status === 'completed');
      setCurrentIndex(firstPlayable ? firstPlayable.vid_index : 1);
    }
    pendingSeekRef.current = saved ? saved.currentTime || 0 : 0;
  };

  // 从列表移除一部短剧（只取消登记，不删本地文件）
  const removeSeries = async (sid, title) => {
    const res = await window.electronAPI.removeSeries(sid);
    if (!res || !res.success) {
      showToast((res && res.error) || '移除失败');
      return;
    }
    showToast(`已从列表移除《${title}》（本地文件保留）`);
    const list = await loadSeriesList();
    refreshCacheInfo();
    if (String(sid) === String(activeSeriesId)) {
      const next = list[0];
      if (next) await switchSeries(next.series_id);
      else {
        setActiveSeriesId('');
        setDetail(null);
      }
    }
  };

  const purgeEmpty = async () => {
    const res = await window.electronAPI.purgeEmptySeries();
    if (res && res.success) {
      showToast(res.count > 0 ? `已清理 ${res.count} 部未下载的剧` : '没有可清理的剧');
      const list = await loadSeriesList();
      refreshCacheInfo();
      if (!list.some((s) => String(s.series_id) === String(activeSeriesId))) {
        if (list[0]) await switchSeries(list[0].series_id);
      }
    }
  };

  const restoreDismissed = async () => {
    const res = await window.electronAPI.restoreDismissedSeries();
    if (res && res.success) {
      showToast(res.count > 0 ? `已恢复 ${res.count} 部被移除的剧` : '没有被移除的剧');
      await loadSeriesList();
      refreshCacheInfo();
    }
  };

  const clearCache = async () => {
    await window.electronAPI.clearOnlineCache();
    refreshCacheInfo();
    showToast('已清空在线播放缓存');
  };

  const downloadEpisode = async (vidIndex) => {
    const res = await window.electronAPI.downloadSingleEpisode(activeSeriesId, vidIndex);
    if (res && res.success) {
      showToast(res.count > 0 ? `第 ${vidIndex} 集已加入下载队列` : `第 ${vidIndex} 集已在队列中`);
      if (currentIndex === vidIndex) setWaitingFor(vidIndex);
    } else {
      showToast((res && res.error) || '加入下载失败');
    }
  };

  const downloadMissing = async () => {
    const missing = episodes.filter((e) => e.status !== 'completed');
    if (!missing.length) {
      showToast('全部已下载');
      return;
    }
    let ok = 0;
    for (const ep of missing) {
      const r = await window.electronAPI.downloadSingleEpisode(activeSeriesId, ep.vid_index);
      if (r && r.success) ok++;
    }
    showToast(`已把 ${ok} 集加入下载队列`);
  };

  // 一键合并当前这部剧（弹出格式选择）
  const mergeThisSeries = async (compatible) => {
    setMerging(true);
    setMergeAsk(false);
    try {
      const res = await window.electronAPI.mergeSeries(activeSeriesId, '', { compatible });
      if (!res || !res.success) {
        showToast((res && res.error) || '合并失败');
        return;
      }
      const tip = compatible
        ? `开始兼容格式合并 ${res.count} 集（H.264，耗时较长）`
        : `开始合并 ${res.count} 集，约 ${(res.totalBytes / 1073741824).toFixed(2)} GB`;
      showToast(`${tip}，可在「下载管理」查看进度`);
      if (res.codecWarning) showToast(res.codecWarning);
    } catch (e) {
      showToast('合并异常: ' + e.message);
    } finally {
      setMerging(false);
    }
  };

  // ===== 渲染 =====
  if (loading) {
    return <div className="player-container"><div className="player-empty">加载中…</div></div>;
  }

  if (!seriesList.length) {
    return (
      <div className="player-container">
        <div className="player-header">
          <div className="player-title"><Play size={22} /><h2>播放</h2></div>
        </div>
        <div className="player-empty">
          <Film size={40} />
          <p>还没有可播放的短剧</p>
          <p className="player-empty-sub">去「浏览」挑一部，点开即可在线播放，无需先下载</p>
          <div className="player-empty-actions">
            {onNavigate && (
              <button className="btn btn-primary" onClick={() => onNavigate('browse')}>
                去浏览剧集
              </button>
            )}
            {onNavigate && (
              <button className="btn btn-outline" onClick={() => onNavigate('download')}>
                去搜索 / 粘贴链接
              </button>
            )}
          </div>
          {dismissedCount > 0 && (
            <button className="btn btn-outline btn-sm" onClick={restoreDismissed}>
              恢复已移除的 {dismissedCount} 部
            </button>
          )}
        </div>
      </div>
    );
  }

  // 可播放：本地已下载走 file://，否则走在线内存流；兼容模式下优先用转码后的文件
  const compatUrl = current ? compatMap[current.vid_index] : null;
  const isOnlinePlaying = onlineVid && current && current.vid === onlineVid && onlineUrl;
  const canPlay = !!(current && (compatUrl || (current.status === 'completed' && current.fileUrl) || isOnlinePlaying));
  const videoSrc = compatUrl || (isOnlinePlaying ? onlineUrl : (current && current.fileUrl) || '');

  return (
    <div className="player-container">
      <div className="player-header">
        <div className="player-title">
          <Play size={22} />
          <h2>播放</h2>
        </div>
        <div className="player-header-right">
          <span className="player-stat">已下载 {playableCount} / {episodes.length || 0} 集</span>
          <button
            className={`btn btn-outline ${autoNext ? 'btn-autonext-on' : ''}`}
            onClick={() => setAutoNext(!autoNext)}
            title="播完自动播放下一集（快捷键 A）"
          >
            <Layers size={15} />
            连播 {autoNext ? '开' : '关'}
          </button>
          <button
            className={`btn btn-outline ${autoCompat ? 'btn-autonext-on' : ''}`}
            onClick={toggleAutoCompat}
            title="本机无法解码 HEVC 时自动转码为 H.264 播放（解决黑屏有声）"
          >
            <Zap size={15} />
            兼容模式 {autoCompat ? '开' : '关'}
          </button>
          <button
            className={`btn btn-outline ${autoDelete ? 'btn-autonext-on' : ''}`}
            onClick={toggleAutoDelete}
            title="看完一集后自动删除该集的本地文件（边看边清，不占磁盘）"
          >
            <Trash2 size={15} />
            看完自动删 {autoDelete ? '开' : '关'}
          </button>
          <button className="btn btn-outline" onClick={downloadMissing}>
            <Download size={15} />
            下载未完成集
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setMergeAsk(true)}
            disabled={merging || playableCount === 0}
            title="把已下载的分集合并成单个 mp4，方便一次性看完"
          >
            <Layers size={15} />
            {merging ? '提交中...' : '合并导出全集'}
          </button>
        </div>
      </div>

      {/* 剧集选择：当前剧 + 下拉管理面板（替代原来会越堆越长的横条） */}
      <div className="player-series-row">
        <div className="player-series-current">
          <span className="player-series-label">正在播放</span>
          <span className="player-series-name" title={detail ? detail.series_title : ''}>
            {detail ? detail.series_title : '—'}
          </span>
        </div>
        <button
          className={`btn btn-outline series-picker-btn ${pickerOpen ? 'open' : ''}`}
          onClick={() => setPickerOpen((v) => !v)}
        >
          切换剧集
          <span className="series-count">{seriesList.length}</span>
          <ChevronDown size={15} />
        </button>
      </div>

      {pickerOpen && (
        <div className="series-picker">
          <div className="series-picker-head">
            <input
              type="text"
              className="input-field"
              placeholder="搜索剧名…"
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
            />
            <button className="icon-btn" title="关闭" onClick={() => setPickerOpen(false)}>
              <X size={16} />
            </button>
          </div>

          <div className="series-picker-list">
            {seriesList.length === 0 && <div className="series-picker-empty">还没有剧集</div>}
            {seriesList
              .filter((s) => !pickerQuery.trim() || (s.series_title || '').includes(pickerQuery.trim()))
              .map((s) => {
                const isActive = String(s.series_id) === String(activeSeriesId);
                const dl = downloadedMap[String(s.series_id)];
                return (
                  <div
                    key={s.series_id}
                    className={`series-row ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      if (!isActive) switchSeries(s.series_id);
                      setPickerOpen(false);
                    }}
                  >
                    <div className="series-row-cover">
                      {s.cover ? <img src={s.cover} alt="" loading="lazy" /> : <Film size={14} />}
                    </div>
                    <div className="series-row-body">
                      <div className="series-row-title">{s.series_title}</div>
                      <div className="series-row-sub">
                        {dl && dl.completed > 0 ? `已下载 ${dl.completed}/${dl.total} 集` : `共 ${(s.episodes || []).length} 集 · 未下载`}
                      </div>
                    </div>
                    {isActive && <span className="series-row-cur">播放中</span>}
                    {(() => {
                      const st = storageMap[String(s.series_id)];
                      const hasFiles = st && st.files > 0;
                      return (
                        <>
                          {hasFiles && (
                            <button
                              className="icon-btn icon-btn-danger series-row-del"
                              title={`删除本地文件（${st.files} 个 · ${fmtSize(st.bytes)}）`}
                              onClick={(e) => {
                                e.stopPropagation();
                                (async () => {
                                  const preview = await window.electronAPI.previewSeriesFiles(s.series_id);
                                  setConfirmAsk({
                                    title: '移入回收站',
                                    message: `《${s.series_title}》共 ${preview?.count || 0} 个文件，合计 ${fmtSize(preview?.bytes || 0)}。\n文件将移入 Windows 回收站，可以在那里恢复。剧集列表会保留。`,
                                    okText: '移入回收站',
                                    danger: true,
                                    onOk: async () => {
                                      const r = await window.electronAPI.deleteSeriesFiles(s.series_id);
                                      if (r && r.success) {
                                        showToast(`${r.count} 个文件已移入回收站`);
                                        await loadDetail(activeSeriesId);
                                        refreshCacheInfo();
                                      } else {
                                        showToast((r && r.error) || '移入回收站失败');
                                      }
                                    },
                                  });
                                })();
                              }}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                          <button
                            className="icon-btn series-row-del"
                            title="从列表移除（不删除本地文件）"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeSeries(s.series_id, s.series_title);
                            }}
                          >
                            <X size={15} />
                          </button>
                        </>
                      );
                    })()}
                  </div>
                );
              })}
          </div>

          <div className="series-picker-foot">
            {storageTotal.files > 0 && (
              <span className="series-picker-usage">
                本地已占用 <b>{fmtSize(storageTotal.bytes)}</b> / {storageTotal.files} 个文件
              </span>
            )}
            <button className="btn btn-outline btn-sm" onClick={purgeEmpty} title="把没有下载过任何一集的剧从列表中移除">
              <Trash2 size={14} />
              清理未下载的剧
            </button>
            {dismissedCount > 0 && (
              <button className="btn btn-outline btn-sm" onClick={restoreDismissed}>
                恢复已移除 ({dismissedCount})
              </button>
            )}
            {storageTotal.files > 0 && (
              <button
                className="btn btn-outline btn-sm btn-danger-text"
                title="删除所有已下载的本地文件"
                onClick={async () => {
                  const preview = await window.electronAPI.previewAllDownloaded();
                  setConfirmAsk({
                    title: '移入回收站',
                    message: `全部剧集共 ${preview?.count || 0} 个文件，合计 ${fmtSize(preview?.bytes || 0)}。\n文件将移入 Windows 回收站，可以在那里恢复。剧集列表与分集信息会保留。`,
                    okText: '全部移入回收站',
                    danger: true,
                    onOk: async () => {
                      const r = await window.electronAPI.deleteAllDownloaded();
                      if (r && r.success) {
                        showToast(`${r.count} 个文件已移入回收站`);
                        await loadDetail(activeSeriesId);
                        refreshCacheInfo();
                      } else {
                        showToast((r && r.error) || '移入回收站失败');
                      }
                    },
                  });
                }}
              >
                删除全部已下载
              </button>
            )}
            <button className="btn btn-outline btn-sm" onClick={clearCache} title="释放在线播放占用的内存">
              <Zap size={14} />
              清空播放缓存{cacheInfo.count > 0 ? ` (${cacheInfo.count})` : ''}
            </button>
            {compatCache.files > 0 && (
              <button className="btn btn-outline btn-sm" onClick={clearCompatCache} title="删除转码产生的兼容格式文件">
                <Trash2 size={14} />
                清空转码缓存 ({fmtSize(compatCache.bytes)})
              </button>
            )}
          </div>
        </div>
      )}

      {/* 播放区 */}
      <div className="player-stage">
        {canPlay ? (
          <video
            ref={videoRef}
            src={videoSrc}
            className="player-video"
            controls
            autoPlay
            onEnded={handleEnded}
            onPause={persistPosition}
            onPlaying={handlePlaying}
          />
        ) : (
          <div className="player-placeholder">
            {onlineProgress && onlineProgress.vid && (!current || current.vid === onlineProgress.vid) ? (
              <>
                <RefreshCw size={30} className="spin" />
                <p>{onlineProgress.phase === 'decrypting' ? '正在解密…' : '正在缓冲在线播放…'}</p>
                <div className="player-wait-bar">
                  <div className="player-wait-fill" style={{ width: `${onlineProgress.percent || 0}%` }} />
                </div>
                <span className="player-placeholder-sub">
                  {(onlineProgress.percent || 0)}%
                  {onlineProgress.total ? ` · ${(onlineProgress.received / 1048576).toFixed(1)} / ${(onlineProgress.total / 1048576).toFixed(1)} MB` : ''}
                  {' · 不写入本地磁盘，仅占用内存'}
                </span>
              </>
            ) : waitingFor != null ? (
              <>
                <RefreshCw size={30} className="spin" />
                <p>第 {waitingFor} 集正在下载，完成后自动播放…</p>
                {(() => {
                  const ep = episodes.find((e) => e.vid_index === waitingFor);
                  return ep && ep.status === 'downloading' ? (
                    <div className="player-wait-bar">
                      <div className="player-wait-fill" style={{ width: `${ep.progress || 0}%` }} />
                    </div>
                  ) : null;
                })()}
                <span className="player-placeholder-sub">也可以直接在线播放这一集</span>
              </>
            ) : current ? (
              <>
                <Film size={34} />
                <p>
                  第 {current.vid_index} 集
                  {current.status === 'downloading' ? '正在下载' : current.status === 'pending' ? '排队中' : '尚未下载'}
                </p>
                {current.status === 'downloading' && (
                  <div className="player-wait-bar">
                    <div className="player-wait-fill" style={{ width: `${current.progress || 0}%` }} />
                  </div>
                )}
                <div className="player-placeholder-actions">
                  <button className="btn btn-primary" onClick={() => startOnlinePlay(current.vid_index)}>
                    <Play size={15} />
                    在线播放（不下载）
                  </button>
                  <button className="btn btn-outline" onClick={() => downloadEpisode(current.vid_index)}>
                    <Download size={15} />
                    下载本集
                  </button>
                </div>
                <span className="player-placeholder-sub">在线播放会临时缓存在内存中，不占用你的下载目录</span>
              </>
            ) : (
              <>
                <Film size={34} />
                <p>请选择一集开始播放</p>
              </>
            )}
          </div>
        )}

        {/* 兼容模式浮层：解码失败提示 / 转码进度 */}
        {compatProgress && compatProgress.vidIndex === currentIndex && (
          <div className="compat-overlay">
            <RefreshCw size={26} className="spin" />
            <p>正在转码为兼容格式（H.264）…</p>
            <div className="player-wait-bar">
              <div className="player-wait-fill" style={{ width: `${compatProgress.percent || 0}%` }} />
            </div>
            <span className="compat-overlay-sub">
              {compatProgress.percent || 0}% · 本机无法解码 HEVC，转码一次后可正常播放与拖动
            </span>
          </div>
        )}

        {!compatProgress && decodeFailed && canPlay && !compatUrl && (
          <div className="compat-overlay">
            <Film size={30} />
            <p>画面无法显示（有声音）</p>
            <span className="compat-overlay-sub">
              本机不支持该视频的编码格式（HEVC）。转码为 H.264 后即可正常播放。
            </span>
            <div className="player-placeholder-actions">
              <button className="btn btn-primary" onClick={() => startCompatPlay(currentIndex)}>
                <Zap size={15} />
                转码后播放
              </button>
              <button className="btn btn-outline" onClick={toggleAutoCompat}>
                {autoCompat ? '关闭自动转码' : '开启自动转码'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 播放中的集信息 */}
      {current && (
        <div className="player-now">
          <span className="player-now-title">
            《{detail ? detail.series_title : ''}》第 {current.vid_index} 集
          </span>
          {current.title && <span className="player-now-sub">{current.title}</span>}
          <span className={`player-now-status status-${current.status}`}>
            {current.status === 'completed' ? '可播放' : current.status === 'downloading' ? `下载中 ${current.progress || 0}%` : current.status === 'pending' ? '排队中' : '未下载'}
          </span>
        </div>
      )}

      {/* 分集列表 */}
      <div className="player-episodes">
        {episodes.map((ep) => {
          const isCurrent = ep.vid_index === currentIndex;
          return (
            <button
              key={ep.vid_index}
              className={`ep-chip ep-${ep.status} ${isCurrent ? 'ep-current' : ''}`}
              onClick={() => {
                if (ep.status === 'completed') goToEpisode(ep.vid_index, true);
                else if (ep.status === 'downloading' || ep.status === 'pending') {
                  setWaitingFor(ep.vid_index);
                  setCurrentIndex(ep.vid_index);
                } else {
                  // 未下载：直接在线播放，不必先下载
                  startOnlinePlay(ep.vid_index);
                }
              }}
              title={
                ep.status === 'completed'
                  ? '点击播放（本地）'
                  : ep.status === 'downloading' || ep.status === 'pending'
                  ? '正在下载，完成后自动播放'
                  : '点击在线播放（不下载）· 双击加入下载'
              }
              onDoubleClick={() => ep.status !== 'completed' && downloadEpisode(ep.vid_index)}
            >
              <span className="ep-num">{ep.vid_index}</span>
              {ep.status === 'completed' && <Check size={11} className="ep-badge" />}
              {ep.status === 'downloading' && (
                <span className="ep-progress" style={{ width: `${ep.progress || 0}%` }} />
              )}
              {onlineVid === ep.vid && <span className="ep-online-dot" />}
            </button>
          );
        })}
      </div>

      <div className="player-tips">
        快捷键：空格 播放/暂停 · ← → 快退/快进 5 秒 · ↑ ↓ 上一集/下一集 · A 切换连播。
        <br />
        <b>灰色分集点一下即可在线播放</b>（不下载、不占下载目录，缓存在内存中）；双击才加入下载队列。
        连播时遇到未下载的集会自动转在线播放。
      </div>

      {toast && <div className="dm-toast dm-toast-success" onClick={() => setToast(null)}>{toast}</div>}

      {/* 合并格式选择 */}
      {mergeAsk && (
        <div className="player-confirm-mask" onClick={() => setMergeAsk(false)}>
          <div className="player-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="player-confirm-title" style={{ color: 'var(--accent)' }}>
              <Layers size={17} />
              合并导出全集
            </div>
            <div className="player-confirm-msg">
              <p>把《{detail ? detail.series_title : ''}》已下载的 {playableCount} 集合并为一个 mp4。</p>
              <p><b>快速合并</b>：原画质直接拼接，秒级完成，但格式仍是 HEVC —— 在部分电脑上可能黑屏有声。</p>
              <p><b>兼容合并</b>：转码为 H.264，任何电脑/播放器都能播，但速度慢（约每分钟视频需数秒）。</p>
            </div>
            <div className="player-confirm-foot">
              <button className="btn btn-outline" onClick={() => setMergeAsk(false)}>取消</button>
              <button className="btn btn-outline" onClick={() => mergeThisSeries(true)} disabled={merging}>
                兼容合并（H.264）
              </button>
              <button className="btn btn-primary" onClick={() => mergeThisSeries(false)} disabled={merging}>
                快速合并
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      {confirmAsk && (        <div className="player-confirm-mask" onClick={() => setConfirmAsk(null)}>
          <div className="player-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="player-confirm-title">
              <Trash2 size={17} />
              {confirmAsk.title}
            </div>
            <div className="player-confirm-msg">
              {String(confirmAsk.message).split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
            <div className="player-confirm-foot">
              <button className="btn btn-outline" onClick={() => setConfirmAsk(null)}>取消</button>
              <button
                className={`btn ${confirmAsk.danger ? 'btn-danger-solid' : 'btn-primary'}`}
                onClick={async () => {
                  const fn = confirmAsk.onOk;
                  setConfirmAsk(null);
                  await fn();
                }}
              >
                {confirmAsk.okText || '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Player;
