# StateVector 写回接入

本地 daemon 不新增 HTTP 接口，推理模块继续通过 SQLite 直写。

## 统一写回口径

`StateVector v1` 至少包含：

- `session_id`
- `snapshot_id`
- `dimension_scores`
- `top_states`
- `confidence`
- `evidence_summary`
- `generated_at`（可选，不传则 daemon 补当前 UTC）
- `source`

其中：

- 顶层 `evidence_summary` 最终统一存为 JSON 字符串
- JSON 至少包含 `short_text`
- `top_states` 最多保留前 2 个
- `top_states[i]` 至少包含：
  - `state_key`
  - `family`
  - `score`
  - `confidence`
  - `evidence_summary`
  - `trigger_ready`

## Agent C 直接调用方式

### 方式 1：Python 内直接复用 helper

```python
from app.database import get_connection, initialize_database
from app.services.state_vector_service import write_state_vector_v1

initialize_database()

with get_connection() as connection:
    result = write_state_vector_v1(
        connection=connection,
        session_id="your-session-id",
        snapshot_id="your-snapshot-id",
        dimension_scores={
            "stability": 0.71,
            "exploration": 0.42,
            "friction": 0.63,
            "rhythm": 0.58
        },
        top_states=[
            {
                "state_key": "structural_stuck",
                "family": "blocking",
                "score": 0.81,
                "confidence": 0.79,
                "evidence_summary": {"short_text": "删除占比偏高，尝试频繁"},
                "trigger_ready": True
            },
            {
                "state_key": "local_debugging",
                "family": "exploration",
                "score": 0.54,
                "confidence": 0.51,
                "evidence_summary": {"short_text": "仍在局部试探"},
                "trigger_ready": False
            }
        ],
        confidence=0.79,
        evidence_summary={
            "short_text": "当前更像结构性卡住，建议执行轻提示",
            "signals": ["delete_ratio", "attempt_freq_per_min"]
        },
        source="agent_c"
    )
```

### 方式 2：CLI runner

```powershell
cd E:\clawSpace\NewProject\daemon
@'
{
  "session_id": "your-session-id",
  "snapshot_id": "your-snapshot-id",
  "dimension_scores": {
    "stability": 0.71,
    "exploration": 0.42,
    "friction": 0.63,
    "rhythm": 0.58
  },
  "top_states": [
    {
      "state_key": "structural_stuck",
      "family": "blocking",
      "score": 0.81,
      "confidence": 0.79,
      "evidence_summary": {"short_text": "删除占比偏高，尝试频繁"},
      "trigger_ready": true
    },
    {
      "state_key": "local_debugging",
      "family": "exploration",
      "score": 0.54,
      "confidence": 0.51,
      "evidence_summary": {"short_text": "仍在局部试探"},
      "trigger_ready": false
    }
  ],
  "confidence": 0.79,
  "evidence_summary": {
    "short_text": "当前更像结构性卡住，建议执行轻提示"
  },
  "source": "agent_c"
}
'@ | python -m app.runners.state_vector_runner --stdin
```

## 对接点

- 事件入库与快照生成：`app.main.post_events`
- 特征来源表：`feature_snapshots`
- 标准写回 helper：`app.services.state_vector_service.write_state_vector_v1`
- 最终落库函数：`app.repositories.save_state_vector`
