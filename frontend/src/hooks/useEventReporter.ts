import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { postEvents } from '../api/client';
import type {
  EventItemRequest,
  EventType,
  PostEventsResponse,
  ReporterStatus,
} from '../types';

const FLUSH_INTERVAL_MS = 2000;
const MAX_PENDING_EVENTS = 20;

interface UseEventReporterOptions {
  userLocalId: string;
  taskId: string | null;
  onFlushSuccess?: (response: PostEventsResponse) => void;
}

export function useEventReporter({ userLocalId, taskId, onFlushSuccess }: UseEventReporterOptions) {
  const queueRef = useRef<EventItemRequest[]>([]);
  const seqRef = useRef(1);
  const sessionStartedAtRef = useRef(Date.now());
  const flushingRef = useRef(false);
  const [status, setStatus] = useState<ReporterStatus>({
    pendingCount: 0,
    lastError: null,
    lastFlushAt: null,
    lastIngestedCount: 0,
    lastSessionId: null,
    isFlushing: false,
  });

  useEffect(() => {
    queueRef.current = [];
    seqRef.current = 1;
    sessionStartedAtRef.current = Date.now();
    setStatus({
      pendingCount: 0,
      lastError: null,
      lastFlushAt: null,
      lastIngestedCount: 0,
      lastSessionId: null,
      isFlushing: false,
    });
  }, [taskId]);

  const flush = useCallback(
    async (keepalive = false) => {
      if (flushingRef.current || queueRef.current.length === 0) {
        return;
      }

      flushingRef.current = true;
      const batch = queueRef.current.splice(0, queueRef.current.length);
      setStatus((current) => ({ ...current, pendingCount: 0, isFlushing: true }));

      try {
        const response = await postEvents(
          {
            user_local_id: userLocalId,
            task_id: taskId,
            events: batch,
          },
          { keepalive },
        );

        setStatus({
          pendingCount: queueRef.current.length,
          lastError: null,
          lastFlushAt: new Date().toISOString(),
          lastIngestedCount: response.ingested_count,
          lastSessionId: response.session.session_id,
          isFlushing: false,
        });
        onFlushSuccess?.(response);
      } catch (caughtError) {
        queueRef.current = [...batch, ...queueRef.current];
        setStatus((current) => ({
          ...current,
          pendingCount: queueRef.current.length,
          lastError: caughtError instanceof Error ? caughtError.message : '事件上报失败',
          isFlushing: false,
        }));
      } finally {
        flushingRef.current = false;
      }
    },
    [onFlushSuccess, taskId, userLocalId],
  );

  const recordEvent = useCallback(
    (eventType: EventType, payloadSummary: Record<string, unknown>, source: string) => {
      const event: EventItemRequest = {
        event_type: eventType,
        event_time: new Date().toISOString(),
        payload_summary: {
          seq: seqRef.current,
          ...payloadSummary,
        },
        source,
      };

      seqRef.current += 1;
      queueRef.current.push(event);
      setStatus((current) => ({
        ...current,
        pendingCount: queueRef.current.length,
      }));

      if (queueRef.current.length >= MAX_PENDING_EVENTS) {
        void flush();
      }
    },
    [flush],
  );

  const endSession = useCallback(
    async (reason = 'manual') => {
      recordEvent(
        'session.end',
        {
          reason,
          session_duration_ms: Date.now() - sessionStartedAtRef.current,
        },
        'workbench',
      );
      await flush();
      sessionStartedAtRef.current = Date.now();
    },
    [flush, recordEvent],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      void flush();
    }, FLUSH_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void flush(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [flush]);

  return useMemo(
    () => ({
      recordEvent,
      flush,
      endSession,
      status,
    }),
    [endSession, flush, recordEvent, status],
  );
}
