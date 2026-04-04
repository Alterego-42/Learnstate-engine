import { useCallback, useEffect, useMemo, useState } from 'react';
import { getTask, getTasks } from '../api/client';
import type { TaskResponse } from '../types';

export function useDaemonTasks() {
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [selectedTask, setSelectedTask] = useState<TaskResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const nextTasks = await getTasks();
      setTasks(nextTasks);
      setSelectedTaskId((current) => current || nextTasks[0]?.task_id || '');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '获取任务失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

  useEffect(() => {
    if (!selectedTaskId) {
      setSelectedTask(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const task = await getTask(selectedTaskId);
        if (!cancelled) {
          setSelectedTask(task);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : '获取任务详情失败');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedTaskId]);

  return useMemo(
    () => ({
      tasks,
      selectedTaskId,
      selectedTask,
      loading,
      error,
      setSelectedTaskId,
      refreshTasks,
    }),
    [error, loading, refreshTasks, selectedTask, selectedTaskId, tasks],
  );
}
