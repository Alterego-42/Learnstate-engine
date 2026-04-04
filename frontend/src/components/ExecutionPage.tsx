import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { editor } from 'monaco-editor';
import { MonacoWorkbench } from './MonacoWorkbench';
import { RunResultPanel } from './RunResultPanel';
import { StatusPanel } from './StatusPanel';
import { TaskBrief } from './TaskBrief';
import { useDaemonTasks } from '../hooks/useDaemonTasks';
import { useEventReporter } from '../hooks/useEventReporter';
import { useStatePolling } from '../hooks/useStatePolling';
import { FALLBACK_SESSION_ID } from '../config/demo';
import type { OutputEntry } from '../types';
import { stableHash } from '../utils/hash';
import { createStatusHistoryItems } from '../utils/state';

const USER_LOCAL_ID = 'local-demo-user';
const CURSOR_THROTTLE_MS = 250;
const CURSOR_PAUSE_MS = 2000;

const TEMPLATE_BY_TASK: Record<string, string> = {
  'demo-two-sum': `def two_sum(nums, target):
    seen = {}
    for index, value in enumerate(nums):
        need = target - value
        if need in seen:
            return [seen[need], index]
        seen[value] = index
    return []
`,
  'demo-binary-search': `def binary_search(nums, target):
    left, right = 0, len(nums) - 1
    while left <= right:
        mid = (left + right) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1
`,
};

interface ExecutionPageProps {
  onOpenReport?: (sessionId: string) => void;
}

function createOutputEntry(text: string, tone: OutputEntry['tone']): OutputEntry {
  const timestamp = new Date();
  return {
    id: `${timestamp.getTime()}-${Math.random().toString(16).slice(2)}`,
    tone,
    text,
    time: timestamp.toLocaleTimeString(),
  };
}

export function ExecutionPage({ onOpenReport }: ExecutionPageProps) {
  const { tasks, selectedTask, selectedTaskId, setSelectedTaskId, loading: tasksLoading, error: tasksError } =
    useDaemonTasks();
  const statePolling = useStatePolling(USER_LOCAL_ID, 3000);
  const [code, setCode] = useState(TEMPLATE_BY_TASK['demo-two-sum']);
  const [output, setOutput] = useState<OutputEntry[]>([
    createOutputEntry('执行页已启动，等待编辑事件进入 /api/events。', 'info'),
  ]);

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const fileHashRef = useRef('f_bootstrap');
  const lastCursorEmitAtRef = useRef(0);
  const lastCursorOffsetRef = useRef(0);
  const pauseTimerRef = useRef<number | null>(null);

  const pushOutput = useCallback((text: string, tone: OutputEntry['tone'] = 'info') => {
    setOutput((current) => [createOutputEntry(text, tone), ...current].slice(0, 12));
  }, []);

  const reporter = useEventReporter({
    userLocalId: USER_LOCAL_ID,
    taskId: selectedTask?.task_id ?? null,
    onFlushSuccess: (response) => {
      pushOutput(
        `已上报 ${response.ingested_count} 条事件，session=${response.session.session_id.slice(0, 8)}，snapshot=${response.snapshot.snapshot_id.slice(0, 8)}。`,
        'success',
      );
      void statePolling.refresh();
    },
  });

  useEffect(() => {
    if (!selectedTask?.task_id) {
      return;
    }
    setCode(TEMPLATE_BY_TASK[selectedTask.task_id] ?? '# Start coding here\n');
    pushOutput(`已切换任务：${selectedTask.title}`, 'info');
  }, [pushOutput, selectedTask]);

  const bindPauseTimer = useCallback(() => {
    if (!editorRef.current) {
      return;
    }
    if (pauseTimerRef.current) {
      window.clearTimeout(pauseTimerRef.current);
    }

    pauseTimerRef.current = window.setTimeout(() => {
      const editorInstance = editorRef.current;
      const model = editorInstance?.getModel();
      const position = editorInstance?.getPosition();
      if (!editorInstance || !model || !position) {
        return;
      }

      const offset = model.getOffsetAt(position);
      reporter.recordEvent(
        'cursor.pause',
        {
          file_id_hash: fileHashRef.current,
          language_id: model.getLanguageId(),
          line: position.lineNumber,
          column: position.column,
          offset,
          pause_time_ms: CURSOR_PAUSE_MS,
        },
        'monaco',
      );
    }, CURSOR_PAUSE_MS);
  }, [reporter]);

  const handleEditorMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor) => {
      cleanupRef.current?.();
      editorRef.current = editorInstance;

      const model = editorInstance.getModel();
      const domNode = editorInstance.getDomNode();
      if (!model || !domNode) {
        return;
      }

      fileHashRef.current = stableHash(model.uri.toString());
      lastCursorOffsetRef.current = 0;

      const changeDisposable = editorInstance.onDidChangeModelContent((event) => {
        const currentModel = editorInstance.getModel();
        if (!currentModel) {
          return;
        }

        fileHashRef.current = stableHash(currentModel.uri.toString());
        event.changes.forEach((change) => {
          const insertChars = change.text.length;
          const deleteChars = change.rangeLength;
          const eventType =
            insertChars > 0 && deleteChars === 0
              ? 'edit.insert'
              : insertChars === 0 && deleteChars > 0
                ? 'edit.delete'
                : 'edit.replace';

          reporter.recordEvent(
            eventType,
            {
              file_id_hash: fileHashRef.current,
              language_id: currentModel.getLanguageId(),
              change_count: event.changes.length,
              insert_chars: insertChars,
              delete_chars: deleteChars,
              start_line: change.range.startLineNumber,
              end_line: change.range.endLineNumber,
              start_offset: change.rangeOffset,
              end_offset: change.rangeOffset + change.rangeLength,
              model_version_id: currentModel.getVersionId(),
              is_undoing: event.isUndoing,
              is_redoing: event.isRedoing,
            },
            'monaco',
          );
        });

        bindPauseTimer();
      });

      const cursorDisposable = editorInstance.onDidChangeCursorPosition((event) => {
        const currentModel = editorInstance.getModel();
        if (!currentModel) {
          return;
        }

        const now = Date.now();
        if (now - lastCursorEmitAtRef.current < CURSOR_THROTTLE_MS) {
          bindPauseTimer();
          return;
        }

        const offset = currentModel.getOffsetAt(event.position);
        reporter.recordEvent(
          'cursor.move',
          {
            file_id_hash: fileHashRef.current,
            language_id: currentModel.getLanguageId(),
            line: event.position.lineNumber,
            column: event.position.column,
            offset,
            move_distance: Math.abs(offset - lastCursorOffsetRef.current),
            reason: String(event.reason ?? 'unknown'),
          },
          'monaco',
        );

        lastCursorEmitAtRef.current = now;
        lastCursorOffsetRef.current = offset;
        bindPauseTimer();
      });

      const pasteDisposable =
        typeof (editorInstance as unknown as { onDidPaste?: unknown }).onDidPaste === 'function'
          ? (
              (editorInstance as unknown as {
                onDidPaste: (
                  listener: (
                    event: {
                      range?: {
                        startLineNumber: number;
                        startColumn: number;
                        endLineNumber: number;
                        endColumn: number;
                      };
                      text?: string;
                    },
                  ) => void,
                ) => { dispose: () => void };
              }).onDidPaste((event) => {
                const currentModel = editorInstance.getModel();
                if (!currentModel) {
                  return;
                }

                const pastedLength =
                  typeof event.text === 'string'
                    ? event.text.length
                    : event.range
                      ? currentModel.getValueInRange(event.range).length
                      : 0;

                reporter.recordEvent(
                  'clipboard.paste',
                  {
                    file_id_hash: fileHashRef.current,
                    language_id: currentModel.getLanguageId(),
                    selection_chars: pastedLength,
                    selection_lines: event.range
                      ? event.range.endLineNumber - event.range.startLineNumber + 1
                      : 0,
                  },
                  'monaco',
                );
              })
            )
          : null;

      const handleCopy = () => {
        const currentModel = editorInstance.getModel();
        const selection = editorInstance.getSelection();
        if (!currentModel || !selection) {
          return;
        }
        reporter.recordEvent(
          'clipboard.copy',
          {
            file_id_hash: fileHashRef.current,
            language_id: currentModel.getLanguageId(),
            selection_chars: currentModel.getValueInRange(selection).length,
            selection_lines: selection.endLineNumber - selection.startLineNumber + 1,
          },
          'monaco',
        );
      };

      domNode.addEventListener('copy', handleCopy);
      bindPauseTimer();

      cleanupRef.current = () => {
        changeDisposable.dispose();
        cursorDisposable.dispose();
        pasteDisposable?.dispose();
        domNode.removeEventListener('copy', handleCopy);
        if (pauseTimerRef.current) {
          window.clearTimeout(pauseTimerRef.current);
          pauseTimerRef.current = null;
        }
      };
    },
    [bindPauseTimer, reporter],
  );

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const handleRun = useCallback(() => {
    reporter.recordEvent(
      'run',
      {
        file_id_hash: fileHashRef.current,
        language_id: 'python',
        trigger: 'button',
        result: 'unknown',
      },
      'workbench',
    );
    pushOutput('已记录 run 事件；当前只验证上报链路。', 'info');
    void reporter.flush();
  }, [pushOutput, reporter]);

  const handleSubmit = useCallback(() => {
    reporter.recordEvent(
      'submit',
      {
        file_id_hash: fileHashRef.current,
        language_id: 'python',
        trigger: 'button',
        result: 'unknown',
      },
      'workbench',
    );
    pushOutput('已记录 submit 事件；可用于演示状态刷新。', 'success');
    void reporter.flush();
  }, [pushOutput, reporter]);

  const handleEndSession = useCallback(async () => {
    await reporter.endSession();
    pushOutput('已发送 session.end，并触发一次强制 flush。', 'warn');
    await statePolling.refresh();
  }, [pushOutput, reporter, statePolling]);

  const pageTitle = useMemo(() => selectedTask?.title ?? '执行页 MVP', [selectedTask]);
  const reportSessionId = reporter.status.lastSessionId ?? statePolling.data?.current_session?.session_id ?? FALLBACK_SESSION_ID;
  const statusHistory = useMemo(() => createStatusHistoryItems(statePolling.history), [statePolling.history]);
  const syncState = useMemo(() => {
    if (reporter.status.lastError) {
      return {
        tone: 'warn' as const,
        label: '上报失败',
        detail: reporter.status.lastError,
      };
    }

    if (statePolling.error) {
      return {
        tone: 'warn' as const,
        label: '轮询失败',
        detail: statePolling.error,
      };
    }

    if (reporter.status.isFlushing || reporter.status.pendingCount > 0) {
      return {
        tone: 'pending' as const,
        label: '上报中',
        detail: `待发送 ${reporter.status.pendingCount} 条事件`,
      };
    }

    if (statePolling.loading || statePolling.refreshing) {
      return {
        tone: 'pending' as const,
        label: '同步中',
        detail: '正在拉取 latest_state',
      };
    }

    return {
      tone: 'ok' as const,
      label: '已同步',
      detail: statePolling.lastSuccessAt
        ? `状态已刷新于 ${new Date(statePolling.lastSuccessAt).toLocaleTimeString()}`
        : '等待首个状态结果',
    };
  }, [
    reporter.status.isFlushing,
    reporter.status.lastError,
    reporter.status.pendingCount,
    statePolling.error,
    statePolling.lastSuccessAt,
    statePolling.loading,
    statePolling.refreshing,
  ]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">React 执行页 MVP</p>
          <h1>{pageTitle}</h1>
        </div>
        <div className="header-meta">
          <span>user_local_id: {USER_LOCAL_ID}</span>
          <span>状态轮询: 3s</span>
          <button
            type="button"
            className="ghost-button"
            disabled={!reportSessionId}
            onClick={() => {
              if (reportSessionId) {
                onOpenReport?.(reportSessionId);
              }
            }}
          >
            打开复盘页
          </button>
        </div>
      </header>

      <main className="app-layout">
        <section className="main-column">
          <TaskBrief
            tasks={tasks}
            selectedTaskId={selectedTaskId}
            selectedTask={selectedTask}
            loading={tasksLoading}
            onSelectTask={setSelectedTaskId}
          />
          <MonacoWorkbench
            code={code}
            language="python"
            task={selectedTask}
            onCodeChange={setCode}
            onEditorMount={handleEditorMount}
            onRun={handleRun}
            onSubmit={handleSubmit}
            onEndSession={handleEndSession}
          />
          <RunResultPanel output={output} reporterStatus={reporter.status} />
          {tasksError ? <div className="error-banner">任务加载失败：{tasksError}</div> : null}
        </section>

        <StatusPanel
          viewModel={statePolling.panel}
          history={statusHistory}
          loading={statePolling.loading}
          refreshing={statePolling.refreshing}
          error={statePolling.error}
          historyError={statePolling.historyError}
          syncState={syncState}
        />
      </main>
    </div>
  );
}
