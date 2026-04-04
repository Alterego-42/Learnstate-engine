export type EventType =
  | 'edit.insert'
  | 'edit.delete'
  | 'edit.replace'
  | 'cursor.move'
  | 'cursor.pause'
  | 'clipboard.copy'
  | 'clipboard.paste'
  | 'run'
  | 'submit'
  | 'session.end';

export interface TaskResponse {
  task_id: string;
  task_type: string;
  title: string;
  difficulty_level: string | null;
  knowledge_tags: string[];
  source_type: string | null;
}

export interface SessionResponse {
  session_id: string;
  user_local_id: string;
  task_id: string | null;
  start_time: string;
  end_time: string | null;
  session_index: number;
  split_reason: string | null;
  status: string;
  last_event_time: string | null;
}

export interface SnapshotResponse {
  snapshot_id: string;
  session_id: string;
  window_start: string;
  window_end: string;
  feature_values: Record<string, number>;
  created_at: string;
}

export interface StateVectorResponse {
  state_id: string;
  session_id: string;
  snapshot_id: string | null;
  dimension_scores: Record<string, unknown>;
  top_states: TopStateResponse[];
  confidence: number;
  evidence_summary: string | null;
  generated_at: string;
  source: string;
}

export interface TopStateResponse {
  state_key?: string;
  stateKey?: string;
  key?: string;
  label?: string;
  name?: string;
  family?: string;
  score?: number;
  confidence?: number;
  evidence_summary?: unknown;
  trigger_ready?: boolean;
  triggerReady?: boolean;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CurrentStateResponse {
  current_session: SessionResponse | null;
  latest_snapshot: SnapshotResponse | null;
  latest_state: StateVectorResponse | null;
}

export interface EventItemRequest {
  event_type: EventType;
  event_time: string;
  payload_summary: Record<string, unknown>;
  source: string;
}

export interface PostEventsRequest {
  user_local_id: string;
  task_id: string | null;
  events: EventItemRequest[];
}

export interface PostEventsResponse {
  session: SessionResponse;
  ingested_count: number;
  snapshot: SnapshotResponse;
  closed: boolean;
}

export interface StateHistoryResponse {
  session: SessionResponse | null;
  history: StateVectorResponse[];
}

export interface SessionReportResponse {
  session: SessionResponse;
  task: TaskResponse | null;
  summary: Record<string, unknown> | null;
  snapshots: SnapshotResponse[];
  states: StateVectorResponse[];
}

export interface ReporterStatus {
  pendingCount: number;
  lastError: string | null;
  lastFlushAt: string | null;
  lastIngestedCount: number;
  lastSessionId: string | null;
  isFlushing: boolean;
}

export interface OutputEntry {
  id: string;
  tone: 'info' | 'success' | 'warn';
  text: string;
  time: string;
}
