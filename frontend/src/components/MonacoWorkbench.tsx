import Editor from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type { TaskResponse } from '../types';

interface MonacoWorkbenchProps {
  code: string;
  language: string;
  task: TaskResponse | null;
  onCodeChange: (value: string) => void;
  onEditorMount: (editor: editor.IStandaloneCodeEditor) => void;
  onRun: () => void;
  onSubmit: () => void;
  onEndSession: () => void;
}

export function MonacoWorkbench({
  code,
  language,
  task,
  onCodeChange,
  onEditorMount,
  onRun,
  onSubmit,
  onEndSession,
}: MonacoWorkbenchProps) {
  return (
    <section className="panel workbench-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">编码区</p>
          <h2>{task?.title ?? 'Monaco Editor'}</h2>
        </div>
        <div className="toolbar">
          <button className="ghost-button" onClick={onEndSession} type="button">
            结束本轮
          </button>
          <button className="ghost-button" onClick={onRun} type="button">
            运行
          </button>
          <button className="primary-button" onClick={onSubmit} type="button">
            提交
          </button>
        </div>
      </div>

      <Editor
        height="460px"
        defaultLanguage={language}
        language={language}
        theme="vs-dark"
        value={code}
        onChange={(value) => onCodeChange(value ?? '')}
        onMount={onEditorMount}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
        }}
      />
    </section>
  );
}
