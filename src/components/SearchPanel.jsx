import React, { useState, useRef } from 'react';
import './HongguoDownload.css';
import { Search, Film, RefreshCw, ExternalLink } from './icons';
import { createRequestGate } from '../request-gate.mjs';

/**
 * SearchPanel —— 通过内嵌浏览器嗅探 hongguoduanju.com 的搜索结果
 * 拿到 series_id 后交给父组件走既有的「拉全集 + 选集下载」流程。
 */
function SearchPanel({ onSelectSeries, onSwitchToInput }) {
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null); // null=未搜索, []=无结果
  const [error, setError] = useState('');
  const [pageTitle, setPageTitle] = useState('');
  const [pickingId, setPickingId] = useState('');
  const searchRequestGate = useRef(createRequestGate());
  const pickRequestGate = useRef(createRequestGate());

  const doSearch = async () => {
    const kw = keyword.trim();
    if (!kw) {
      setError('请输入剧名关键词');
      return;
    }
    const requestId = searchRequestGate.current.next();
    setLoading(true);
    setError('');
    setResults(null);
    setPageTitle('');
    try {
      const res = await window.electronAPI.searchSeries(kw);
      if (!searchRequestGate.current.isCurrent(requestId)) return;
      if (!res || !res.success) {
        setError((res && res.error) || '搜索失败，请重试');
        setResults([]);
      } else {
        setResults(res.results || []);
        if (!res.results || res.results.length === 0) setPageTitle(res.pageTitle || '');
      }
    } catch (e) {
      if (!searchRequestGate.current.isCurrent(requestId)) return;
      setError('搜索异常: ' + e.message);
      setResults([]);
    } finally {
      if (searchRequestGate.current.isCurrent(requestId)) setLoading(false);
    }
  };

  // 选中某部剧 -> 拉取完整分集 -> 交给下载页
  const pick = async (item) => {
    const requestId = pickRequestGate.current.next();
    setPickingId(item.series_id);
    setError('');
    try {
      const res = await window.electronAPI.searchResolve(item.series_id);
      if (!pickRequestGate.current.isCurrent(requestId)) return;
      if (res && res.success && res.data) {
        onSelectSeries(res.data);
      } else {
        setError((res && res.error) || '拉取分集失败');
      }
    } catch (e) {
      if (!pickRequestGate.current.isCurrent(requestId)) return;
      setError('拉取分集异常: ' + e.message);
    } finally {
      if (pickRequestGate.current.isCurrent(requestId)) setPickingId('');
    }
  };

  const showBrowser = async () => {
    await window.electronAPI.searchWindowShow(true);
    setError('已打开搜索窗口，可手动操作；关闭该窗口后回到本页继续。');
  };

  return (
    <div className="hongguo-card">
      <div className="card-header-title">
        <Search size={18} />
        <span>搜索短剧</span>
      </div>

      <div className="input-group">
        <input
          type="text"
          className="input-field"
          placeholder="输入剧名，例如：一村人养一个神"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()}
        />
        <button className="btn btn-primary" onClick={doSearch} disabled={loading}>
          {loading ? (
            <>
              <RefreshCw size={16} className="spin" />
              <span>搜索中...</span>
            </>
          ) : (
            <>
              <Search size={16} />
              <span>搜索</span>
            </>
          )}
        </button>
      </div>
      <p className="settings-hint" style={{ marginTop: 8 }}>
        搜索词会用内置浏览器打开 hongguoduanju.com 取回结果，选中后可一键拉取全集下载。
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      {loading && (
        <div className="search-loading">
          <RefreshCw size={18} className="spin" />
          <span>正在嗅探搜索结果，首次可能需要几秒…</span>
        </div>
      )}

      {results && results.length === 0 && !loading && (
        <div className="search-empty">
          <p>没有找到相关短剧{pageTitle ? `（页面标题：${pageTitle}）` : ''}</p>
          <div className="search-empty-actions">
            <button className="btn btn-outline" onClick={showBrowser}>
              <ExternalLink size={15} />
              显示浏览器窗口
            </button>
            {onSwitchToInput && (
              <button className="btn btn-outline" onClick={onSwitchToInput}>
                改用链接 / ID 下载
              </button>
            )}
          </div>
        </div>
      )}

      {results && results.length > 0 && (
        <>
          <div className="search-count">找到 {results.length} 部相关短剧</div>
          <div className="search-grid">
            {results.map((item) => (
              <div
                key={item.series_id}
                className={`search-card ${pickingId === item.series_id ? 'picking' : ''}`}
                onClick={() => pickingId === '' && pick(item)}
                title={`点击查看并下载：${item.series_title}`}
              >
                <div className="search-cover">
                  {item.cover ? (
                    <img src={item.cover} alt={item.series_title} loading="lazy" />
                  ) : (
                    <div className="cover-placeholder">
                      <Film size={22} />
                    </div>
                  )}
                </div>
                <div className="search-card-body">
                  <div className="search-card-title">{item.series_title}</div>
                  <div className="search-card-sub">
                    {pickingId === item.series_id ? (
                      <>
                        <RefreshCw size={13} className="spin" /> 正在拉取分集…
                      </>
                    ) : (
                      <>series_id {item.series_id}</>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default SearchPanel;
