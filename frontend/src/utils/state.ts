import type { CurrentStateResponse, StateVectorResponse, TopStateResponse } from '../types';

const STATE_LABELS: Record<string, string> = {
  steady_flow: '稳定推进',
  efficient_flow: '高效推进',
  careful_progression: '谨慎推进',
  local_debugging: '局部调试',
  branch_exploration: '分支探索',
  probing_edits: '试探修改',
  minor_stuck: '轻度卡顿',
  looping: '反复回退',
  structural_stuck: '结构性卡住',
  chaotic_trial: '高频试错',
  ineffective_attempts: '无效尝试',
  strategy_drift: '策略漂移',
  short_pause: '短暂停顿',
  deep_thinking: '深度思考',
  attention_drop: '注意力下滑',
};

export interface DisplayStateItem {
  key: string;
  label: string;
  triggerReady: boolean;
}

export interface StatusPanelViewModel {
  primary: DisplayStateItem | null;
  secondary: DisplayStateItem | null;
  confidence: number | null;
  evidenceSummary: string;
  triggerReady: boolean;
  shouldAdjust: boolean;
  generatedAt: string | null;
  emptyReason: string | null;
}

export interface StatusHistoryItem {
  id: string;
  label: string;
  key: string;
  confidence: number | null;
  generatedAt: string;
}

function humanizeStateKey(key: string): string {
  if (STATE_LABELS[key]) {
    return STATE_LABELS[key];
  }
  return key.replaceAll('_', ' ');
}

function readStateKey(item: Record<string, unknown>): string {
  const raw =
    item.state_key ??
    item.stateKey ??
    item.key ??
    item.label ??
    item.name ??
    'unknown';
  return String(raw);
}

function readTriggerReady(item: Record<string, unknown>): boolean {
  return Boolean(item.trigger_ready ?? item.triggerReady ?? false);
}

function normalizeTopState(item?: TopStateResponse): DisplayStateItem | null {
  if (!item) {
    return null;
  }

  const key = readStateKey(item);
  return {
    key,
    label: humanizeStateKey(key),
    triggerReady: readTriggerReady(item),
  };
}

function parseEvidencePayload(
  value: string | Record<string, unknown> | null | undefined,
): { shortText: string | null } {
  if (!value) {
    return { shortText: null };
  }

  if (typeof value === 'object') {
    const shortText = value.short_text;
    return { shortText: typeof shortText === 'string' ? shortText : null };
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      const shortText = parsed.short_text;
      return { shortText: typeof shortText === 'string' ? shortText : value };
    }
  } catch {
    return { shortText: value };
  }

  return { shortText: value };
}

export function readEvidenceSummary(state: StateVectorResponse | null): string {
  const parsed = parseEvidencePayload(state?.evidence_summary ?? null);
  return parsed.shortText ?? '暂无 latest_state，等待推理结果写入';
}

export function createStatusPanelViewModel(data: CurrentStateResponse | null): StatusPanelViewModel {
  const latestState = data?.latest_state ?? null;
  const primary = normalizeTopState(latestState?.top_states?.[0]);
  const secondary = normalizeTopState(latestState?.top_states?.[1]);
  const confidence = typeof latestState?.confidence === 'number' ? latestState.confidence : null;
  const triggerReady = primary?.triggerReady ?? false;
  const shouldAdjust =
    triggerReady ||
    (primary !== null &&
      ['minor_stuck', 'looping', 'structural_stuck', 'attention_drop', 'strategy_drift'].includes(primary.key) &&
      (confidence ?? 0) >= 0.55);

  let emptyReason: string | null = null;
  if (!latestState) {
    emptyReason = data?.latest_snapshot
      ? '已拿到最新行为快照，等待 latest_state 写入。'
      : '暂无状态数据，先编辑或运行一次以产生事件。';
  }

  return {
    primary,
    secondary,
    confidence,
    evidenceSummary: readEvidenceSummary(latestState),
    triggerReady,
    shouldAdjust,
    generatedAt: latestState?.generated_at ?? null,
    emptyReason,
  };
}

export function createStatusHistoryItems(history: StateVectorResponse[]): StatusHistoryItem[] {
  if (history.length === 0) {
    return [];
  }

  const changes: StatusHistoryItem[] = [];
  let previousKey = '';

  for (const state of history) {
    const topState = normalizeTopState(state.top_states?.[0]);
    const nextKey = topState?.key ?? 'unknown';
    if (changes.length > 0 && nextKey === previousKey) {
      continue;
    }

    changes.push({
      id: state.state_id,
      key: nextKey,
      label: topState?.label ?? '暂无状态',
      confidence: typeof state.confidence === 'number' ? state.confidence : null,
      generatedAt: state.generated_at,
    });
    previousKey = nextKey;
  }

  return changes.slice(-5).reverse();
}
