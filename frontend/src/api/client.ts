import type {
  CurrentStateResponse,
  PostEventsRequest,
  PostEventsResponse,
  SessionReportResponse,
  StateHistoryResponse,
  TaskResponse,
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export function getTasks(): Promise<TaskResponse[]> {
  return requestJson<TaskResponse[]>('/api/tasks');
}

export function getTask(taskId: string): Promise<TaskResponse> {
  return requestJson<TaskResponse>(`/api/tasks/${taskId}`);
}

export function getCurrentState(userLocalId: string): Promise<CurrentStateResponse> {
  const params = new URLSearchParams({ user_local_id: userLocalId });
  return requestJson<CurrentStateResponse>(`/api/state/current?${params.toString()}`);
}

export function getStateHistory(
  userLocalId: string,
  sessionId?: string | null,
): Promise<StateHistoryResponse> {
  const params = new URLSearchParams({ user_local_id: userLocalId });
  if (sessionId) {
    params.set('session_id', sessionId);
  }
  return requestJson<StateHistoryResponse>(`/api/state/history?${params.toString()}`);
}

export function getSessionReport(sessionId: string): Promise<SessionReportResponse> {
  return requestJson<SessionReportResponse>(`/api/session/${sessionId}/report`);
}

export function postEvents(
  payload: PostEventsRequest,
  init?: Pick<RequestInit, 'keepalive'>,
): Promise<PostEventsResponse> {
  return requestJson<PostEventsResponse>('/api/events', {
    method: 'POST',
    body: JSON.stringify(payload),
    keepalive: init?.keepalive,
  });
}
