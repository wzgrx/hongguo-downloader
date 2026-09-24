import React, { useCallback, useEffect, useState } from 'react';
import './Diagnostics.css';
import { AlertCircle, Check, Download, RefreshCw } from './icons';

export default function Diagnostics() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const run = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await window.electronAPI.getDiagnostics();
      setReport(result);
    } catch (e) {
      setError(e.message || '诊断失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { run(); }, [run]);

  const exportReport = async () => {
    setExporting(true);
    setNotice('');
    try {
      const result = await window.electronAPI.exportDiagnostics();
      if (result && result.success) setNotice(`诊断报告已保存：${result.path}`);
      else if (!result?.canceled) setError(result?.error || '导出失败');
    } catch (e) {
      setError(e.message || '导出失败');
    } finally {
      setExporting(false);
    }
  };

  const checks = report?.checks || [];
  const passed = checks.filter((check) => check.ok).length;

  return (
    <div className="diagnostics-container">
      <header className="diagnostics-header">
        <div>
          <h2><AlertCircle size={21} /> 系统诊断</h2>
          <p>检查下载环境、目录权限、磁盘空间和网络代理。</p>
        </div>
        <div className="diagnostics-actions">
          <button className="btn btn-outline" onClick={run} disabled={loading}>
            <RefreshCw size={15} />{loading ? '检查中…' : '重新检查'}
          </button>
          <button className="btn btn-primary" onClick={exportReport} disabled={exporting}>
            <Download size={15} />{exporting ? '导出中…' : '导出诊断报告'}
          </button>
        </div>
      </header>

      {report && (
        <div className="diagnostics-summary">
          {passed === checks.length ? '所有检查通过' : `${checks.length - passed} 项需要处理`}
          <span>应用 {report.appVersion} · Electron {report.electronVersion} · Node {report.nodeVersion}</span>
          <span>检查时间：{new Date(report.checkedAt).toLocaleString()}</span>
        </div>
      )}

      {error && <div className="diagnostics-notice diagnostics-error">{error}</div>}
      {notice && <div className="diagnostics-notice">{notice}</div>}

      <div className="diagnostics-list">
        {checks.map((check) => (
          <article className="diagnostics-row" key={check.id}>
            <div className={`diagnostics-status ${check.ok ? 'is-ok' : 'is-error'}`}>
              {check.ok ? <Check size={17} /> : <AlertCircle size={17} />}
            </div>
            <div className="diagnostics-copy">
              <strong>{check.label}</strong>
              <span>{check.message}</span>
              {check.path && <code title={check.path}>{check.path}</code>}
            </div>
          </article>
        ))}
        {!report && !loading && !error && <div className="diagnostics-empty">尚无诊断结果</div>}
      </div>
      <p className="diagnostics-footnote">导出前会自动清除日志中的代理凭据、密码、令牌和 Cookie。</p>
    </div>
  );
}
