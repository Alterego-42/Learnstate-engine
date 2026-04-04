import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCurrentState, getStateHistory } from '../api/client';
import type { CurrentStateResponse, StateVectorResponse } from '../types';
import { createStatusPanelViewModel } from '../utils/state';

export function useStatePolling(userLocalId: string, intervalMs = 3000) {
  const [data, setData] = useState<CurrentStateResponse | null>(null);
  const [history, setHistory] = useState<StateVectorResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await getCurrentState(userLocalId);
      setData(next);
      setError(null);

      const sessionId = next.current_session?.session_id ?? next.latest_state?.session_id ?? null;
      if (sessionId) {
        try {
          const nextHistory = await getStateHistory(userLocalId, sessionId);
          setHistory(nextHistory.history);
          setHistoryError(null);
        } catch (caughtHistoryError) {
          setHistoryError(
            caughtHistoryError instanceof Error ? caughtHistoryError.message : '获取状态历史失败',
          );
        }
      } else {
        setHistory([]);
        setHistoryError(null);
      }

      setLastSuccessAt(new Date().toISOString());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '获取状态失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userLocalId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [intervalMs, refresh]);

  return useMemo(
    () => ({
      data,
      history,
      loading,
      refreshing,
      error,
      historyError,
      lastSuccessAt,
      refresh,
      panel: createStatusPanelViewModel(data),
    }),
    [data, error, history, historyError, lastSuccessAt, loading, refresh, refreshing],
  );
}
