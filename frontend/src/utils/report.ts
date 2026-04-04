import type {
  SessionReportResponse,
  SnapshotResponse,
  StateVectorResponse,
  TopStateResponse,
} from '../types';

type ReportStateGroup = '推进' | '探索' | '阻滞' | '混乱' | '注意力' | '未知';
type TurningPointType = 'downturn' | 'recovery' | 'strategy_shift';
type BlockerType =
  | 'looping_backtrack'
  | 'structural_stuck'
  | 'minor_stuck'
  | 'attention_drop'
  | 'long_idle'
  | 'chaotic_trial';

interface StateMeta {
  label: string;
  group: ReportStateGroup;
}

interface NormalizedStatePoint {
  id: string;
  startTime: string;
  endTime: string;
  startMs: number;
  endMs: number;
  primaryStateKey: string;
  primaryStateLabel: string;
  secondaryStateKey: string | null;
  stateGroup: ReportStateGroup;
  confidence: number;
  evidenceSummary: string[];
  snapshotId: string | null;
  blockerType: BlockerType | null;
  snapshot: SnapshotResponse | null;
}

export interface DerivedTimelineNode {
  nodeId: string;
  startTime: string;
  endTime: string;
  durationSec: number;
  timeLabel: string;
  stateGroup: ReportStateGroup;
  primaryStateKey: string;
  primaryStateLabel: string;
  secondaryStateKey: string | null;
  avgConfidence: number;
  confidenceLabel: string;
  evidenceSummary: string[];
  snapshotRefs: string[];
  blockerType: BlockerType | null;
  blockerLabel: string | null;
  isTurningPoint: boolean;
  sampleCount: number;
}

export interface DerivedTurningPoint {
  id: string;
  nodeId: string;
  type: TurningPointType;
  title: string;
  reason: string;
  beforeState: string;
  afterState: string;
  timeLabel: string;
  impactScore: number;
}

export interface DerivedBlocker {
  type: BlockerType;
  label: string;
  severity: 'low' | 'medium' | 'high';
  durationSec: number;
  durationLabel: string;
  occurrences: number;
  evidenceSummary: string[];
}

export interface DerivedRecommendation {
  id: string;
  text: string;
  reason: string;
  sourceType: 'blocker' | 'turning_point';
  sourceKey: string;
}

export interface DerivedSessionOverview {
  title: string;
  taskTitle: string;
  durationSec: number;
  durationLabel: string;
  stateCount: number;
  snapshotCount: number;
  eventCount: number | null;
  dominantStateKey: string;
  dominantStateLabel: string;
  turningPointCount: number;
  primaryBlockerLabel: string | null;
  primaryBlockerReason: string | null;
}

export interface DerivedSessionReport {
  overview: DerivedSessionOverview;
  timeline: DerivedTimelineNode[];
  turningPoints: DerivedTurningPoint[];
  blockers: DerivedBlocker[];
  recommendations: DerivedRecommendation[];
}

export interface ReportGenerationStep {
  step: string;
  title: string;
  description: string;
  dataHint: string;
}

const STATE_META: Record<string, StateMeta> = {
  steady_flow: { label: '稳定推进', group: '推进' },
  efficient_flow: { label: '高效推进', group: '推进' },
  careful_progression: { label: '谨慎推进', group: '推进' },
  local_debugging: { label: '局部调试', group: '探索' },
  branch_exploration: { label: '分支探索', group: '探索' },
  probing_edits: { label: '试探性修改', group: '探索' },
  minor_stuck: { label: '轻度卡顿', group: '阻滞' },
  looping: { label: '反复回退', group: '阻滞' },
  structural_stuck: { label: '结构性卡住', group: '阻滞' },
  chaotic_trial: { label: '高频试错', group: '混乱' },
  ineffective_attempts: { label: '无效尝试', group: '混乱' },
  strategy_drift: { label: '策略漂移', group: '混乱' },
  short_pause: { label: '短暂停顿', group: '注意力' },
  deep_thinking: { label: '深度思考', group: '注意力' },
  attention_drop: { label: '注意力下降', group: '注意力' },
};

const FEATURE_LABELS: Record<string, string> = {
  stability: '稳定性',
  exploration: '探索性',
  friction: '阻滞',
  rhythm: '节奏',
  backtrack_loop_score: '回退循环',
  delete_ratio: '删除占比',
  attempt_frequency: '尝试频率',
  attempt_freq_per_min: '尝试频率',
  long_pause_ratio: '长暂停',
  pause_ratio: '停顿占比',
  branch_switch_score: '分支切换',
};

const BLOCKER_LABELS: Record<BlockerType, string> = {
  looping_backtrack: '反复回退',
  structural_stuck: '结构性卡住',
  minor_stuck: '轻度卡顿',
  attention_drop: '注意力下降',
  long_idle: '长时间停住',
  chaotic_trial: '高频试错',
};

const BLOCKER_TEMPLATES: Record<BlockerType, string> = {
  looping_backtrack: '先锁定一个子问题，再继续改。',
  structural_stuck: '先换成更小的验证路径。',
  minor_stuck: '先确认当前假设，再决定要不要继续试。',
  attention_drop: '先收敛目标，只做一个最小动作。',
  long_idle: '先写下当前卡点，再开始下一步。',
  chaotic_trial: '下一轮只保留一种尝试方向。',
};

export const REPORT_GENERATION_STEPS: ReportGenerationStep[] = [
  {
    step: '01',
    title: '采集学习行为',
    description: '记录编辑、运行、停顿、回退等学习动作，先把这次 session 的过程留下来。',
    dataHint: '来自本地 raw_events / summary',
  },
  {
    step: '02',
    title: '形成时间窗口特征快照',
    description: '把连续行为整理成一段段窗口特征，例如尝试频率、停顿占比、回退强度。',
    dataHint: '来自 feature_snapshots',
  },
  {
    step: '03',
    title: '本地推理状态变化',
    description: '根据每个窗口的特征，推断当时更像稳定推进、探索、卡住还是注意力下降。',
    dataHint: '来自 state_vectors',
  },
  {
    step: '04',
    title: '聚合成复盘结论与建议',
    description: '按时间线提炼主状态、关键转折点、主要阻滞，并给出下一轮可执行建议。',
    dataHint: '由当前页面即时聚合',
  },
];

function safeParseJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function humanizeStateKey(stateKey: string): string {
  return STATE_META[stateKey]?.label ?? stateKey.replaceAll('_', ' ');
}

function getStateGroup(stateKey: string): ReportStateGroup {
  return STATE_META[stateKey]?.group ?? '未知';
}

function toMs(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function clampDurationSec(startMs: number, endMs: number): number {
  const diff = Math.round((endMs - startMs) / 1000);
  return diff > 0 ? diff : 0;
}

export function formatDurationLabel(totalSeconds: number): string {
  if (totalSeconds <= 0) {
    return '少于 1 分钟';
  }
  if (totalSeconds < 60) {
    return `${totalSeconds} 秒`;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours} 小时 ${minutes} 分钟`;
  }
  return `${minutes} 分钟`;
}

export function formatClockLabel(iso: string): string {
  if (!iso) {
    return '--:--';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function confidenceToLabel(confidence: number): string {
  if (confidence >= 0.72) {
    return '高';
  }
  if (confidence >= 0.5) {
    return '中';
  }
  return '低';
}

function readTopStateKey(item: TopStateResponse | undefined): string {
  const raw = item?.state_key ?? item?.stateKey ?? item?.key ?? item?.label ?? item?.name ?? 'unknown';
  return String(raw);
}

function extractEvidenceTexts(value: unknown): string[] {
  const parsed = safeParseJson(value);
  const texts: string[] = [];

  if (typeof parsed === 'string') {
    const text = parsed.trim();
    return text ? [text] : [];
  }

  if (parsed && typeof parsed === 'object') {
    const payload = parsed as Record<string, unknown>;
    if (typeof payload.short_text === 'string' && payload.short_text.trim()) {
      texts.push(payload.short_text.trim());
    }

    const evidenceItems = Array.isArray(payload.evidence_items) ? payload.evidence_items : [];
    for (const item of evidenceItems) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const feature = String((item as Record<string, unknown>).feature ?? '');
      const direction = String((item as Record<string, unknown>).direction ?? '');
      const label = FEATURE_LABELS[feature] ?? feature;
      if (!label) {
        continue;
      }
      texts.push(`${label}${direction === 'down' ? '偏低' : '偏高'}`);
    }
  }

  return Array.from(new Set(texts)).slice(0, 3);
}

function inferBlockerFromState(stateKey: string): BlockerType | null {
  switch (stateKey) {
    case 'looping':
      return 'looping_backtrack';
    case 'structural_stuck':
      return 'structural_stuck';
    case 'minor_stuck':
      return 'minor_stuck';
    case 'attention_drop':
      return 'attention_drop';
    case 'chaotic_trial':
    case 'ineffective_attempts':
    case 'strategy_drift':
      return 'chaotic_trial';
    default:
      return null;
  }
}

function summarizeSnapshotBlocker(snapshots: SnapshotResponse[]): DerivedBlocker[] {
  if (snapshots.length === 0) {
    return [];
  }

  const loopWindows = snapshots.filter(
    (item) => Number(item.feature_values.backtrack_loop_score ?? 0) >= 0.55,
  );
  const idleWindows = snapshots.filter(
    (item) =>
      Number(item.feature_values.pause_ratio ?? 0) >= 0.35 ||
      Number(item.feature_values.max_pause_ms ?? 0) >= 8000,
  );
  const chaoticWindows = snapshots.filter(
    (item) =>
      Number(item.feature_values.attempt_freq_per_min ?? 0) >= 1.8 &&
      Number(item.feature_values.delete_ratio ?? 0) >= 0.2,
  );

  const candidates: Array<[BlockerType, SnapshotResponse[]]> = [
    ['looping_backtrack', loopWindows],
    ['long_idle', idleWindows],
    ['chaotic_trial', chaoticWindows],
  ];

  return candidates
    .filter(([, windows]) => windows.length > 0)
    .sort((left, right) => right[1].length - left[1].length)
    .slice(0, 1)
    .map(([type, windows]) => {
      const durationSec = windows.reduce((total, window) => {
        const startMs = toMs(window.window_start);
        const endMs = toMs(window.window_end);
        return total + clampDurationSec(startMs, endMs);
      }, 0);

      return {
        type,
        label: BLOCKER_LABELS[type],
        severity: windows.length >= 2 ? 'medium' : 'low',
        durationSec,
        durationLabel: formatDurationLabel(durationSec),
        occurrences: windows.length,
        evidenceSummary: [
          type === 'long_idle' ? '停顿占比偏高' : type === 'chaotic_trial' ? '尝试频率偏高' : '回退循环偏高',
        ],
      };
    });
}

function normalizeStatePoints(report: SessionReportResponse): NormalizedStatePoint[] {
  const snapshotMap = new Map(report.snapshots.map((item) => [item.snapshot_id, item]));
  const states = report.states.length > 0 ? report.states : [];

  return states.map((state, index) => {
    const primary = state.top_states[0];
    const secondary = state.top_states[1];
    const primaryStateKey = readTopStateKey(primary);
    const secondaryStateKey = secondary ? readTopStateKey(secondary) : null;
    const snapshot = state.snapshot_id ? snapshotMap.get(state.snapshot_id) ?? null : null;
    const generatedMs = toMs(state.generated_at);
    const startTime = snapshot?.window_start ?? state.generated_at;
    const endTime = snapshot?.window_end ?? state.generated_at;
    const startMs = toMs(startTime) || generatedMs;
    const endMs = toMs(endTime) || generatedMs;
    const evidenceSummary = Array.from(
      new Set([
        ...extractEvidenceTexts(state.evidence_summary),
        ...extractEvidenceTexts(primary?.evidence_summary),
      ]),
    ).slice(0, 3);

    return {
      id: state.state_id || `${primaryStateKey}-${index}`,
      startTime,
      endTime,
      startMs,
      endMs,
      primaryStateKey,
      primaryStateLabel: humanizeStateKey(primaryStateKey),
      secondaryStateKey,
      stateGroup: getStateGroup(primaryStateKey),
      confidence: typeof state.confidence === 'number' ? state.confidence : 0,
      evidenceSummary,
      snapshotId: state.snapshot_id,
      blockerType: inferBlockerFromState(primaryStateKey),
      snapshot,
    };
  });
}

function shouldMergeNode(current: DerivedTimelineNode, point: NormalizedStatePoint): boolean {
  if (current.primaryStateKey === point.primaryStateKey) {
    return true;
  }
  if (current.stateGroup !== point.stateGroup) {
    return false;
  }
  const gapSec = clampDurationSec(toMs(current.endTime), point.startMs);
  return gapSec <= 45;
}

function buildTimeline(points: NormalizedStatePoint[]): DerivedTimelineNode[] {
  const timeline: DerivedTimelineNode[] = [];

  for (const point of points) {
    const existing = timeline.at(-1);
    if (existing && shouldMergeNode(existing, point)) {
      existing.endTime = point.endTime;
      existing.durationSec = clampDurationSec(toMs(existing.startTime), point.endMs);
      existing.timeLabel = `${formatClockLabel(existing.startTime)} - ${formatClockLabel(existing.endTime)}`;
      existing.avgConfidence = Number(
        ((existing.avgConfidence * existing.sampleCount + point.confidence) / (existing.sampleCount + 1)).toFixed(3),
      );
      existing.confidenceLabel = confidenceToLabel(existing.avgConfidence);
      existing.evidenceSummary = Array.from(new Set([...existing.evidenceSummary, ...point.evidenceSummary])).slice(0, 3);
      if (point.snapshotId) {
        existing.snapshotRefs = Array.from(new Set([...existing.snapshotRefs, point.snapshotId]));
      }
      existing.sampleCount += 1;
      if (!existing.blockerType && point.blockerType) {
        existing.blockerType = point.blockerType;
        existing.blockerLabel = BLOCKER_LABELS[point.blockerType];
      }
      continue;
    }

    timeline.push({
      nodeId: point.id,
      startTime: point.startTime,
      endTime: point.endTime,
      durationSec: clampDurationSec(point.startMs, point.endMs),
      timeLabel: `${formatClockLabel(point.startTime)} - ${formatClockLabel(point.endTime)}`,
      stateGroup: point.stateGroup,
      primaryStateKey: point.primaryStateKey,
      primaryStateLabel: point.primaryStateLabel,
      secondaryStateKey: point.secondaryStateKey,
      avgConfidence: point.confidence,
      confidenceLabel: confidenceToLabel(point.confidence),
      evidenceSummary: point.evidenceSummary,
      snapshotRefs: point.snapshotId ? [point.snapshotId] : [],
      blockerType: point.blockerType,
      blockerLabel: point.blockerType ? BLOCKER_LABELS[point.blockerType] : null,
      isTurningPoint: false,
      sampleCount: 1,
    });
  }

  return timeline;
}

function groupSeverity(group: ReportStateGroup): number {
  switch (group) {
    case '推进':
      return 1;
    case '探索':
      return 2;
    case '注意力':
      return 3;
    case '阻滞':
      return 4;
    case '混乱':
      return 5;
    default:
      return 0;
  }
}

function buildTurningPoints(timeline: DerivedTimelineNode[]): DerivedTurningPoint[] {
  const candidates: DerivedTurningPoint[] = [];

  for (let index = 1; index < timeline.length; index += 1) {
    const before = timeline[index - 1];
    const after = timeline[index];
    const beforeSeverity = groupSeverity(before.stateGroup);
    const afterSeverity = groupSeverity(after.stateGroup);
    const beforeBlocked = before.blockerType !== null;
    const afterBlocked = after.blockerType !== null;
    let type: TurningPointType | null = null;

    if (!beforeBlocked && afterBlocked) {
      type = 'downturn';
    } else if (beforeBlocked && !afterBlocked && ['推进', '探索'].includes(after.stateGroup)) {
      type = 'recovery';
    } else if (before.stateGroup !== after.stateGroup && Math.abs(afterSeverity - beforeSeverity) >= 1) {
      type = 'strategy_shift';
    }

    if (!type) {
      continue;
    }

    const transitionStrength = Math.max(1, Math.abs(afterSeverity - beforeSeverity) + (beforeBlocked !== afterBlocked ? 1 : 0));
    const durationWeight = ((before.durationSec + after.durationSec) / 60) + 1;
    const confidenceWeight = ((before.avgConfidence + after.avgConfidence) / 2) + 0.35;
    const impactScore = Number((transitionStrength * durationWeight * confidenceWeight).toFixed(3));

    candidates.push({
      id: `${before.nodeId}-${after.nodeId}`,
      nodeId: after.nodeId,
      type,
      title:
        type === 'downturn'
          ? `从${before.primaryStateLabel}转入${after.primaryStateLabel}`
          : type === 'recovery'
            ? `从${before.primaryStateLabel}回到${after.primaryStateLabel}`
            : `从${before.primaryStateLabel}切到${after.primaryStateLabel}`,
      reason: after.evidenceSummary[0] ?? before.evidenceSummary[0] ?? '状态重心发生变化',
      beforeState: before.primaryStateLabel,
      afterState: after.primaryStateLabel,
      timeLabel: after.timeLabel,
      impactScore,
    });
  }

  if (candidates.length === 0 && timeline.length > 0) {
    const firstNode = timeline.find((node) => node.blockerType) ?? timeline[0];
    candidates.push({
      id: `${firstNode.nodeId}-fallback`,
      nodeId: firstNode.nodeId,
      type: firstNode.blockerType ? 'downturn' : 'strategy_shift',
      title: firstNode.blockerType
        ? `一开始就进入${firstNode.primaryStateLabel}`
        : `本次 session 主要处于${firstNode.primaryStateLabel}`,
      reason: firstNode.evidenceSummary[0] ?? '首段状态已体现本次 session 主特征',
      beforeState: '开始',
      afterState: firstNode.primaryStateLabel,
      timeLabel: firstNode.timeLabel,
      impactScore: Number((firstNode.avgConfidence + 0.5).toFixed(3)),
    });
  }

  return candidates
    .sort((left, right) => right.impactScore - left.impactScore)
    .slice(0, 3);
}

function buildBlockers(
  timeline: DerivedTimelineNode[],
  snapshots: SnapshotResponse[],
): DerivedBlocker[] {
  const aggregate = new Map<
    BlockerType,
    {
      durationSec: number;
      occurrences: number;
      evidenceSummary: string[];
      confidenceSum: number;
    }
  >();

  for (const node of timeline) {
    if (!node.blockerType) {
      continue;
    }
    const current = aggregate.get(node.blockerType) ?? {
      durationSec: 0,
      occurrences: 0,
      evidenceSummary: [],
      confidenceSum: 0,
    };
    current.durationSec += node.durationSec;
    current.occurrences += 1;
    current.confidenceSum += node.avgConfidence;
    current.evidenceSummary = Array.from(new Set([...current.evidenceSummary, ...node.evidenceSummary])).slice(0, 3);
    aggregate.set(node.blockerType, current);
  }

  const blockers = Array.from(aggregate.entries())
    .map(([type, value]) => {
      const averageConfidence = value.confidenceSum / Math.max(value.occurrences, 1);
      const severity: 'low' | 'medium' | 'high' =
        value.durationSec >= 600 || averageConfidence >= 0.72
          ? 'high'
          : value.durationSec >= 240 || averageConfidence >= 0.52
            ? 'medium'
            : 'low';

      return {
        type,
        label: BLOCKER_LABELS[type],
        severity,
        durationSec: value.durationSec,
        durationLabel: formatDurationLabel(value.durationSec),
        occurrences: value.occurrences,
        evidenceSummary: value.evidenceSummary,
      };
    })
    .sort((left, right) => right.durationSec - left.durationSec);

  return blockers.length > 0 ? blockers : summarizeSnapshotBlocker(snapshots);
}

function buildRecommendations(
  blockers: DerivedBlocker[],
  turningPoints: DerivedTurningPoint[],
): DerivedRecommendation[] {
  const recommendations: DerivedRecommendation[] = [];
  const usedTexts = new Set<string>();

  for (const blocker of blockers.slice(0, 2)) {
    const text = BLOCKER_TEMPLATES[blocker.type];
    if (!usedTexts.has(text)) {
      usedTexts.add(text);
      recommendations.push({
        id: `blocker-${blocker.type}`,
        text,
        reason: blocker.evidenceSummary[0] ?? `${blocker.label}出现次数较多`,
        sourceType: 'blocker',
        sourceKey: blocker.type,
      });
    }
  }

  for (const turningPoint of turningPoints) {
    if (recommendations.length >= 3) {
      break;
    }
    const text =
      turningPoint.type === 'recovery'
        ? '刚才有效，沿这条路径继续细化。'
        : turningPoint.type === 'downturn'
          ? '转折后先停一下，先确认下一步要验证什么。'
          : '下一轮先定一种推进路径。';

    if (!usedTexts.has(text)) {
      usedTexts.add(text);
      recommendations.push({
        id: `turning-${turningPoint.id}`,
        text,
        reason: turningPoint.reason,
        sourceType: 'turning_point',
        sourceKey: turningPoint.id,
      });
    }
  }

  if (recommendations.length < 2) {
    const fallbackText = blockers.length > 0 ? '先处理最重的阻滞段，再继续推进。' : '先沿最稳定的一段继续展开。';
    if (!usedTexts.has(fallbackText)) {
      recommendations.push({
        id: 'fallback',
        text: fallbackText,
        reason: blockers[0]?.evidenceSummary[0] ?? turningPoints[0]?.reason ?? '当前轨迹已显示主线',
        sourceType: blockers.length > 0 ? 'blocker' : 'turning_point',
        sourceKey: blockers[0]?.type ?? turningPoints[0]?.id ?? 'fallback',
      });
    }
  }

  return recommendations.slice(0, 3);
}

function pickDominantState(timeline: DerivedTimelineNode[]): { key: string; label: string } {
  if (timeline.length === 0) {
    return { key: 'unknown', label: '状态不足' };
  }

  const durationByState = new Map<string, number>();
  for (const node of timeline) {
    durationByState.set(node.primaryStateKey, (durationByState.get(node.primaryStateKey) ?? 0) + Math.max(node.durationSec, 1));
  }

  const [stateKey] = Array.from(durationByState.entries()).sort((left, right) => right[1] - left[1])[0];
  return {
    key: stateKey,
    label: humanizeStateKey(stateKey),
  };
}

function readEventCount(summary: Record<string, unknown> | null): number | null {
  const raw = summary?.event_count;
  return typeof raw === 'number' ? raw : null;
}

export function deriveSessionReport(report: SessionReportResponse): DerivedSessionReport {
  const points = normalizeStatePoints(report);
  const timeline = buildTimeline(points);
  const turningPoints = buildTurningPoints(timeline);
  const blockers = buildBlockers(timeline, report.snapshots);

  const turningPointNodeIds = new Set(turningPoints.map((item) => item.nodeId));
  for (const node of timeline) {
    node.isTurningPoint = turningPointNodeIds.has(node.nodeId);
  }

  const dominantState = pickDominantState(timeline);
  const sessionStart = report.session.start_time || report.summary?.first_event_time;
  const sessionEnd =
    report.session.end_time ||
    (typeof report.summary?.last_event_time === 'string' ? report.summary.last_event_time : null) ||
    timeline.at(-1)?.endTime ||
    report.session.last_event_time;

  const durationSec = clampDurationSec(toMs(String(sessionStart ?? '')), toMs(String(sessionEnd ?? '')));
  const recommendations = buildRecommendations(blockers, turningPoints);
  const primaryBlocker = blockers[0] ?? null;

  return {
    overview: {
      title: `Session ${report.session.session_index} 复盘`,
      taskTitle: report.task?.title ?? '未命名任务',
      durationSec,
      durationLabel: formatDurationLabel(durationSec),
      stateCount: report.states.length,
      snapshotCount: report.snapshots.length,
      eventCount: readEventCount(report.summary),
      dominantStateKey: dominantState.key,
      dominantStateLabel: dominantState.label,
      turningPointCount: turningPoints.length,
      primaryBlockerLabel: primaryBlocker?.label ?? null,
      primaryBlockerReason: primaryBlocker?.evidenceSummary[0] ?? null,
    },
    timeline,
    turningPoints,
    blockers,
    recommendations,
  };
}
