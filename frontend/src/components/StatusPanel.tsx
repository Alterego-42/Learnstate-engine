import type { StatusHistoryItem, StatusPanelViewModel } from '../utils/state';

interface SyncState {
  tone: 'ok' | 'pending' | 'warn';
  label: string;
  detail: string;
}

interface StatusPanelProps {
  viewModel: StatusPanelViewModel;
  history: StatusHistoryItem[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  historyError: string | null;
  syncState: SyncState;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString();
}

export function StatusPanel({
  viewModel,
  history,
  loading,
  refreshing,
  error,
  historyError,
  syncState,
}: StatusPanelProps) {
  return (
    <aside className="panel status-panel">
      <div className="status-sync">
        <span className={`decision-pill ${syncState.tone === 'warn' ? 'warn' : syncState.tone === 'pending' ? 'pending' : 'ok'}`}>
          {syncState.label}
        </span>
        <span className="status-sync-detail">{syncState.detail}</span>
      </div>

      <div className="status-top">
        <p className="eyebrow">当前状态</p>
        <h2>{viewModel.shouldAdjust ? '建议调整' : '继续推进'}</h2>
        <span className={`decision-pill ${viewModel.shouldAdjust ? 'warn' : 'ok'}`}>
          {viewModel.shouldAdjust ? '现在值得停一下看策略' : '当前节奏可继续'}
        </span>
      </div>

      <div className="status-grid">
        <div className="status-item">
          <span className="status-label">主状态</span>
          <strong>{viewModel.primary?.label ?? '暂无'}</strong>
        </div>
        <div className="status-item">
          <span className="status-label">次状态</span>
          <strong>{viewModel.secondary?.label ?? '暂无'}</strong>
        </div>
        <div className="status-item">
          <span className="status-label">confidence</span>
          <strong>{viewModel.confidence === null ? '-' : viewModel.confidence.toFixed(2)}</strong>
        </div>
        <div className="status-item">
          <span className="status-label">trigger_ready</span>
          <strong>{viewModel.triggerReady ? '是' : '否'}</strong>
        </div>
      </div>

      <div className="status-summary">
        <span className="status-label">evidence_summary.short_text</span>
        <p>{viewModel.evidenceSummary}</p>
        {viewModel.emptyReason ? <p className="status-empty">{viewModel.emptyReason}</p> : null}
      </div>

      <div className="status-history">
        <span className="status-label">最近状态变化</span>
        {history.length === 0 ? (
          <div className="status-history-empty">还没有可展示的状态变化。</div>
        ) : (
          <div className="status-history-list">
            {history.map((item) => (
              <div key={item.id} className="status-history-item">
                <div>
                  <strong>{item.label}</strong>
                  <span className="status-history-time">{formatTime(item.generatedAt)}</span>
                </div>
                <span>{item.confidence === null ? '-' : item.confidence.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="status-footnote">
        {loading ? '状态首屏加载中...' : null}
        {!loading && refreshing ? '状态轮询刷新中...' : null}
        {!loading && !error && viewModel.generatedAt ? `最近状态更新时间 ${formatTime(viewModel.generatedAt)}` : null}
        {error ? `状态获取失败：${error}` : null}
        {!error && historyError ? `状态历史获取失败：${historyError}` : null}
      </div>
    </aside>
  );
}
