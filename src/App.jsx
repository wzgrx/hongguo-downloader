import React, { useState, useEffect, useCallback } from 'react';
import { Film, Download, Settings, Play, Sparkles, AlertCircle } from './components/icons';
import HongguoDownload from './components/HongguoDownload';
import DownloadManager from './components/DownloadManager';
import SettingsPage from './components/Settings';
import Player from './components/Player';
import Browse from './components/Browse';
import Diagnostics from './components/Diagnostics';

const MENU = [
  { id: 'browse', label: '浏览', icon: Sparkles },
  { id: 'download', label: '红果下载', icon: Film },
  { id: 'player', label: '播放', icon: Play },
  { id: 'manager', label: '下载管理', icon: Download },
  { id: 'settings', label: '设置', icon: Settings },
  { id: 'diagnostics', label: '诊断', icon: AlertCircle },
];

export default function App() {
  const [page, setPage] = useState('browse');
  const [appInfo, setAppInfo] = useState(null); // { version, brand, appName }
  const [playerTarget, setPlayerTarget] = useState(null); // 浏览页点播 -> 播放页选中

  const navigateTo = useCallback((nextPage) => {
    if (!MENU.some((item) => item.id === nextPage)) return;
    setPage(nextPage);
  }, []);

  useEffect(() => {
    window.electronAPI.getAppInfo().then((info) => {
      setAppInfo(info);
    });
  }, []);

  // 主进程发来的导航指令（例如浏览页点「立即播放」）
  useEffect(() => {
    if (!window.electronAPI.onNavigate) return undefined;
    return window.electronAPI.onNavigate((data) => {
      if (!data || !data.page) return;
      if (data.payload) setPlayerTarget({ ...data.payload, ts: Date.now() });
      navigateTo(data.page);
    });
  }, [navigateTo]);

  const renderPage = () => {
    switch (page) {
      case 'player':
        return <Player target={playerTarget} onNavigate={navigateTo} />;
      case 'manager':
        return <DownloadManager onNavigate={navigateTo} />;
      case 'settings':
        return <SettingsPage />;
      case 'diagnostics':
        return <Diagnostics />;
      case 'download':
      default:
        return <HongguoDownload onNavigate={navigateTo} />;
    }
  };

  return (
    <div className="app-layout">
      {/* 左侧边栏 */}
      <div className="sidebar">
        <div className="sidebar-brand">
          <div className="logo">
            <Film size={18} />
          </div>
          <div>
            <div className="brand-text">{appInfo ? appInfo.brand : '红果短剧下载器'}</div>
            <div className="brand-sub">红果短剧下载器 v{appInfo ? appInfo.version : ''}</div>
          </div>
        </div>

        <div className="sidebar-menu">
          {MENU.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className={`sidebar-item ${page === item.id ? 'active' : ''}`}
                onClick={() => navigateTo(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </div>
            );
          })}
        </div>

        <div className="sidebar-footer">
          <div className="footer-note">AES-128 CENC 原生解密 · 无水印</div>
        </div>
      </div>

      {/* 右侧主体区域 */}
      <div className="main-wrapper">
        <div className="main-content">
          {/* 浏览页保留挂载状态；切换页面时隐藏，返回时不重新抓取列表或重置筛选条件。 */}
          <div
            className="page-keep-alive"
            style={{ display: page === 'browse' ? undefined : 'none' }}
            aria-hidden={page !== 'browse'}
          >
            <Browse active={page === 'browse'} onNavigate={navigateTo} />
          </div>
          {page !== 'browse' && renderPage()}
        </div>
      </div>
    </div>
  );
}
