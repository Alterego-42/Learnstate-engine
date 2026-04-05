# 热修记录：reference-signal

## 背景
- 执行页新增“学习资料参考区”后，需要保证参考区交互不会打断现有 `RawEvent -> FeatureSnapshot -> StateVector` 链路。
- 本轮只做 P0 兼容热修，不扩数据库结构、不新增 HTTP 接口、不改状态机主公式。

## 本轮支持的参考区事件
- `reference.open`
- `reference.close`
- `reference.section_change`
- `reference.scroll`

## 事件字段口径
- 必带：`event_type`、`event_time`
- 建议携带：`payload_summary.seq`、`payload_summary.reference_id`
- 按事件可选：`payload_summary.section_id`、`payload_summary.scroll_ratio`、`payload_summary.duration_ms`
- `source` 建议使用 `reference-panel` 或具体前端模块名

## 兼容策略
- `POST /api/events` 对 `reference.*` 事件直接按现有入口入库，写入 `raw_events`
- `FeatureSnapshot` 侧记 `reference_event_count`，但 `reference.*` 不计入首版核心推理特征
- 若当前快照窗口只有 `reference.*` 事件，则跳过本轮 `StateVector` 写回，避免空特征触发误判
- 若 `reference.*` 与编辑/运行事件混合上报，则照常基于编辑/运行事件生成状态，参考区事件仅保留待后续使用

## 后续预留
- 后续文档/网页查看器正式采集时，优先复用 `reference.* + payload_summary` 口径扩展字段，不新增事件入口
- 若未来要让资料行为进入推理，优先在 `FeatureSnapshot` 层扩展派生字段，再由状态推理模块显式接入
