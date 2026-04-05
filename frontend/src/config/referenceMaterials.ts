import type { TaskResponse } from '../types';

export type ReferenceSectionId = 'goal' | 'framework' | 'steps';

export interface LearningReferenceMaterial {
  referenceId: string;
  taskTitle: string;
  goalText: string;
  knowledgeTags: string[];
  frameworkTips: string[];
  studySteps: string[];
}

const REFERENCE_MATERIAL_BY_TASK: Record<string, LearningReferenceMaterial> = {
  'demo-two-sum': {
    referenceId: 'demo-two-sum-reference',
    taskTitle: '两数之和',
    goalText: '在数组中找到两个数，使它们的和等于目标值，并返回这两个数的下标。重点是把“找另一半”转化为“边遍历边查表”。',
    knowledgeTags: ['哈希表', '一次遍历', '查找优化', '边界检查'],
    frameworkTips: [
      '先写朴素双循环，明确答案下标与“target - 当前值”的关系。',
      '再改成哈希表：遍历时先查 need 是否出现过，命中就立即返回。',
      '哈希表里存“值 -> 下标”，更新顺序放在查找之后，避免同一元素被重复使用。',
    ],
    studySteps: [
      '先用自己的话复述题意，确认返回的是下标，不是数值本身。',
      '先写 O(n²) 朴素法，跑通样例后再替换为哈希表方案。',
      '补两个自测样例：重复元素、答案出现在数组末尾。',
    ],
  },
  'demo-binary-search': {
    referenceId: 'demo-binary-search-reference',
    taskTitle: '二分查找',
    goalText: '在有序数组中定位目标值下标；若不存在则返回 -1。关键是每轮都能稳定缩小搜索区间。',
    knowledgeTags: ['二分边界', '循环不变量', 'mid 更新', '有序数组'],
    frameworkTips: [
      '先定搜索区间含义：left/right 都是闭区间端点，循环条件用 left <= right。',
      '比较 nums[mid] 与 target 后，只保留仍可能包含答案的一侧。',
      '每轮都必须让边界移动，避免 left/right 卡住形成死循环。',
    ],
    studySteps: [
      '先画 5 个元素的小数组，手推 left/right/mid 的变化。',
      '再补“找不到目标值”的分支，验证循环退出后返回 -1。',
      '最后专门测首元素、尾元素、单元素数组三个边界样例。',
    ],
  },
};

const FALLBACK_REFERENCE: LearningReferenceMaterial = {
  referenceId: 'generic-task-reference',
  taskTitle: '当前练习',
  goalText: '先明确输入、输出和正确性条件，再从可运行的朴素方案开始迭代。',
  knowledgeTags: ['题意澄清', '方案拆解', '自测验证'],
  frameworkTips: [
    '先写出最直接的解法，把变量含义和返回值规则固定下来。',
    '再观察重复计算或边界分支，寻找可以收敛的优化点。',
    '每做一步改动，都保留一个能立即自测的小样例。',
  ],
  studySteps: [
    '先复述题意并列出 1 个正向样例。',
    '再写朴素实现，确认能得到正确输出。',
    '最后补边界测试，整理可以继续优化的地方。',
  ],
};

export const REFERENCE_SECTION_TABS: Array<{ id: ReferenceSectionId; label: string }> = [
  { id: 'goal', label: '题目目标' },
  { id: 'framework', label: '思路框架' },
  { id: 'steps', label: '学习步骤' },
];

export function getReferenceMaterial(task: TaskResponse | null): LearningReferenceMaterial {
  if (!task) {
    return FALLBACK_REFERENCE;
  }

  const material = REFERENCE_MATERIAL_BY_TASK[task.task_id];
  if (material) {
    return {
      ...material,
      taskTitle: task.title,
      knowledgeTags: task.knowledge_tags.length > 0 ? task.knowledge_tags : material.knowledgeTags,
    };
  }

  return {
    ...FALLBACK_REFERENCE,
    referenceId: `${task.task_id}-reference`,
    taskTitle: task.title,
    knowledgeTags: task.knowledge_tags.length > 0 ? task.knowledge_tags : FALLBACK_REFERENCE.knowledgeTags,
  };
}
