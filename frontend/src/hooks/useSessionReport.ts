import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSessionReport } from '../api/client';
import type { SessionReportResponse } from '../types';
import { deriveSessionReport } from '../utils/report';

export function useSessionReport(sessionId: string) {
  const [data, setData] = useState<SessionReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId.trim()) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const next = await getSessionReport(sessionId.trim());
      setData(next);
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '获取复盘失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(
    () => ({
      data,
      loading,
      error,
      refresh,
      derived: data ? deriveSessionReport(data) : null,
    }),
    [data, error, loading, refresh],
  );
}
