#Agent B
```ts
export type EventType =
  | 'edit.insert'
  | 'edit.delete'
  | 'edit.replace'
  | 'cursor.move'
  | 'cursor.pause'
  | 'clipboard.copy'
  | 'clipboard.paste'
  | 'run'
  | 'submit'
  | 'session.end';

export type ISODateTimeString = string;

export type PayloadScalar = string | number | boolean | null;

export type PayloadSummary = Record<string, PayloadScalar>;

export interface EventItem<TPayload extends PayloadSummary = PayloadSummary> {
  event_type: EventType;
  event_time: ISODateTimeString;
  payload_summary: TPayload;
}

export interface EditInsertPayload extends PayloadSummary {
  seq: number;
  file_id_hash: string;
  language_id: string;
  change_count: number;
  inserted_chars: number;
  start_line: number;
  end_line: number;
  start_offset: number;
  end_offset: number;
  model_version_id: number;
  is_undoing?: boolean;
  is_redoing?: boolean;
}

export interface EditDeletePayload extends PayloadSummary {
  seq: number;
  file_id_hash: string;
  language_id: string;
  change_count: number;
  deleted_chars: number;
  start_line: number;
  end_line: number;
  start_offset: number;
  end_offset: number;
  model_version_id: number;
  is_undoing?: boolean;
  is_redoing?: boolean;
}

export interface EditReplacePayload extends PayloadSummary {
  seq: number;
  file_id_hash: string;
  language_id: string;
  change_count: number;
  inserted_chars: number;
  deleted_chars: number;
  start_line: number;
  end_line: number;
  start_offset: number;
  end_offset: number;
  model_version_id: number;
  is_undoing?: boolean;
  is_redoing?: boolean;
}

export interface CursorMovePayload extends PayloadSummary {
  seq: number;
  file_id_hash: string;
  language_id: string;
  line: number;
  column: number;
  offset: number;
  move_distance?: number;
  reason?: 'keyboard' | 'mouse' | 'api' | 'unknown';
}

export interface CursorPausePayload extends PayloadSummary {
  seq: number;
  file_id_hash: string;
  language_id: string;
  line: number;
  column: number;
  offset: number;
  duration_ms: number;
}

export interface ClipboardCopyPayload extends PayloadSummary {
  seq: number;
  file_id_hash: string;
  language_id: string;
  selection_chars: number;
  selection_lines?: number;
}

export interface ClipboardPastePayload extends PayloadSummary {
  seq: number;
  file_id_hash: string;
  language_id: string;
  selection_chars: number;
  selection_lines?: number;
}

export interface RunPayload extends PayloadSummary {
  seq: number;
  file_id_hash: string;
  language_id: string;
  trigger: 'button' | 'shortcut' | 'command';
  result?: 'success' | 'failure' | 'unknown';
}

export interface SubmitPayload extends PayloadSummary {
  seq: number;
  file_id_hash: string;
  language_id: string;
  trigger: 'button' | 'shortcut' | 'command';
  result?: 'success' | 'failure' | 'unknown';
}

export interface SessionEndPayload extends PayloadSummary {
  seq: number;
  reason: 'task_close' | 'inactive_timeout' | 'hard_limit' | 'manual' | 'unload';
  session_duration_ms: number;
  file_id_hash?: string;
  language_id?: string;
}

export type EditInsertEventItem = EventItem<EditInsertPayload> & {
  event_type: 'edit.insert';
};

export type EditDeleteEventItem = EventItem<EditDeletePayload> & {
  event_type: 'edit.delete';
};

export type EditReplaceEventItem = EventItem<EditReplacePayload> & {
  event_type: 'edit.replace';
};

export type CursorMoveEventItem = EventItem<CursorMovePayload> & {
  event_type: 'cursor.move';
};

export type CursorPauseEventItem = EventItem<CursorPausePayload> & {
  event_type: 'cursor.pause';
};

export type ClipboardCopyEventItem = EventItem<ClipboardCopyPayload> & {
  event_type: 'clipboard.copy';
};

export type ClipboardPasteEventItem = EventItem<ClipboardPastePayload> & {
  event_type: 'clipboard.paste';
};

export type RunEventItem = EventItem<RunPayload> & {
  event_type: 'run';
};

export type SubmitEventItem = EventItem<SubmitPayload> & {
  event_type: 'submit';
};

export type SessionEndEventItem = EventItem<SessionEndPayload> & {
  event_type: 'session.end';
};

export type FrontendEventItem =
  | EditInsertEventItem
  | EditDeleteEventItem
  | EditReplaceEventItem
  | CursorMoveEventItem
  | CursorPauseEventItem
  | ClipboardCopyEventItem
  | ClipboardPasteEventItem
  | RunEventItem
  | SubmitEventItem
  | SessionEndEventItem;

export interface PostEventsRequest {
  events: FrontendEventItem[];
}
```







#Agent D
1. 已完成
- 已落最小 React 执行页 MVP：任务说明 + Monaco + 运行结果区 + 右侧状态面板，入口在 `E:\clawSpace\NewProject\frontend\src\App.tsx:51`
- 已接 Monaco 可编辑与事件上报：编辑、光标移动/停顿、复制、粘贴、运行、提交、结束会话，接入点在 `E:\clawSpace\NewProject\frontend\src\App.tsx:137`、`E:\clawSpace\NewProject\frontend\src\App.tsx:177`、`E:\clawSpace\NewProject\frontend\src\App.tsx:209`、`E:\clawSpace\NewProject\frontend\src\App.tsx:255`、`E:\clawSpace\NewProject\frontend\src\App.tsx:296`
- 已做事件批量上报与 2s flush：`E:\clawSpace\NewProject\frontend\src\hooks\useEventReporter.ts:19`
- 已做右侧状态 3s 轮询：`E:\clawSpace\NewProject\frontend\src\hooks\useStatePolling.ts:6`
- 已做 daemon 代理，避免本地开发跨域：`E:\clawSpace\NewProject\frontend\vite.config.ts:3`
- 已完成构建自检：`cd E:\clawSpace\NewProject\frontend && npm run build`

2. 页面/组件结构
- 页面编排：`App` 负责任务选择、Monaco 事件绑定、上报、状态轮询，见 `E:\clawSpace\NewProject\frontend\src\App.tsx:51`
- 任务区：`TaskBrief` 展示任务标题/难度/标签/本地说明，见 `E:\clawSpace\NewProject\frontend\src\components\TaskBrief.tsx:1`
- 编辑区：`MonacoWorkbench` 承载 Monaco 与运行/提交/结束按钮，见 `E:\clawSpace\NewProject\frontend\src\components\MonacoWorkbench.tsx:1`
- 结果区：`RunResultPanel` 展示最近上报、按钮动作、错误信息，见 `E:\clawSpace\NewProject\frontend\src\components\RunResultPanel.tsx:1`
- 状态区：`StatusPanel` 只展示主状态、次状态、confidence、evidence summary、trigger_ready，并给出“是否要调整”，见 `E:\clawSpace\NewProject\frontend\src\components\StatusPanel.tsx:9`

3. 依赖的接口字段
- `GET /api/tasks`：用 `task_id`、`title`、`task_type`、`difficulty_level`、`knowledge_tags`，接在 `E:\clawSpace\NewProject\frontend\src\hooks\useDaemonTasks.ts:12`
- `GET /api/tasks/:id`：同字段，用于当前任务详情，接在 `E:\clawSpace\NewProject\frontend\src\hooks\useDaemonTasks.ts:30`
- `POST /api/events`：顶层用 `user_local_id`、`task_id`、`events[]`；单事件用 `event_type`、`event_time`、`payload_summary`、`source`，接在 `E:\clawSpace\NewProject\frontend\src\hooks\useEventReporter.ts:45`
- Monaco payload 已按 daemon 实现补字段：`seq`、`file_id_hash`、`language_id`、`insert_chars`、`delete_chars`、`pause_time_ms`、`selection_chars`、`trigger`、`result`、`reason`、`session_duration_ms`，见 `E:\clawSpace\NewProject\frontend\src\App.tsx:154`
- `GET /api/state/current`：状态面板映射为  
  - 主状态 = `latest_state.top_states[0].state_key`  
  - 次状态 = `latest_state.top_states[1].state_key`  
  - confidence = `latest_state.confidence`  
  - evidence_summary.short_text = 先尝试 parse `latest_state.evidence_summary`，否则直接展示字符串  
  - trigger_ready = `latest_state.top_states[0].trigger_ready`  
  映射逻辑在 `E:\clawSpace\NewProject\frontend\src\utils\state.ts:89`
- `GET /api/state/history`：当前未接 UI，留给下一步状态时间轴/复盘

4. 当前阻塞
- daemon 冻结模型里 `evidence_summary` 仍是字符串，不是结构化对象；前端已兼容，但 `short_text` 不是强保证
- 当前没有真实代码执行接口，所以“运行结果区”现在是演示日志，不是真实 runner 输出
- 如果推理模块还没持续写入 `state_vectors`，右侧会显示“暂无”而不是完整状态
- 现在依赖 Vite 代理开发；若要独立部署前端，还需要同源托管或后端放开 CORS

5. 建议我协调的依赖
- 请协调 Agent C/daemon 固定 `top_states` 的 key 口径，至少明确 `state_key` 与 `trigger_ready`
- 请协调后端确认 `evidence_summary` 最终到底是纯字符串还是 JSON 字符串
- 请协调是否需要一个真实 `run` 执行链路；如果比赛演示只看行为采集，当前版本已够
- 请协调前后端最终集成方式：继续 Vite 代理，还是把静态页挂到 daemon 同源

6. 下一步
- 我可以继续把 `GET /api/state/history` 接成一个轻量“最近状态变化”时间轴
- 我可以补一个更明确的“上报中/上报失败/已同步”状态条，方便演示
- 你现在可直接启动：daemon 跑 `uvicorn app.main:app --reload --host 127.0.0.1 --port 8765`，前端跑 `cd E:\clawSpace\NewProject\frontend && npm run dev`
- 如果你要，我下一轮直接补“历史状态时间轴 + demo 讲解路径”






#Agent E
1. 已完成
- 基于 `E:\clawSpace\NewProject\PRD.md` 与冻结接口，整理出单次 session 复盘页 MVP 的 `report schema v1`
- 定义了时间轴节点、转折点识别、阻滞来源归因、建议生成模板
- 方案只依赖 `session / task / summary / snapshots / states`
- 方案只消费状态历史与快照摘要，不读源码，不依赖 LLM 才能生成报告
- 建议条数固定控制为 `2-3` 条

2. report/时间轴定义
- `report schema v1` 建议为前端消费的结构化对象：
```json
{
  "version": "v1",
  "session_id": "string",
  "generated_at": "ISO datetime",
  "source": {
    "session": {},
    "task": {},
    "summary": {},
    "snapshots_count": 0,
    "states_count": 0
  },
  "overview": {
    "title": "string",
    "duration_sec": 0,
    "task_title": "string",
    "difficulty_level": "string|null",
    "dominant_state": "string",
    "dominant_state_group": "推进|探索|阻滞|混乱|注意力",
    "turning_point_count": 0,
    "primary_blocker": "string|null"
  },
  "timeline": [
    {
      "node_id": "string",
      "start_time": "ISO datetime",
      "end_time": "ISO datetime",
      "duration_sec": 0,
      "state_group": "推进|探索|阻滞|混乱|注意力",
      "primary_state": "string",
      "secondary_state": "string|null",
      "avg_confidence": 0.0,
      "friction_level": "smooth|minor_friction|backtracking_loop|high_resistance_stall|null",
      "rhythm_label": "steady|burst|fragmented|prolonged_idle|null",
      "evidence_summary": ["string"],
      "snapshot_refs": ["snapshot_id"],
      "is_turning_point": false,
      "blocker_tag": "string|null"
    }
  ],
  "turning_points": [
    {
      "node_id": "string",
      "type": "downturn|recovery|strategy_shift",
      "title": "string",
      "reason": "string",
      "before_state": "string",
      "after_state": "string",
      "evidence_summary": ["string"],
      "impact_score": 0.0
    }
  ],
  "blockers": [
    {
      "type": "looping_backtrack|structural_stuck|chaotic_trial|long_idle|attention_drop",
      "label": "string",
      "severity": "low|medium|high",
      "duration_sec": 0,
      "occurrences": 0,
      "evidence_summary": ["string"]
    }
  ],
  "recommendations": [
    {
      "id": "string",
      "text": "string",
      "reason": "string",
      "source_blocker": "string"
    }
  ]
}
```
- 时间轴节点定义：
  - 以 `states` 为主，`snapshots` 为证据补充
  - 将“相邻且主状态组不变”的连续状态段合并为一个节点
  - 节点最小字段：开始/结束时间、主状态、次状态、均值置信度、evidence_summary、关联快照
  - 节点展示颜色按状态组映射：推进绿、探索蓝、阻滞橙、混乱红、注意力灰
- 节点合并规则：
  - `primary_state` 相同，或 `state_group` 相同且语义连续，则合并
  - 若相邻节点间隔很短且无明显维度跳变，也合并
  - 合并后保留该段最高频 `primary_state` 与聚合 `evidence_summary`

3. 关键规则
- 转折点识别规则：
  - 规则 1：状态组切换  
    `推进/探索 -> 阻滞/混乱`，或 `阻滞/混乱 -> 推进`，记为候选转折点
  - 规则 2：阻滞升级  
    `friction` 从 `smooth/minor_friction` 升到 `backtracking_loop/high_resistance_stall`，且持续至少 `2` 个状态点，记为候选
  - 规则 3：节奏断裂  
    `rhythm` 进入 `fragmented/prolonged_idle`，且后续持续一段窗口，记为候选
  - 规则 4：恢复拐点  
    连续阻滞后回到 `稳定推进/谨慎推进/局部调试`，且置信度回升，记为恢复型转折点
  - 规则 5：只保留 `1-3` 个  
    按 `影响分 = 持续时长 × 状态跃迁强度 × 平均置信度` 排序，取前 `1-3`
- 阻滞来源归因规则：
  - `looping_backtrack`：反复回退、重复尝试、evidence 指向来回修改
  - `structural_stuck`：结构性卡住、高摩擦停滞、evidence 指向方案不成立或路径断裂
  - `chaotic_trial`：高频试错、无效尝试、探索无方向
  - `long_idle`：长停滞、短暂停顿过长、节奏中断明显
  - `attention_drop`：注意力下降、碎片化明显、状态切换过快
  - 归因优先级：先看 `friction`，再看 `rhythm`，最后看 `exploration/stability`
- 建议模板：
  - 对 `looping_backtrack`：`先锁定一个子问题，再继续改。`
  - 对 `structural_stuck`：`先换成更小的验证路径。`
  - 对 `chaotic_trial`：`下一轮只保留一种尝试方向。`
  - 对 `long_idle`：`先写下当前卡点，再开始下一步。`
  - 对 `attention_drop`：`先收敛目标，只做一个最小动作。`
  - 对 `恢复拐点`：`刚才有效，沿这条路径继续细化。`
- 建议生成约束：
  - 只选 `2-3` 条
  - 每条不超过一行，短句化
  - 必须绑定具体 blocker 或 turning point
  - 相同含义不重复
  - 不输出说教句，不输出泛化鸡汤

4. 当前阻塞
- `summary` 的字段结构还未冻结，当前只能把它当补充摘要源，不能作为强依赖
- `snapshots` 是否包含稳定的 `window_start/window_end/feature_values` 还需接口确认
- `states.top_states` 的枚举是否已与 PRD 展示层状态完全对齐，尚未看到冻结定义
- 时间轴节点的“最小持续时长”与“相邻节点合并阈值”还需要产品/后端拍板一次

5. 建议我协调的依赖
- 请后端冻结 `GET /api/session/{id}/report` 的返回字段样例，尤其是 `summary / snapshots / states`
- 请统一 `states` 的展示层枚举：至少固定 `推进/探索/阻滞/混乱/注意力` 与对应英文 key
- 请确认时间字段格式统一为 ISO 字符串，避免前端自行猜测时区
- 请确认报告计算放在 daemon 还是前端：
  - 若要复用与可测，建议 daemon 产出结构化 report
  - 若要先快出页面，建议前端先做 `v1 derivation`

6. 下一步
- 我可以继续产出一版 `report schema.ts / zod schema` 与 mock 数据
- 然后补一版复盘页信息架构：顶部概要、中部时间轴、右侧转折点/阻滞、底部建议
- 如果你同意，我下一步直接给出前端可落地的字段类型和页面区块草图





#Agent F
**1. 已完成**
- 已基于唯一真源 `E:\clawSpace\NewProject\PRD.md:83`、`E:\clawSpace\NewProject\PRD.md:145`、`E:\clawSpace\NewProject\PRD.md:170`、`E:\clawSpace\NewProject\PRD.md:744` 收敛出“比赛版只验收闭环”的口径。
- 已确认当前可用链路：本地 daemon、`POST /api/events`、`FeatureSnapshot v1`、`GET /api/state/current`、`GET /api/session/{id}/report` 已有骨架，见 `E:\clawSpace\NewProject\daemon\API_CONTRACT.md:74`、`E:\clawSpace\NewProject\daemon\API_CONTRACT.md:167`、`E:\clawSpace\NewProject\daemon\API_CONTRACT.md:188`、`E:\clawSpace\NewProject\daemon\API_CONTRACT.md:210`。
- 已确认当前最大事实阻塞：`StateVector` 还未真正接通时，`latest_state` 会是 `null`，见 `E:\clawSpace\NewProject\daemon\API_CONTRACT.md:198`、`E:\clawSpace\NewProject\daemon\app\main.py:99`。
- 已确认内置 demo 题可直接用 `demo-two-sum`，见 `E:\clawSpace\NewProject\daemon\app\database.py:150`。

**2. 验收清单 / demo 流程**
- **验收清单**
- `P0-1` daemon 本地启动成功，`/`、`/api/tasks`、`/api/settings` 可访问。
- `P0-2` 选择 `demo-two-sum` 后，前端或脚本能成功写入一批事件到 `POST /api/events`。
- `P0-3` 系统自动创建/延续 session，`RawEvent` 入库且不含源码正文。
- `P0-4` 事件提交后生成 `FeatureSnapshot v1`，至少能看到 `delete_ratio`、`pause_ratio`、`backtrack_loop_score`、`attempt_freq_per_min`。
- `P0-5` `StateVector` 写回打通后，`GET /api/state/current` 能返回 `top_states + confidence + evidence_summary`，不再是 `null`。
- `P0-6` `session.end` 后，`GET /api/session/{id}/report` 返回 session、snapshots、states，形成“执行中 + 结束后”的闭环。
- `P0-7` 演示期间只保留 1 个任务、1 条主链路、1 组状态变化；不演示知识图谱、AI 教练、多任务切换。
- `P0-8` 若实时提醒不稳，则降级为“只展示状态，不自动打断”；闭环仍算通过。

- **3-5 分钟 demo 流程**
- `0:00-0:30` 一句话开场：我们不是判题，而是识别“正在有效思考还是已经卡住”。
- `0:30-1:00` 打开本地服务，展示任务列表里已有 `demo-two-sum`。
- `1:00-2:20` 进入执行页做一次算法题：先写一个低效/错误思路，制造删除、停顿、反复运行。
- `2:20-3:00` 展示状态变化：从 `local_debugging / careful_progression` 转到 `looping / minor_stuck`，右侧只讲一句因果解释。
- `3:00-3:40` 切到正确思路（哈希表），再次运行成功，状态回到 `steady_flow` 或 `careful_progression`。
- `3:40-4:30` 结束 session，进入复盘页，展示时间轴、关键转折点、主要阻滞来源、2-3 条建议。
- `4:30-5:00` 收尾：强调本地优先、无源码上传、可解释状态轨迹。

- **样例任务建议**
- 首选：`Two Sum`，直接复用内置任务 `demo-two-sum`。
- 演示脚本：先写双重循环或边界错误 → 多次删除/运行报错 → 停顿思考 → 切成哈希表解法 → 运行成功。
- 选择原因：题目短、行为变化明显、最容易稳定打出“探索→卡顿→恢复推进”的状态转折。

- **答辩亮点**
- 不是看最终 AC，而是看“过程信号”。
- 本地优先，不上传原始代码，隐私边界清楚。
- `FeatureSnapshot -> StateVector -> 执行页/复盘页` 可解释，不是黑箱。
- 比赛版只做编程学习单场景，边界清晰，取舍合理。

**3. 风险与回退**
- **最高风险**：`StateVector` 未接通；回退为预写入一条完整 demo session，只演示读取链路，不现场赌实时推理。
- **第二风险**：执行页不稳；回退为直接展示 `GET /api/state/current` / `history` 的 JSON 或 Swagger。
- **第三风险**：复盘页不稳；回退为直接展示 `GET /api/session/{id}/report` 返回的 session、snapshots、states。
- **第四风险**：自动提醒误判；直接删掉“自动提醒”，只保留被动状态展示。
- **删减顺序**：先删实时提醒，再删花哨图表，再删多任务/知识图谱；不删事件入库、状态输出、复盘闭环。

**4. 当前阻塞**
- `StateVector` 写回尚未真正接上读取链路，当前 `latest_state` 可能为空，见 `E:\clawSpace\NewProject\daemon\API_CONTRACT.md:198`。
- `FeatureSnapshot v1` 和 Agent C 的规则字段名还没完全冻结，当前存在映射缺口。
- 执行页 / 复盘页还在接入中，比赛版 UI 读哪些字段需要立刻定死。
- 还缺一份“固定 demo 行为脚本/录屏备份”，否则现场演示波动较大。

**5. 建议我协调的依赖**
- 先拍板 `StateVector v1` 最小结构与写回方式：直接写 SQLite，不再加新 API。
- 先拍板特征映射表：把 `edit_interval_cv -> cv_inter_edit_gap`、`pause_ratio -> idle_ratio`、`max_pause_ms/pause_ratio -> long_pause_ratio` 这类口径统一。
- 要前端只消费 3 个接口：`/api/state/current`、`/api/state/history`、`/api/session/{id}/report`，别再扩接口。
- 要前端把 demo 固定到 `demo-two-sum`，不要临时换题。
- 要总控准备双方案：主方案实机演示，回退方案用预置 session + API 页面。

**6. 下一步**
- 先冻结 `demo-two-sum` 脚本和状态转折话术。
- 再打通 `FeatureSnapshot -> StateVector -> current/history/report` 最小链路。
- 然后做 1 次全链路彩排，只验“能否完整走完一次 session”。
- 如果你要，我下一轮可以直接把这份内容落成一页 `demo-checklist.md`。