import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './Browse.css';
import { Film, RefreshCw, ExternalLink, Download, Play, Check, X, Sparkles } from './icons';

/**
 * Browse —— 分类淘剧
 *
 * 数据链路：
 *   内嵌浏览器嗅探分类页 -> 卡片(series_id/剧名/封面/集数/标签)
 *   点卡片 -> 复用 search-resolve 拉全集并写入短剧档案
 *         -> 复用 get-series-episodes 拿到每集「已下载/下载中/未下载」状态
 *         -> 跳播放器 或 走既有批量下载
 */
function Browse({ onNavigate }) {
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState('real-drama');
  const [genre, setGenre] = useState('');
  const [page, setPage] = useState(1);

  const [results, setResults] = useState([]);
  const [meta, setMeta] = useState({ total: 0, totalPages: 0, genres: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pageTitle, setPageTitle] = useState('');

  // 详情抽屉
  const [detail, setDetail] = useState(null); // { series_id, series_title, cover, episodes: [...] }
  const [detailLoading, setDetailLoading] = useState(false);
  const [rangeInput, setRangeInput] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(new Set());
  const [submitting, setSubmitting] = useState(false);

  // 已下载统计（按 series_id -> 已下载集数）
  const [downloadedMap, setDownloadedMap] = useState({});
  const [toast, setToast] = useState(null);

  const showToast = useCallback((text, type = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadDownloadedMap = useCallback(async () => {
    try {
      const list = (await window.electronAPI.getSeriesList()) || [];
      const map = {};
      for (const s of list) {
        const res = await window.electronAPI.getSeriesEpisodes(s.series_id);
        if (res && res.success) {
          map[String(s.series_id)] = {
            completed: res.data.completedCount,
            total: res.data.total,
          };
        }
      }
      setDownloadedMap(map);
    } catch (_) {}
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const list = await window.electronAPI.browseCategories();
      if (Array.isArray(list) && list.length) {
        setCategories(list);
      }
    } catch (_) {}
  }, []);

  const loadList = useCallback(
    async (cat, gen, pg) => {
      setLoading(true);
      setError('');
      try {
        const res = await window.electronAPI.browseList({ category: cat, genre: gen, page: pg });
        if (!res || !res.success) {
          setError((res && res.error) || '加载失败，请重试');
          setResults([]);
        } else {
          setResults(res.results || []);
          setMeta({ total: res.total || 0, totalPages: res.totalPages || 0, genres: res.genres || [] });
          setPageTitle(res.pageTitle || '');
          if (!res.results || res.results.length === 0) {
            setError('这一页没有取到内容，可试试换分类或「显示浏览器窗口」手动操作');
          }
        }
      } catch (e) {
        setError('加载异常: ' + e.message);
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadCategories();
    loadDownloadedMap();
  }, [loadCategories, loadDownloadedMap]);

  useEffect(() => {
    loadList(category, genre, page);
  }, [category, genre, page, loadList]);

  const switchCategory = (slug) => {
    if (slug === category) return;
    setCategory(slug);
    setGenre('');
    setPage(1);
    setResults([]);
  };

  const switchGenre = (slug) => {
    if (slug === genre) return;
    setGenre(slug);
    setPage(1);
    setResults([]);
  };

  const gotoPage = (p) => {
    const max = meta.totalPages || 1;
    const next = Math.min(Math.max(1, p), max);
    if (next === page) return;
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ===== 打开某部剧 =====
  const openSeries = async (item) => {
    setDetailLoading(true);
    setDetail(null);
    setSelectedIdx(new Set());
    setRangeInput('');
    try {
      const res = await window.electronAPI.searchResolve(item.series_id);
      if (!res || !res.success) {
        showToast((res && res.error) || '拉取分集失败', 'error');
        return;
      }
      const data = res.data;
      // 合并下载状态
      const epRes = await window.electronAPI.getSeriesEpisodes(item.series_id);
      const statusMap = {};
      if (epRes && epRes.success) {
        for (const e of epRes.data.episodes) statusMap[e.vid_index] = e;
      }
      const episodes = data.episodes.map((ep) => ({
        ...ep,
        status: statusMap[ep.vid_index] ? statusMap[ep.vid_index].status : 'missing',
        progress: statusMap[ep.vid_index] ? statusMap[ep.vid_index].progress : 0,
        fileUrl: statusMap[ep.vid_index] ? statusMap[ep.vid_index].fileUrl : null,
      }));
      setDetail({ ...data, episodes, completedCount: episodes.filter((e) => e.status === 'completed').length });
      // 默认全选未下载的
      setSelectedIdx(new Set(episodes.filter((e) => e.status !== 'completed').map((e) => e.vid_index)));
    } catch (e) {
      showToast('打开失败: ' + e.message, 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleIdx = (idx) => {
    const next = new Set(selectedIdx);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setSelectedIdx(next);
  };

  // 区间快选：1-50 / 前10 / 后30 / 全选 / 清空
  const applyRange = (expr) => {
    if (!detail) return;
    const total = detail.episodes.length;
    const nums = new Set();
    const push = (n) => {
      if (n >= 1 && n <= total) nums.add(n);
    };
    const parse = (s) => {
      const text = String(s || '').trim();
      if (!text) return;
      for (const part of text.split(/[,，]/)) {
        const p = part.trim();
        if (!p) continue;
        const m = p.match(/^(\d+)\s*[-~]\s*(\d+)$/);
        if (m) {
          const a = parseInt(m[1], 10);
          const b = parseInt(m[2], 10);
          for (let i = Math.min(a, b); i <= Math.max(a, b); i++) push(i);
        } else if (/^\d+$/.test(p)) {
          push(parseInt(p, 10));
        }
      }
    };
    parse(expr);
    setSelectedIdx(nums);
  };

  const downloadSelected = async () => {
    if (!detail || selectedIdx.size === 0) return;
    setSubmitting(true);
    try {
      const eps = detail.episodes.filter((e) => selectedIdx.has(e.vid_index));
      const res = await window.electronAPI.hongguoDownloadBatch({
        seriesId: detail.series_id,
        seriesTitle: detail.series_title,
        episodes: eps,
      });
      if (res && res.success) {
        showToast(`已加入下载队列：${res.count} 集`);
        setDetail(null);
        if (onNavigate) onNavigate('manager');
      } else {
        showToast((res && res.error) || '提交下载失败', 'error');
      }
    } catch (e) {
      showToast('提交异常: ' + e.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // 立即播放：优先从第一集已下载的开始
  const playNow = async () => {
    if (!detail) return;
    const first = detail.episodes.find((e) => e.status === 'completed');
    if (!first) {
      showToast('这一集还没下载，先点「下载选中」再播放', 'error');
      return;
    }
    await window.electronAPI.playSeries({ seriesId: detail.series_id, vidIndex: first.vid_index });
    setDetail(null);
  };

  const showBrowser = async () => {
    await window.electronAPI.searchWindowShow(true);
    showToast('已打开浏览器窗口，可手动操作；关闭后回到本页继续');
  };

  const totalPages = meta.totalPages || 0;
  const pageNumbers = useMemo(() => {
    if (!totalPages) return [];
    const out = [];
    const cur = page;
    const push = (n) => {
      if (n >= 1 && n <= totalPages && !out.includes(n)) out.push(n);
    };
    out.push(1);
    for (let i = cur - 1; i <= cur + 1; i++) push(i);
    out.push(totalPages);
    return out.sort((a, b) => a - b);
  }, [totalPages, page]);

  return (
    <div className="browse-container">
      <div className="browse-header">
        <div className="browse-title">
          <Sparkles size={22} />
          <h2>浏览</h2>
        </div>
        <div className="browse-header-right">
          {meta.total > 0 && <span className="browse-stat">共 {meta.total} 部</span>}
          <button className="btn btn-outline" onClick={showBrowser}>
            <ExternalLink size={15} />
            显示浏览器窗口
          </button>
        </div>
      </div>

      {/* 分类 tab */}
      <div className="browse-cats">
        {(categories.length ? categories : [{ slug: 'real-drama', label: '真人剧' }]).map((c) => (
          <button
            key={c.slug}
            className={`browse-cat ${category === c.slug ? 'active' : ''}`}
            onClick={() => switchCategory(c.slug)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* 题材 chips */}
      {meta.genres.length > 0 && (
        <div className="browse-genres">
          <button
            className={`genre-chip ${genre === '' ? 'active' : ''}`}
            onClick={() => switchGenre('')}
          >
            全部
          </button>
          {meta.genres.map((g) => (
            <button
              key={g.slug}
              className={`genre-chip ${genre === g.slug ? 'active' : ''}`}
              onClick={() => switchGenre(g.slug)}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="browse-loading">
          <RefreshCw size={18} className="spin" />
          <span>正在加载分类内容…</span>
        </div>
      ) : (
        <div className="browse-grid">
          {results.map((item) => {
            const dl = downloadedMap[String(item.series_id)];
            return (
              <div
                key={item.series_id}
                className="browse-card"
                onClick={() => openSeries(item)}
                title={item.series_title}
              >
                <div className="browse-cover">
                  {item.cover ? (
                    <img src={item.cover} alt={item.series_title} loading="lazy" />
                  ) : (
                    <div className="cover-placeholder"><Film size={22} /></div>
                  )}
                  {item.episode_count > 0 && (
                    <span className="browse-ep-badge">全{item.episode_count}集</span>
                  )}
                  {dl && dl.completed > 0 && (
                    <span className="browse-dl-badge">
                      <Check size={11} /> {dl.completed}/{dl.total}
                    </span>
                  )}
                  <div className="browse-hover">
                    <span className="browse-hover-play">
                      <Play size={16} /> {dl && dl.completed > 0 ? '播放' : '查看'}
                    </span>
                  </div>
                </div>
                <div className="browse-card-title">{item.series_title}</div>
                {item.tags && item.tags.length > 0 && (
                  <div className="browse-card-tags">
                    {item.tags.map((t) => (
                      <span key={t} className="browse-tag">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="browse-pager">
          <button className="pager-item" disabled={page <= 1} onClick={() => gotoPage(page - 1)}>‹</button>
          {pageNumbers.map((n, i) => (
            <React.Fragment key={n}>
              {i > 0 && n - pageNumbers[i - 1] > 1 && <span className="pager-gap">…</span>}
              <button
                className={`pager-item ${n === page ? 'active' : ''}`}
                onClick={() => gotoPage(n)}
              >
                {n}
              </button>
            </React.Fragment>
          ))}
          <button className="pager-item" disabled={page >= totalPages} onClick={() => gotoPage(page + 1)}>›</button>
        </div>
      )}

      {/* ===== 剧集详情抽屉 ===== */}
      {(detail || detailLoading) && (
        <div className="browse-drawer-mask" onClick={() => !detailLoading && setDetail(null)}>
          <div className="browse-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="browse-drawer-head">
              <div className="browse-drawer-title">
                <Film size={18} />
                <span>{detail ? `《${detail.series_title}》` : '加载中…'}</span>
              </div>
              <button className="icon-btn" onClick={() => setDetail(null)} title="关闭">
                <X size={16} />
              </button>
            </div>

            {detailLoading && (
              <div className="browse-loading">
                <RefreshCw size={18} className="spin" />
                <span>正在拉取全集…</span>
              </div>
            )}

            {detail && (
              <>
                <div className="browse-drawer-body">
                  <div className="browse-drawer-info">
                    {detail.cover && <img src={detail.cover} alt="" className="browse-drawer-cover" />}
                    <div className="browse-drawer-meta">
                      <div className="browse-drawer-count">
                        共 {detail.total} 集 · 已下载 <b>{detail.completedCount}</b> 集
                      </div>
                      <div className="browse-drawer-sub">选中 {selectedIdx.size} 集待下载</div>
                      <div className="browse-range-row">
                        <input
                          type="text"
                          className="input-field"
                          placeholder="区间，如 1-50 或 1,3,5"
                          value={rangeInput}
                          onChange={(e) => setRangeInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && applyRange(rangeInput)}
                        />
                        <button className="btn btn-outline btn-sm" onClick={() => applyRange(rangeInput)}>应用</button>
                      </div>
                      <div className="preset-row mt8">
                        <button className="btn-chip" onClick={() => applyRange(`1-${Math.min(10, detail.total)}`)}>前10集</button>
                        <button className="btn-chip" onClick={() => applyRange(`1-${Math.min(30, detail.total)}`)}>前30集</button>
                        <button className="btn-chip" onClick={() => applyRange(`${Math.max(1, detail.total - 29)}-${detail.total}`)}>后30集</button>
                        <button className="btn-chip" onClick={() => setSelectedIdx(new Set(detail.episodes.map((e) => e.vid_index)))}>全选</button>
                        <button className="btn-chip" onClick={() => setSelectedIdx(new Set())}>清空</button>
                      </div>
                    </div>
                  </div>

                  <div className="browse-eps">
                    {detail.episodes.map((ep) => (
                      <button
                        key={ep.vid_index}
                        className={`ep-chip ep-${ep.status} ${selectedIdx.has(ep.vid_index) ? 'ep-picked' : ''}`}
                        onClick={() => toggleIdx(ep.vid_index)}
                        title={ep.title || `第 ${ep.vid_index} 集`}
                      >
                        <span className="ep-num">{ep.vid_index}</span>
                        {ep.status === 'completed' && <Check size={11} className="ep-badge" />}
                        {selectedIdx.has(ep.vid_index) && <span className="ep-pick-dot" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="browse-drawer-foot">
                  <button className="btn btn-outline" onClick={playNow}>
                    <Play size={15} />
                    立即播放
                  </button>
                  <div className="browse-foot-right">
                    <button
                      className="btn btn-primary"
                      disabled={submitting || selectedIdx.size === 0}
                      onClick={downloadSelected}
                    >
                      <Download size={15} />
                      下载选中 ({selectedIdx.size})
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className={`dm-toast dm-toast-${toast.type}`} onClick={() => setToast(null)}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

export default Browse;
