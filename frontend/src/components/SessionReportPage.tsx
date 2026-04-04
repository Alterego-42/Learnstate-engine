import { useEffect, useMemo, useState } from 'react';
import { FALLBACK_SESSION_ID } from '../config/demo';
import { useSessionReport } from '../hooks/useSessionReport';
import { REPORT_GENERATION_STEPS, formatClockLabel } from '../utils/report';

interface SessionReportPageProps {
  sessionId: string;
  onSessionIdChange: (sessionId: string) => void;
  onBack: () => void;
}

function severityLabel(level: 'low' | 'medium' | 'high'): string {
  if (level === 'high') {
    return '高';
  }
  if (level === 'medium') {
    return '中';
  }
  return '低';
}

export function SessionReportPage({ sessionId, onSessionIdChange, onBack }: SessionReportPageProps) {
  const [draftSessionId, setDraftSessionId] = useState(sessionId);
  const report = useSessionReport(sessionId);

  useEffect(() => {
    setDraftSessionId(sessionId);
  }, [sessionId]);

  const reportMeta = useMemo(() => {
    if (!report.data) {
      return [];
    }

    return [
      `session_id: ${report.data.session.session_id}`,
      `task: ${report.derived?.overview.taskTitle ?? report.data.task?.title ?? '未命名任务'}`,
      `开始时间: ${formatClockLabel(report.data.session.start_time)}`,
    ];
  }, [report.data, report.derived]);

  const reportProcessCaption = useMemo(() => {
    if (!report.data || !report.derived) {
      return '这份复盘会直接读取本地已记录的 session 数据、特征快照和状态结果，再即时聚合成结论。';
    }

    const eventCountLabel =
      typeof report.derived.overview.eventCount === 'number'
        ? `${report.derived.overview.eventCount} 条行为事件`
        : '本地行为事件';

    return `为什么生成很快：这份复盘不是现编现猜，而是直接读取 session ${report.data.session.session_id} 已记录的 ${eventCountLabel}、${report.derived.overview.snapshotCount} 个特征快照和 ${report.derived.overview.stateCount} 个状态点，在本地即时聚合成时间线、转折点和建议。`;
  }, [report.data, report.derived]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">单次 Session 复盘 MVP</p>
          <h1>{report.derived?.overview.title ?? '复盘页'}</h1>
        </div>
        <div className="header-meta">
          <button type="button" className="ghost-button" onClick={onBack}>
            返回执行页
          </button>
        </div>
      </header>

      <section className="panel report-toolbar">
        <form
          className="report-query"
          onSubmit={(event) => {
            event.preventDefault();
            onSessionIdChange(draftSessionId.trim());
          }}
        >
          <label className="report-query-label">
            <span>Session ID</span>
            <input
              className="report-input"
              value={draftSessionId}
              onChange={(event) => setDraftSessionId(event.target.value)}
              placeholder="输入真实 session_id"
            />
          </label>
          <button type="submit" className="primary-button">
            生成复盘
          </button>
          <button type="button" className="ghost-button" onClick={() => onSessionIdChange(FALLBACK_SESSION_ID)}>
            使用预置 fallback
          </button>
          <button type="button" className="ghost-button" onClick={() => void report.refresh()}>
            刷新
          </button>
        </form>
        <div className="header-meta">
          <span>数据源只读 `/api/session/{'{id}'}/report`</span>
          <span>`summary` 仅作补充</span>
        </div>
      </section>

      {!sessionId ? (
        <section className="panel report-empty">
          <h2>先给一个 session_id</h2>
          <p>可从执行页右上角“打开复盘页”进入，也可手动粘贴真实 session_id。</p>
        </section>
      ) : null}

      {report.loading ? (
        <section className="panel report-empty">
          <h2>正在生成复盘</h2>
          <p>我在读取状态历史和快照摘要。</p>
        </section>
      ) : null}

      {report.error ? (
        <section className="panel error-banner">
          复盘加载失败：{report.error}
        </section>
      ) : null}

      {report.data && report.derived ? (
        <main className="report-layout">
          <section className="report-main">
            <section className="panel report-process-panel">
              <div className="section-header">
                <div>
                  <p className="eyebrow">复盘如何生成</p>
                  <h2>它来自这次学习过程，不是瞬间拍脑袋</h2>
                </div>
              </div>

              <p className="report-process-caption">{reportProcessCaption}</p>

              <div className="report-process-flow" aria-label="复盘生成流程">
                {REPORT_GENERATION_STEPS.map((processStep) => (
                  <article key={processStep.step} className="report-process-step">
                    <div className="report-process-step-head">
                      <span className="report-process-step-index">{processStep.step}</span>
                      <strong>{processStep.title}</strong>
                    </div>
                    <p>{processStep.description}</p>
                    <span className="report-process-step-hint">{processStep.dataHint}</span>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="section-header">
                <div>
                  <p className="eyebrow">Session 概要</p>
                  <h2>{report.derived.overview.taskTitle}</h2>
                </div>
                <div className="header-meta">
                  {reportMeta.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>

              <div className="report-kpis">
                <div className="report-kpi-card">
                  <span className="status-label">时长</span>
                  <strong>{report.derived.overview.durationLabel}</strong>
                </div>
                <div className="report-kpi-card">
                  <span className="status-label">主状态</span>
                  <strong>{report.derived.overview.dominantStateLabel}</strong>
                </div>
                <div className="report-kpi-card">
                  <span className="status-label">转折点</span>
                  <strong>{report.derived.overview.turningPointCount} 个</strong>
                </div>
                <div className="report-kpi-card">
                  <span className="status-label">主要阻滞</span>
                  <strong>{report.derived.overview.primaryBlockerLabel ?? '未明显出现'}</strong>
                </div>
              </div>

              <div className="report-summary-line">
                <span>状态点 {report.derived.overview.stateCount}</span>
                <span>快照 {report.derived.overview.snapshotCount}</span>
                {typeof report.derived.overview.eventCount === 'number' ? (
                  <span>事件 {report.derived.overview.eventCount}</span>
                ) : null}
                {report.derived.overview.primaryBlockerReason ? (
                  <span>提示：{report.derived.overview.primaryBlockerReason}</span>
                ) : null}
              </div>
            </section>

            <section className="panel">
              <div className="section-header">
                <div>
                  <p className="eyebrow">状态时间轴</p>
                  <h2>按状态段讲清本次 session</h2>
                </div>
              </div>

              <div className="timeline-list">
                {report.derived.timeline.length > 0 ? (
                  report.derived.timeline.map((node) => (
                    <article
                      key={node.nodeId}
                      className={`timeline-item timeline-${node.stateGroup === '阻滞' || node.stateGroup === '混乱' ? 'warn' : 'ok'}`}
                    >
                      <div className="timeline-line" />
                      <div className="timeline-content">
                        <div className="timeline-topline">
                          <div className="timeline-tags">
                            <span className="timeline-pill">{node.stateGroup}</span>
                            <span className="timeline-state">{node.primaryStateLabel}</span>
                            {node.isTurningPoint ? <span className="timeline-turning">转折点</span> : null}
                          </div>
                          <span className="timeline-time">{node.timeLabel}</span>
                        </div>
                        <div className="header-meta">
                          <span>持续 {node.durationSec > 0 ? `${node.durationSec} 秒` : '短暂片段'}</span>
                          <span>置信度 {node.confidenceLabel}</span>
                          {node.blockerLabel ? <span>阻滞：{node.blockerLabel}</span> : null}
                        </div>
                        {node.evidenceSummary.length > 0 ? (
                          <p className="timeline-reason">{node.evidenceSummary.join('；')}</p>
                        ) : (
                          <p className="timeline-reason">该段主要由状态历史判定。</p>
                        )}
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="report-empty-inline">当前 session 还没有可展示的状态时间轴。</div>
                )}
              </div>
            </section>
          </section>

          <aside className="report-side">
            <section className="panel">
              <p className="eyebrow">关键转折点</p>
              <h2>只保留 1-3 个</h2>
              <div className="report-list">
                {report.derived.turningPoints.map((item) => (
                  <article key={item.id} className="report-list-item">
                    <div className="report-list-top">
                      <strong>{item.title}</strong>
                      <span>{item.timeLabel}</span>
                    </div>
                    <p>{item.reason}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel">
              <p className="eyebrow">主要阻滞来源</p>
              <h2>本次最值得讲的一处</h2>
              <div className="report-list">
                {report.derived.blockers.length > 0 ? (
                  report.derived.blockers.map((item) => (
                    <article key={item.type} className="report-list-item">
                      <div className="report-list-top">
                        <strong>{item.label}</strong>
                        <span>强度 {severityLabel(item.severity)}</span>
                      </div>
                      <p>
                        持续 {item.durationLabel}，出现 {item.occurrences} 次。
                      </p>
                      {item.evidenceSummary.length > 0 ? <p>{item.evidenceSummary.join('；')}</p> : null}
                    </article>
                  ))
                ) : (
                  <div className="report-empty-inline">当前没有识别出明显阻滞。</div>
                )}
              </div>
            </section>

            <section className="panel">
              <p className="eyebrow">建议</p>
              <h2>控制在 2-3 条</h2>
              <div className="recommendation-list">
                {report.derived.recommendations.map((item) => (
                  <article key={item.id} className="recommendation-item">
                    <strong>{item.text}</strong>
                    <p>{item.reason}</p>
                  </article>
                ))}
              </div>
            </section>
          </aside>
        </main>
      ) : null}
    </div>
  );
}
