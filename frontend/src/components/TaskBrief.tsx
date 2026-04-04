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
  onSelectTask: (taskId: string) => void;
}

export function TaskBrief({
  tasks,
  selectedTaskId,
  selectedTask,
  loading,
  onSelectTask,
}: TaskBriefProps) {
  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">任务</p>
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
    </section>
  );
}
