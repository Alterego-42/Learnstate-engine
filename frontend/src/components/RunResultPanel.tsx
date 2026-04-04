import type { OutputEntry, ReporterStatus } from '../types';

interface RunResultPanelProps {
  output: OutputEntry[];
  reporterStatus: ReporterStatus;
}

export function RunResultPanel({ output, reporterStatus }: RunResultPanelProps) {
  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">运行结果区</p>
          <h2>事件 / 反馈</h2>
        </div>
        <div className="reporter-meta">
          <span>待上报 {reporterStatus.pendingCount}</span>
          <span>最近入库 {reporterStatus.lastIngestedCount}</span>
          <span>{reporterStatus.isFlushing ? '上报中' : '空闲'}</span>
        </div>
      </div>

      <div className="run-output">
        {output.map((entry) => (
          <div key={entry.id} className={`output-line output-${entry.tone}`}>
            <span className="output-time">{entry.time}</span>
            <span>{entry.text}</span>
          </div>
        ))}
        {reporterStatus.lastError ? (
          <div className="output-line output-warn">
            <span className="output-time">ERR</span>
            <span>{reporterStatus.lastError}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
