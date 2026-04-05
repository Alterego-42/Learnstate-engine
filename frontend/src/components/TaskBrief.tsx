import { useEffect, useMemo, useRef } from 'react';
import {
  REFERENCE_SECTION_TABS,
  getReferenceMaterial,
  type ReferenceSectionId,
} from '../config/referenceMaterials';
import type { TaskResponse } from '../types';

const TASK_NOTES: Record<string, string> = {
  'demo-two-sum':
    '目标：给定数组和目标值，返回两数下标。先明确暴力法，再收敛到哈希表方案。',
  'demo-binary-search':
    '目标：实现有序数组二分查找。先写循环不变量，再验证边界与 mid 更新。',
};

interface TaskBriefProps {
  tasks: TaskResponse[];
  selectedTaskId: string;
  selectedTask: TaskResponse | null;
  loading: boolean;
  referenceOpen: boolean;
  activeReferenceSection: ReferenceSectionId;
  onSelectTask: (taskId: string) => void;
  onToggleReference: (nextOpen: boolean) => void;
  onSelectReferenceSection: (sectionId: ReferenceSectionId) => void;
  onReferenceScroll: (sectionId: ReferenceSectionId, scrollTop: number, scrollHeight: number, clientHeight: number) => void;
}

export function TaskBrief({
  tasks,
  selectedTaskId,
  selectedTask,
  loading,
  referenceOpen,
  activeReferenceSection,
  onSelectTask,
  onToggleReference,
  onSelectReferenceSection,
  onReferenceScroll,
}: TaskBriefProps) {
  const referenceBodyRef = useRef<HTMLDivElement | null>(null);
  const referenceMaterial = useMemo(
    () => getReferenceMaterial(selectedTask),
    [selectedTask],
  );
  const referenceContent = useMemo(() => {
    if (activeReferenceSection === 'framework') {
      return referenceMaterial.frameworkTips;
    }
    if (activeReferenceSection === 'steps') {
      return referenceMaterial.studySteps;
    }
    return [referenceMaterial.goalText];
  }, [activeReferenceSection, referenceMaterial]);

  useEffect(() => {
    if (referenceBodyRef.current) {
      referenceBodyRef.current.scrollTop = 0;
    }
  }, [activeReferenceSection, selectedTaskId]);

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">练习任务</p>
          <h2>{selectedTask?.title ?? '加载任务中...'}</h2>
        </div>
        <select
          className="task-select"
          value={selectedTaskId}
          onChange={(event) => onSelectTask(event.target.value)}
          disabled={loading || tasks.length === 0}
        >
          {tasks.map((task) => (
            <option key={task.task_id} value={task.task_id}>
              {task.title}
            </option>
          ))}
        </select>
      </div>

      <p className="task-note">
        {selectedTask ? TASK_NOTES[selectedTask.task_id] ?? '当前任务暂无额外说明。' : '正在拉取任务说明。'}
      </p>

      <div className="task-meta">
        <span>类型：{selectedTask?.task_type ?? '-'}</span>
        <span>难度：{selectedTask?.difficulty_level ?? '-'}</span>
        <span>标签：{selectedTask?.knowledge_tags.join(' / ') || '-'}</span>
      </div>

      <div className="reference-card">
        <div className="reference-header">
          <div>
            <p className="eyebrow">学习参考区</p>
            <strong>{referenceMaterial.taskTitle}</strong>
          </div>
          <button
            type="button"
            className="reference-toggle"
            onClick={() => onToggleReference(!referenceOpen)}
          >
            {referenceOpen ? '收起参考' : '展开参考'}
          </button>
        </div>

        {referenceOpen ? (
          <>
            <div className="reference-tabs" role="tablist" aria-label="学习参考分区">
              {REFERENCE_SECTION_TABS.map((tabItem) => (
                <button
                  key={tabItem.id}
                  type="button"
                  role="tab"
                  aria-selected={tabItem.id === activeReferenceSection}
                  className={
                    tabItem.id === activeReferenceSection
                      ? 'reference-tab active'
                      : 'reference-tab'
                  }
                  onClick={() => onSelectReferenceSection(tabItem.id)}
                >
                  {tabItem.label}
                </button>
              ))}
            </div>

            <div
              ref={referenceBodyRef}
              className="reference-body"
              onScroll={(event) => {
                onReferenceScroll(
                  activeReferenceSection,
                  event.currentTarget.scrollTop,
                  event.currentTarget.scrollHeight,
                  event.currentTarget.clientHeight,
                );
              }}
            >
              {activeReferenceSection === 'goal' ? (
                <p className="reference-goal">{referenceMaterial.goalText}</p>
              ) : (
                <ol className="reference-list">
                  {referenceContent.map((itemText) => (
                    <li key={itemText}>{itemText}</li>
                  ))}
                </ol>
              )}

              <div className="reference-tags">
                {referenceMaterial.knowledgeTags.map((tagName) => (
                  <span key={tagName} className="reference-tag">
                    {tagName}
                  </span>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="reference-collapsed">参考区已收起，编码区可保持完整视野。</p>
        )}
      </div>
    </section>
  );
}
