import { useEffect, useMemo, useState } from 'react';
import { FALLBACK_SESSION_ID } from '../config/demo';
import { useSessionReport } from '../hooks/useSessionReport';
import { REPORT_GENERATION_STEPS, formatClockLabel, formatDurationLabel } from '../utils/report';

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
      `Session ID：${report.data.session.session_id}`,
      `任务：${report.derived?.overview.taskTitle ?? report.data.task?.title ?? '未命名任务'}`,
      `开始：${formatClockLabel(report.data.session.start_time)}`,
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

    return `为什么生成很快：它不是临时猜出来的，而是直接读取 session ${report.data.session.session_id} 已记录的 ${eventCountLabel}、${report.derived.overview.snapshotCount} 个特征快照和 ${report.derived.overview.stateCount} 个状态点，在本地即时聚合成时间线、转折点和建议。`;
  }, [report.data, report.derived]);

  const conclusionCards = useMemo(() => {
    if (!report.derived) {
      return [];
    }

    return [
      {
        id: 'overall',
        title: '本次 session 总体怎样',
        text: report.derived.overview.overallSummary,
      },
      {
        id: 'blocker',
        title: '中间哪里最卡',
        text: report.derived.overview.blockerSummary,
      },
      {
        id: 'ending',
        title: '最后怎么恢复 / 结束',
        text: report.derived.overview.endingSummary,
      },
    ];
  }, [report.derived]);

  const firstRecommendation = report.derived?.recommendations[0]?.text ?? '先看下面的建议列表。';

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
          <span>基于真实 session 记录生成</span>
          <span>不会只靠 summary 直接下结论</span>
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
          <p>我在读取学习过程记录，并把它整理成能读懂的复盘。</p>
        </section>
      ) : null}

      {report.error ? (
        <section className="panel error-banner">
          复盘加载失败：{report.error}
        </section>
      ) : null}

      {report.data && report.derived ? (
        <main className="report-flow">
          <section className="panel report-conclusion-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">先看结论</p>
                <h2>{report.derived.overview.taskTitle}</h2>
              </div>
              <div className="header-meta">
                {reportMeta.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>

            <p className="section-intro">这部分在看什么：先用 30 秒看懂这次学习整体怎样、卡在哪里、最后怎么结束。</p>

            {report.derived.overview.sampleHint ? (
              <div className="report-note">{report.derived.overview.sampleHint}</div>
            ) : null}

            <div className="report-kpis">
              <div className="report-kpi-card">
                <span className="status-label">总时长</span>
                <strong>{report.derived.overview.durationLabel}</strong>
              </div>
              <div className="report-kpi-card">
                <span className="status-label">主要学习状态</span>
                <strong>{report.derived.overview.dominantStateLabel}</strong>
              </div>
              <div className="report-kpi-card">
                <span className="status-label">关键转折</span>
                <strong>{report.derived.overview.turningPointCount} 个</strong>
              </div>
              <div className="report-kpi-card">
                <span className="status-label">最先该做什么</span>
                <strong>{firstRecommendation}</strong>
              </div>
            </div>

            <div className="report-conclusion-grid">
              {conclusionCards.map((item) => (
                <article key={item.id} className="report-conclusion-card">
                  <span className="status-label">{item.title}</span>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>

            <div className="report-summary-line">
              <span>状态点 {report.derived.overview.stateCount}</span>
              <span>快照 {report.derived.overview.snapshotCount}</span>
              {typeof report.derived.overview.eventCount === 'number' ? (
                <span>事件 {report.derived.overview.eventCount}</span>
              ) : null}
              {report.derived.overview.primaryBlockerReason ? (
                <span>主要信号：{report.derived.overview.primaryBlockerReason}</span>
              ) : (
                <span>主要信号：当前没有明显持续卡点</span>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">复盘如何生成</p>
                <h2>这份结论不是凭空来的</h2>
              </div>
            </div>
            <p className="section-intro">这部分在看什么：说明这份复盘是怎样从真实学习过程里整理出来的。</p>
            <p className="report-process-caption">{reportProcessCaption}</p>

            <div className="report-process-flow" aria-label="复盘生成流程">
              {REPORT_GENERATION_STEPS.map((step) => (
                <article key={step.step} className="report-process-step">
                  <div className="report-process-step-head">
                    <span className="report-process-step-index">{step.step}</span>
                    <strong>{step.title}</strong>
                  </div>
                  <p>{step.description}</p>
                  <span className="report-process-step-hint">{step.dataHint}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">证据</p>
                <h2>按学习阶段读懂这次过程</h2>
              </div>
            </div>
            <p className="section-intro">这部分在看什么：把连续状态改写成“推进、卡住、恢复”的学习阶段，而不是只堆状态名。</p>

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
                        <div className="timeline-title-block">
                          <div className="timeline-tags">
                            <span className="timeline-pill">{node.stageTitle}</span>
                            <span className="timeline-state">{node.primaryStateLabel}</span>
                            {node.isTurningPoint ? <span className="timeline-turning">关键转折</span> : null}
                          </div>
                          <p className="timeline-summary">{node.stageSummary}</p>
                        </div>
                        <span className="timeline-time">{node.timeLabel}</span>
                      </div>
                      <div className="header-meta">
                        <span>持续 {formatDurationLabel(node.durationSec)}</span>
                        <span>状态含义：{node.stateDescription}</span>
                        {node.blockerLabel ? <span>当前卡点：{node.blockerLabel}</span> : null}
                        <span>判断把握 {node.confidenceLabel}</span>
                      </div>
                      {node.evidenceSummary.length > 0 ? (
                        <p className="timeline-reason">看到的信号：{node.evidenceSummary.join('；')}</p>
                      ) : (
                        <p className="timeline-reason">当前证据较少，这段主要根据状态轨迹整理。</p>
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <div className="report-empty-inline">当前 session 的状态样本还不够，暂时无法整理出清晰时间线。</div>
              )}
            </div>
          </section>

          <section className="report-evidence-grid">
            <section className="panel">
              <p className="eyebrow">关键转折</p>
              <h2>哪些地方发生了变化</h2>
              <p className="section-intro">这部分在看什么：挑出最关键的 1-3 个节点，帮助你快速抓住过程拐点。</p>
              <div className="report-list">
                {report.derived.turningPoints.length > 0 ? (
                  report.derived.turningPoints.map((item) => (
                    <article key={item.id} className="report-list-item">
                      <div className="report-list-top">
                        <strong>{item.title}</strong>
                        <span>{item.timeLabel}</span>
                      </div>
                      <p className="report-list-caption">
                        阶段变化：{item.beforeState} → {item.afterState}
                      </p>
                      <p>{item.reason}</p>
                    </article>
                  ))
                ) : (
                  <div className="report-empty-inline">这次过程比较平稳，没有明显的大转折。</div>
                )}
              </div>
            </section>

            <section className="panel">
              <p className="eyebrow">主要卡点</p>
              <h2>中间最影响推进的地方</h2>
              <p className="section-intro">这部分在看什么：只保留最值得讲的卡点，避免把所有状态都当问题。</p>
              <div className="report-list">
                {report.derived.blockers.length > 0 ? (
                  report.derived.blockers.map((item) => (
                    <article key={item.type} className="report-list-item">
                      <div className="report-list-top">
                        <strong>{item.label}</strong>
                        <span>影响 {severityLabel(item.severity)}</span>
                      </div>
                      <p className="report-list-caption">{item.description}</p>
                      <p>
                        累计 {item.durationLabel}，出现 {item.occurrences} 次。
                      </p>
                      <p>
                        {item.evidenceSummary.length > 0
                          ? `看到的信号：${item.evidenceSummary.join('；')}`
                          : '当前样本较少，卡点主要来自快照趋势判断。'}
                      </p>
                    </article>
                  ))
                ) : (
                  <div className="report-empty-inline">这次没有出现持续的明显卡点，整体更多是在推进或短暂探索。</div>
                )}
              </div>
            </section>
          </section>

          <section className="panel">
            <p className="eyebrow">建议</p>
            <h2>接下来最值得做什么</h2>
            <p className="section-intro">这部分在看什么：只给 2-3 条最直接、最短、可以马上执行的下一步。</p>
            <div className="recommendation-list">
              {report.derived.recommendations.length > 0 ? (
                report.derived.recommendations.map((item) => (
                  <article key={item.id} className="recommendation-item">
                    <strong>{item.text}</strong>
                    <p>{item.reason}</p>
                  </article>
                ))
              ) : (
                <div className="report-empty-inline">当前样本较少，建议先补一轮真实操作，再回来查看复盘。</div>
              )}
            </div>
          </section>
        </main>
      ) : null}
    </div>
  );
}
