#Agent A
**已更新**
- 冻结版已落地：`/api/events` 顶层协议不变，仍走 SQLite 直写；排序补了 `event_time + payload_summary.seq`，见 `E:\clawSpace\NewProject\daemon\app\main.py:52`
- `FeatureSnapshot v1` 已实现，兼容事件类型清单见 `E:\clawSpace\NewProject\daemon\app\services\snapshot_service.py:12`
- 文档示例已同步，见 `E:\clawSpace\NewProject\daemon\API_CONTRACT.md:74`

**更新后的 `/api/events` request 示例**
```json
{
  "user_local_id": "local-demo-user",
  "task_id": "demo-two-sum",
  "events": [
    {
      "event_type": "edit.insert",
      "event_time": "2026-04-04T15:00:01Z",
      "payload_summary": {
        "seq": 101,
        "file_id_hash": "f_9ab31c",
        "language_id": "python",
        "insert_chars": 18
      },
      "source": "monaco"
    },
    {
      "event_type": "cursor.pause",
      "event_time": "2026-04-04T15:00:06Z",
      "payload_summary": {
        "seq": 102,
        "file_id_hash": "f_9ab31c",
        "pause_time_ms": 2200
      },
      "source": "monaco"
    },
    {
      "event_type": "run",
      "event_time": "2026-04-04T15:00:08Z",
      "payload_summary": {
        "seq": 103,
        "file_id_hash": "f_9ab31c",
        "result": "error"
      },
      "source": "runner"
    }
  ]
}
```

**FeatureSnapshot 实际字段**
- `event_count`
- `edit_count`
- `insert_chars`
- `delete_chars`
- `replace_count`
- `pause_count`
- `pause_time_ms`
- `max_pause_ms`
- `run_count`
- `submit_count`
- `distinct_file_count`
- `delete_ratio`
- `edit_interval_mean_ms`
- `edit_interval_cv`
- `pause_ratio`
- `backtrack_loop_score`
- `attempt_freq_per_min`
- `branch_switch_score`
- 实现位置：`E:\clawSpace\NewProject\daemon\app\services\snapshot_service.py:51`

**前端是否需要补 payload 字段**
- **建议必补**：`seq`、`file_id_hash`、`insert_chars`（`edit.insert`）、`delete_chars`（`edit.delete`）、`pause_time_ms`（`cursor.pause`）
- **建议补充**：`result`（`run/submit`）、`language_id`
- **可选**：`duration_ms` 可作为 `pause_time_ms` 兜底；`edit.replace` 当前只计数，不强依赖额外字段
- **不补的影响**：`distinct_file_count`、`branch_switch_score`、字符级编辑指标、暂停指标会降级为 `0` 或偏弱估计

要的话，我下一步可以直接给前端一份“事件上报字段对照表”。









#Agent B
1. 已完成
- 按冻结版收敛为适配 Agent A 现有 `POST /api/events`，不再新增 `EventBatch` 顶层协议。
- 事件类型已统一为：`edit.insert`、`edit.delete`、`edit.replace`、`cursor.move`、`cursor.pause`、`clipboard.copy`、`clipboard.paste`、`run`、`submit`、`session.end`。
- 约束已对齐 `E:\clawSpace\NewProject\PRD.md:336`、`E:\clawSpace\NewProject\PRD.md:351`、`E:\clawSpace\NewProject\PRD.md:430`、`E:\clawSpace\NewProject\PRD.md:442`、`E:\clawSpace\NewProject\PRD.md:560`、`E:\clawSpace\NewProject\PRD.md:585`。
- 滑窗改为 `30s window / 5s hop`。

2. 事件/特征定义
- **A 的 `EventItem` 假设**
```ts
type EventItem = {
  session_id: string;
  event_type: string;
  event_time: number; // epoch ms
  payload_summary: Record<string, number | string | boolean | null>;
};
```
- **FrontendEvent -> EventItem 映射表**

| FrontendEvent | `event_type` | `event_time` | `payload_summary` 最小内容 |
|---|---|---:|---|
| 编辑插入 | `edit.insert` | 变更发生时 | `seq,file_id_hash,language_id,change_count,inserted_chars,start_line,end_line,start_offset,end_offset,model_version_id,is_undoing,is_redoing` |
| 编辑删除 | `edit.delete` | 变更发生时 | `seq,file_id_hash,language_id,change_count,deleted_chars,start_line,end_line,start_offset,end_offset,model_version_id,is_undoing,is_redoing` |
| 编辑替换 | `edit.replace` | 变更发生时 | `seq,file_id_hash,language_id,change_count,inserted_chars,deleted_chars,start_line,end_line,start_offset,end_offset,model_version_id,is_undoing,is_redoing` |
| 光标移动 | `cursor.move` | 位置变化时 | `seq,file_id_hash,language_id,line,column,offset,move_distance,reason` |
| 光标停留 | `cursor.pause` | 停留结束时 | `seq,file_id_hash,language_id,line,column,offset,duration_ms` |
| 复制 | `clipboard.copy` | copy 时 | `seq,file_id_hash,language_id,selection_chars,selection_lines` |
| 粘贴 | `clipboard.paste` | paste 时 | `seq,file_id_hash,language_id,selection_chars,selection_lines` |
| 运行 | `run` | 点击/快捷键时 | `seq,file_id_hash,language_id,trigger,result` |
| 提交 | `submit` | 点击/快捷键时 | `seq,file_id_hash,language_id,trigger,result` |
| 会话结束 | `session.end` | 结束时 | `seq,file_id_hash,language_id,reason,session_duration_ms` |

- **每类事件 `payload_summary` 最小字段表**
  - `edit.insert`
    - 必须：`seq`、`file_id_hash`、`language_id`、`change_count`、`inserted_chars`、`start_line`、`end_line`、`start_offset`、`end_offset`、`model_version_id`
    - 可选：`is_undoing`、`is_redoing`
  - `edit.delete`
    - 必须：`seq`、`file_id_hash`、`language_id`、`change_count`、`deleted_chars`、`start_line`、`end_line`、`start_offset`、`end_offset`、`model_version_id`
    - 可选：`is_undoing`、`is_redoing`
  - `edit.replace`
    - 必须：`seq`、`file_id_hash`、`language_id`、`change_count`、`inserted_chars`、`deleted_chars`、`start_line`、`end_line`、`start_offset`、`end_offset`、`model_version_id`
    - 可选：`is_undoing`、`is_redoing`
  - `cursor.move`
    - 必须：`seq`、`file_id_hash`、`language_id`、`line`、`column`、`offset`
    - 可选：`move_distance`、`reason`
  - `cursor.pause`
    - 必须：`seq`、`file_id_hash`、`language_id`、`line`、`column`、`offset`、`duration_ms`
  - `clipboard.copy`
    - 必须：`seq`、`file_id_hash`、`language_id`、`selection_chars`
    - 可选：`selection_lines`
  - `clipboard.paste`
    - 必须：`seq`、`file_id_hash`、`language_id`、`selection_chars`
    - 可选：`selection_lines`
  - `run`
    - 必须：`seq`、`file_id_hash`、`language_id`、`trigger`
    - 可选：`result`
  - `submit`
    - 必须：`seq`、`file_id_hash`、`language_id`、`trigger`
    - 可选：`result`
  - `session.end`
    - 必须：`seq`、`reason`、`session_duration_ms`
    - 可选：`file_id_hash`、`language_id`
- **前端必须上报的字段**
  - 顶层必须：`session_id`、`event_type`、`event_time`、`payload_summary`
  - `payload_summary` 内必须：`seq`
  - 编辑/光标/剪贴板必须：`file_id_hash`、`language_id`
  - 运行/提交必须：`trigger`
  - 会话结束必须：`reason`、`session_duration_ms`
- **前端采集器最小实现建议**
  - 单条事件直接适配 `EventItem`，放入内存队列。
  - `2s` 定时 flush，或累计 `20~50` 条立即 flush。
  - `visibilitychange`、`beforeunload`、`session.end` 强制 flush。
  - `cursor.move` 节流 `250ms`；`cursor.pause` 用 `2000ms` debounce 生成。
  - 特征窗口按 `30s` 聚合，每 `5s` 增量更新一次。
  - 不上传文本、选中文本、剪贴板原文、代码 diff。

3. 需要的 API/数据结构
- **对 Agent A 的最小适配**
```ts
type PostEventsRequest = {
  events: EventItem[];
};
```
- 若 Agent A 现接口不是 `events[]`，只做外层包装适配；`EventItem` 内容不变。
- **30s/5s 特征只依赖这些字段**
  - `delete_ratio`：`inserted_chars`、`deleted_chars`
  - `edit_interval_cv`：`event_time` of `edit.*`
  - `pause_ratio`：`cursor.pause.duration_ms`
  - `backtrack_loop_score`：`edit.*` 的 `start_offset/end_offset/model_version_id/is_undoing/is_redoing`
  - `attempt_freq_per_min`：`run`、`submit`
  - `branch_switch_score`：`file_id_hash` + 光标/编辑位置跳变
- **监听点归属**
  - Monaco 内
    - `edit.insert / edit.delete / edit.replace`：`onDidChangeModelContent`
    - `cursor.move`：`onDidChangeCursorPosition`
    - `cursor.pause`：基于 `onDidChangeCursorPosition` + debounce
    - `clipboard.paste`：`onDidPaste`
  - 页面壳
    - `clipboard.copy`：编辑器 DOM 容器 `copy` 事件
    - `run`：运行按钮、命令面板、快捷键入口
    - `submit`：提交按钮、命令面板、快捷键入口
    - `session.end`：路由离开、任务关闭、超时切分、窗口关闭
- **Monaco / 页面壳边界建议**
  - Monaco 采“编辑器内行为”。
  - 页面壳采“应用级动作与生命周期”。
  - `file_id_hash`、`language_id` 可由 Monaco 提供；`session_id`、`reason`、`result` 由页面壳补齐最稳。

4. 当前阻塞
- 还没看到 Agent A 的真实请求体字段名；若与上面假设不同，只需改外层键名，不影响事件语义。
- `result` 在 `run/submit` 上是“前端即时结果”还是“后端执行结果回填”，需要总控定一个口径。
- `session.end` 的触发优先级需要统一：`manual > hard_limit > inactive_timeout > unload` 还是别的顺序。

5. 建议我协调的依赖
- 请 Agent A 明确 `POST /api/events` 的 body 形状、单次最大条数、失败重试和去重策略。
- 请总控拍板 `run/submit.result` 枚举，建议：`success | failure | unknown`。
- 请页面壳负责人确认 `copy`、`run`、`submit`、`session.end` 的统一派发入口，避免多处重复上报。

6. 下一步
- 我可以下一步直接给出一版前端采集器伪代码/TypeScript 接口，按这套冻结字段落地。
- 如果你把 Agent A 的真实 `POST /api/events` 请求示例贴给我，我可以再压成最终对接版。








#Agent C
**精简后的规则表**

- `FeatureSnapshot v1` 仅读取这些字段，全部先归一到 `0..1`：
  - `delete_ratio`
  - `cv_inter_edit_gap`
  - `idle_ratio`
  - `long_pause_ratio`
  - `backtrack_loop_score`
  - `branch_switch_score`
  - `file_switch_rate`
  - `attempt_frequency`

- 接口定义：
```python
def infer_state(feature_snapshot: dict, prev_state: dict | None = None) -> dict:
    """
    feature_snapshot: {
        "snapshot_id": str,
        "session_id": str,
        "window_start": str,
        "window_end": str,
        "feature_values": {
            "delete_ratio": float,
            "cv_inter_edit_gap": float,
            "idle_ratio": float,
            "long_pause_ratio": float,
            "backtrack_loop_score": float,
            "branch_switch_score": float,
            "file_switch_rate": float,
            "attempt_frequency": float,
        }
    }
    prev_state: 上一个 StateVector v1，可为空
    return: StateVector v1
    """
```

- 常量表：
```python
RULES_V1 = {
    "weights": {
        "stability": {
            "cv_inter_edit_gap": 0.35,
            "delete_ratio": 0.20,
            "backtrack_loop_score": 0.30,
            "file_switch_rate": 0.15,
        },
        "exploration": {
            "branch_switch_score": 0.45,
            "file_switch_rate": 0.30,
            "attempt_frequency": 0.25,
        },
        "friction": {
            "backtrack_loop_score": 0.40,
            "idle_ratio": 0.25,
            "delete_ratio": 0.20,
            "cv_inter_edit_gap": 0.15,
        },
        "rhythm": {
            "cv_inter_edit_gap": 0.45,
            "idle_ratio": 0.30,
            "long_pause_ratio": 0.25,
        },
    },
    "smoothing": {
        "dimension_alpha": 0.35,
        "state_alpha": 0.30,
        "switch_margin": 0.12,
        "switch_confirm_frames": 2,
        "severe_state_bypass_score": 0.85,
    },
    "confidence": {
        "data_quality_weight": 0.30,
        "separation_weight": 0.35,
        "temporal_weight": 0.20,
        "evidence_weight": 0.15,
    },
    "reminder": {
        "high_confidence": 0.70,
        "cooldown_sec": 90,
        "min_consecutive_frames": 2,
    }
}
```

- 4 个维度公式：
```python
raw_stability = 1 - (
    0.35*f["cv_inter_edit_gap"] +
    0.20*f["delete_ratio"] +
    0.30*f["backtrack_loop_score"] +
    0.15*f["file_switch_rate"]
)

raw_exploration = (
    0.45*f["branch_switch_score"] +
    0.30*f["file_switch_rate"] +
    0.25*f["attempt_frequency"]
)

raw_friction = (
    0.40*f["backtrack_loop_score"] +
    0.25*f["idle_ratio"] +
    0.20*f["delete_ratio"] +
    0.15*f["cv_inter_edit_gap"]
)

raw_rhythm = 1 - (
    0.45*f["cv_inter_edit_gap"] +
    0.30*f["idle_ratio"] +
    0.25*f["long_pause_ratio"]
)
```

- 维度平滑：
```python
smoothed = alpha * raw + (1 - alpha) * prev
# alpha = 0.35, prev_state 不存在时直接取 raw
```

- 展示状态打分：
```python
S = stability
E = exploration
F = friction
R = rhythm

state_scores = {
    "steady_flow": (
        0.40*S + 0.35*R + 0.25*(1-F)
    ),
    "careful_progression": (
        0.40*S + 0.30*(1-E) + 0.30*(1-F)
    ),
    "local_debugging": (
        0.40*E + 0.35*F + 0.25*S
    ),
    "branch_exploration": (
        0.55*E + 0.25*S + 0.20*(1-F)
    ),
    "minor_stuck": (
        0.45*F + 0.30*(1-R) + 0.25*(1-S)
    ),
    "looping": (
        0.45*f["backtrack_loop_score"] + 0.25*F + 0.20*f["delete_ratio"] + 0.10*f["attempt_frequency"]
    ),
    "structural_stuck": (
        0.40*F + 0.30*f["long_pause_ratio"] + 0.30*(1-S)
    ),
    "deep_thinking": (
        0.40*f["long_pause_ratio"] + 0.30*S + 0.30*(1-F)
    ),
    "attention_drop": (
        0.40*f["long_pause_ratio"] + 0.30*(1-R) + 0.30*(1-S)
    ),
}
```

- 状态平滑与切换：
```python
smoothed_state_score = 0.30 * current_score + 0.70 * prev_score
top1_new 需连续 2 帧超过当前 top1_old 0.12 才切换
若 top1_new >= 0.85 且属于 {"looping","structural_stuck","attention_drop"}，可直接切换
```

- `confidence`：
```python
data_quality = present_feature_count / 8

sorted_scores = sorted(smoothed_state_scores.values(), reverse=True)
separation = max(0.0, sorted_scores[0] - sorted_scores[2])  # 不足3个时退化 top1-top2

temporal_consistency = 1.0 - mean(abs(curr_dim - prev_dim))  # prev 不存在时取 0.5

evidence_strength = mean(top3_feature_contribs_for_top1)  # 取 top1 状态公式中贡献最大的 3 项

overall_confidence = (
    0.30 * data_quality +
    0.35 * separation +
    0.20 * temporal_consistency +
    0.15 * evidence_strength
)
```

- `evidence_summary` 生成：
```python
1) 取 top1 状态公式贡献最大的 2~3 个项
2) 生成短句："{原因1}、{原因2}，因此判断为 {state}"
3) 执行页只保留 1 句；复盘页保留 evidence_items[]
```

---

**StateVector v1 JSON 示例**

```json
{
  "state_id": "sv_20260404_001",
  "session_id": "sess_001",
  "snapshot_id": "snap_014",
  "window_start": "2026-04-04T15:10:00+08:00",
  "window_end": "2026-04-04T15:10:30+08:00",
  "generated_at": "2026-04-04T15:10:31+08:00",
  "dimension_scores": {
    "stability": { "raw": 0.41, "smoothed": 0.46, "band": "low" },
    "exploration": { "raw": 0.62, "smoothed": 0.58, "band": "mid" },
    "friction": { "raw": 0.71, "smoothed": 0.68, "band": "high" },
    "rhythm": { "raw": 0.37, "smoothed": 0.42, "band": "low" }
  },
  "display_scores": {
    "steady_flow": 0.39,
    "careful_progression": 0.42,
    "local_debugging": 0.60,
    "branch_exploration": 0.49,
    "minor_stuck": 0.59,
    "looping": 0.73,
    "structural_stuck": 0.58,
    "deep_thinking": 0.44,
    "attention_drop": 0.52
  },
  "top_states": [
    {
      "state_key": "looping",
      "family": "stuck",
      "score": 0.73,
      "confidence": 0.79,
      "evidence_summary": "回退循环高、删除率偏高，且摩擦持续上升，因此更像 looping。",
      "trigger_ready": true
    },
    {
      "state_key": "local_debugging",
      "family": "explore",
      "score": 0.60,
      "confidence": 0.67,
      "evidence_summary": "分支切换和尝试频率偏高，同时仍保持一定稳定性，因此次像 local_debugging。",
      "trigger_ready": false
    }
  ],
  "confidence": {
    "overall": 0.79,
    "data_quality": 1.0,
    "separation": 0.15,
    "temporal_consistency": 0.84,
    "evidence_strength": 0.76
  },
  "evidence_summary": {
    "short_text": "回退循环高、删除率偏高，且摩擦持续上升，因此判断为 looping。",
    "evidence_items": [
      {
        "feature": "backtrack_loop_score",
        "direction": "up",
        "observed": 0.84,
        "contribution": 0.38
      },
      {
        "feature": "delete_ratio",
        "direction": "up",
        "observed": 0.66,
        "contribution": 0.18
      },
      {
        "feature": "friction",
        "direction": "up",
        "observed": 0.68,
        "contribution": 0.17
      }
    ]
  },
  "engine_meta": {
    "rule_version": "state_infer_v1_frozen",
    "inference_ms": 4
  }
}
```

---

**自动提醒触发阈值**

- 总门槛：
  - `top_state.confidence >= 0.70`
  - `top_state.score >= 0.72`
  - 连续 `2` 个快照保持
  - 同类提醒冷却 `90s`

- 分状态阈值：
  - `looping`
    - `score >= 0.72`
    - `backtrack_loop_score >= 0.70`
    - `friction.smoothed >= 0.65`
  - `structural_stuck`
    - `score >= 0.74`
    - `long_pause_ratio >= 0.65`
    - `stability.smoothed <= 0.45`
  - `attention_drop`
    - `score >= 0.74`
    - `long_pause_ratio >= 0.70`
    - `rhythm.smoothed <= 0.40`

- 只展示不自动提醒：
  - `steady_flow`
  - `careful_progression`
  - `local_debugging`
  - `branch_exploration`
  - `minor_stuck`
  - `deep_thinking`

如果你要，我下一条可以直接给你一版完整的 `Python infer_state()` 可粘贴实现。