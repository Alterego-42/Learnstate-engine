# SQLite 表结构草案

## `sessions`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `session_id` | `TEXT PK` | 本地会话主键 |
| `user_local_id` | `TEXT` | 本地用户标识 |
| `task_id` | `TEXT NULL` | 当前任务 |
| `start_time` | `TEXT` | 会话开始时间（UTC ISO） |
| `end_time` | `TEXT NULL` | 会话结束时间 |
| `session_index` | `INTEGER` | 本地递增序号 |
| `split_reason` | `TEXT NULL` | 切分原因 |
| `status` | `TEXT` | `open/closed` |
| `last_event_time` | `TEXT NULL` | 最新事件时间 |

## `tasks`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `task_id` | `TEXT PK` | 任务主键 |
| `task_type` | `TEXT` | 任务类型 |
| `title` | `TEXT` | 标题 |
| `difficulty_level` | `TEXT NULL` | 难度 |
| `knowledge_tags` | `TEXT` | JSON 数组 |
| `source_type` | `TEXT NULL` | 来源 |

## `raw_events`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `event_id` | `TEXT PK` | 事件主键 |
| `session_id` | `TEXT FK` | 所属 session |
| `task_id` | `TEXT NULL` | 所属任务 |
| `event_type` | `TEXT` | 行为类型 |
| `event_time` | `TEXT` | 事件时间（UTC ISO） |
| `payload_summary` | `TEXT` | JSON 摘要；禁止源码文本 |
| `source` | `TEXT NULL` | 事件来源 |

## `feature_snapshots`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `snapshot_id` | `TEXT PK` | 快照主键 |
| `session_id` | `TEXT FK` | 所属 session |
| `window_start` | `TEXT` | 窗口开始 |
| `window_end` | `TEXT` | 窗口结束 |
| `feature_values` | `TEXT` | JSON 特征摘要 |

## `state_vectors`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `state_id` | `TEXT PK` | 状态主键 |
| `session_id` | `TEXT FK` | 所属 session |
| `snapshot_id` | `TEXT NULL FK` | 对应特征快照 |
| `dimension_scores` | `TEXT` | JSON 维度分数 |
| `top_states` | `TEXT` | JSON TOP 状态 |
| `confidence` | `REAL` | 置信度 |
| `evidence_summary` | `TEXT NULL` | 依据摘要 |
| `generated_at` | `TEXT` | 生成时间 |
| `source` | `TEXT` | 写入来源 |

补充约束：

- `evidence_summary` 统一存为 JSON 字符串，至少包含 `short_text`
- `top_states` 最多保留前 2 个，单项至少包含 `state_key / family / score / confidence / evidence_summary / trigger_ready`

## `settings`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `key` | `TEXT PK` | 设置键 |
| `value` | `TEXT` | JSON 值 |
| `updated_at` | `TEXT` | 更新时间 |

# API 契约

## `POST /api/events`

用途：前端批量提交行为事件；daemon 自动管理 session，并写入 `RawEvent` + `FeatureSnapshot`。

参考区事件本轮采用“采集保留、暂不纳入主要推理”口径：

- 已支持写入 `raw_events` 的事件类型：`reference.open`、`reference.close`、`reference.section_change`、`reference.scroll`
- 推荐前端在 `payload_summary` 里携带最小字段：`seq`、`reference_id`、`section_id`、`scroll_ratio`、`duration_ms`
- `FeatureSnapshot v1` 仅侧记 `reference_event_count`，不把 `reference.*` 混入 `event_count / edit_count / run_count`
- 若当前窗口只有 `reference.*` 事件，daemon 仍写 `FeatureSnapshot`，但默认跳过本轮 `StateVector` 推理写回，避免空特征污染主状态链路

请求示例：

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
    },
    {
      "event_type": "reference.section_change",
      "event_time": "2026-04-04T15:00:09Z",
      "payload_summary": {
        "seq": 104,
        "reference_id": "two-sum-guide",
        "section_id": "hash-map-idea"
      },
      "source": "reference-panel"
    }
  ]
}
```

响应示例：

```json
{
  "session": {
    "session_id": "uuid",
    "user_local_id": "local-demo-user",
    "task_id": "demo-two-sum",
    "start_time": "2026-04-04T15:00:01+00:00",
    "end_time": null,
    "session_index": 1,
    "split_reason": "auto_start",
    "status": "open",
    "last_event_time": "2026-04-04T15:00:08+00:00"
  },
  "ingested_count": 2,
  "snapshot": {
    "snapshot_id": "uuid",
    "session_id": "uuid",
    "window_start": "2026-04-04T14:59:38+00:00",
    "window_end": "2026-04-04T15:00:08+00:00",
    "feature_values": {
      "event_count": 3,
      "reference_event_count": 1,
      "edit_count": 1,
      "insert_chars": 18,
      "delete_chars": 0,
      "replace_count": 0,
      "pause_count": 1,
      "pause_time_ms": 2200,
      "max_pause_ms": 2200,
      "run_count": 1,
      "submit_count": 0,
      "distinct_file_count": 1,
      "delete_ratio": 0.0,
      "edit_interval_mean_ms": 0.0,
      "edit_interval_cv": 0.0,
      "pause_ratio": 0.0733,
      "backtrack_loop_score": 0.0,
      "attempt_freq_per_min": 1.0,
      "branch_switch_score": 0.0
    },
    "created_at": "2026-04-04T15:00:08+00:00"
  },
  "closed": false
}
```

`FeatureSnapshot v1` 实际字段：

- `event_count`
- `reference_event_count`
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

## `GET /api/state/current`

用途：获取当前 session、最近 `FeatureSnapshot`、最近 `StateVector`。

查询参数：

- `user_local_id`：可选，默认 `local-demo-user`

说明：

- 若推理模块尚未写回 `StateVector`，`latest_state` 返回 `null`
- 若最近一批只有 `reference.*` 事件，`latest_snapshot` 会更新，但 `latest_state` 默认沿用上一条状态或保持 `null`

## `GET /api/state/history`

用途：按 `session_id` 查询状态历史；若未传则取当前/最近 session。

查询参数：

- `session_id`：可选
- `user_local_id`：可选
- `limit`：默认 `50`

## `GET /api/session/{id}/report`

用途：返回复盘读取骨架。

返回内容：

- `session`
- `task`
- `summary`
- `snapshots`
- `states`

## `GET /api/tasks`

用途：返回本地任务列表。

## `GET /api/tasks/{id}`

用途：返回单个任务元信息。

## `GET /api/settings`

用途：返回本地 daemon 配置。

默认键：

- `raw_event_retention_days`
- `max_session_seconds`
- `idle_split_seconds`
- `snapshot_window_seconds`
- `state_pull_interval_seconds`

## `PUT /api/settings`

用途：局部更新本地配置。

请求示例：

```json
{
  "snapshot_window_seconds": 20,
  "idle_split_seconds": 900
}
```

# 推理模块接入约定

- 读取源：`feature_snapshots`
- 写回目标：`state_vectors`
- 关联键：`session_id + snapshot_id`
- 禁止读取或上传源码正文
- 推荐 helper：`app.services.state_vector_service.write_state_vector_v1`
- 可选 runner：`python -m app.runners.state_vector_runner --stdin`
