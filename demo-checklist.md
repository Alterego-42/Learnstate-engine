# 比赛版 MVP Demo Checklist

## 0. 冻结口径

- 唯一真源：`PRD.md`
- 只验收闭环，不按功能数量加分
- 出现不稳定时优先删减，不优先补功能
- Demo 固定题目：`demo-two-sum`
- 主链路固定为：`daemon 启动 -> 执行页打开任务 -> 写入事件 -> 展示状态 -> 结束 session -> 打开复盘`

## 1. 彩排通过条件 / 失败条件

### 通过条件

- `daemon` 可启动，`http://127.0.0.1:8765/` 返回 `status=ok`
- 执行页可打开 `demo-two-sum`
- 做题过程中至少成功写入 1 批事件，`POST /api/events` 返回 `ingested_count > 0`
- 执行页能看到当前状态、置信度、1 句证据说明；若自动提醒关闭，仅被动展示状态也算通过
- 结束 session 后能进入复盘页，看到 `session` 概要、状态/特征时间线、关键转折点或建议
- Fallback 路线可在 60 秒内切换到 API 页面继续讲完闭环

### 失败条件

- `daemon` 无法启动，或 API 根路径不可访问
- 执行页无法打开 `demo-two-sum`
- 行为事件无法入库，`POST /api/events` 失败或 `ingested_count=0`
- 状态区完全无数据，且 fallback API 页面也无法展示 `latest_snapshot / latest_state / report`
- `session.end` 后无法拿到复盘数据，且预置 session 也不可用
- 现场为修 bug 临时改范围、加功能、加测试框架；一律判为彩排失败，直接走删减回退

## 2. 主方案 Demo Checklist

### 演示前 5 分钟

- [ ] 启动 `daemon`
  ```powershell
  cd E:\clawSpace\NewProject\daemon
  .venv\Scripts\activate
  uvicorn app.main:app --host 127.0.0.1 --port 8765
  ```
- [ ] 打开 `http://127.0.0.1:8765/docs`，确认 `POST /api/events`、`GET /api/state/current`、`GET /api/session/{session_id}/report` 都在
- [ ] 打开执行页，确认任务列表能进入 `demo-two-sum`
- [ ] 确认右侧状态区默认只展示“当前状态 + 置信度 + 一句解释”，不演示额外功能
- [ ] 准备 fallback 用的预置 `session_id`，不要在正式演示前清库

### 演示中固定检查点

- [ ] 进入 `demo-two-sum` 后，先口头点明“我们看的是过程状态，不只是 AC 结果”
- [ ] 执行错误/低效方案时，右侧状态能从“推进/调试”逐渐转向“回退/卡顿”
- [ ] 切换到哈希表思路后，右侧状态能回到“稳定推进/谨慎推进”
- [ ] 结束 session 后能切到复盘页，看到本次 session 的整体摘要和状态变化
- [ ] 若自动提醒不稳，现场直接关掉提醒讲“状态识别 + 复盘闭环”，不补救提醒逻辑

## 3. 固定 3-5 分钟 Demo 流程

| 时间段 | 操作 | 主方案话术 |
| --- | --- | --- |
| 0:00-0:30 | 打开本地服务和执行页 | “这个系统不是替你刷题，而是识别你此刻是在有效推进、局部调试，还是已经陷入反复回退。” |
| 0:30-1:00 | 选择 `demo-two-sum` | “首版严格绑定编程学习场景，今天只演示一条最短闭环：采集行为、识别状态、结束后复盘。” |
| 1:00-2:10 | 先写一个低效/错误版本，制造删除、停顿、重复运行 | “右侧状态区只保留最关键输出：当前 Top 状态、置信度，以及一句基于删除率、停顿、回退循环的解释。” |
| 2:10-3:20 | 切换为哈希表解法并跑通 | “当操作从反复试错转回有结构的修改，状态应该回到更稳定的推进类标签；这说明它看的是过程轨迹，不是只看最终结果。” |
| 3:20-4:30 | 点击结束 session，进入复盘页 | “复盘页把刚才的状态轨迹、关键转折点和建议收束起来，完成‘执行中反馈 + 结束后复盘’闭环。” |
| 4:30-5:00 | 总结隐私边界和回退策略 | “原始代码不上传，行为摘要和状态在本地先生成；如果提醒不稳，我们宁可关提醒，也不破坏闭环稳定性。” |

## 4. 固定题目与固定行为脚本

### 题目

- 固定使用 `demo-two-sum`
- 不切换到 `demo-binary-search` 或临时自建题目

### 行为脚本

1. 打开 `demo-two-sum`，先写一个双重循环版本，故意保留一个边界/返回值问题
2. 连续做 2-3 次局部删除和重写，围绕同一小段代码来回改
3. 插入一次 3-5 秒停顿，再点击 `run`
4. 若结果仍不对，再做 1 轮“删除 -> 重写 -> run”
5. 口头点明“这段是在制造回退循环和较高删除率，用来观察卡顿类状态是否出现”
6. 切换到哈希表解法，编辑节奏变得更连续，减少同一区域反复删除
7. 再次 `run` 成功后，口头点明“状态应回到推进类/谨慎推进类”
8. 点击结束 session，进入复盘页看时间线与建议

### 预期状态节奏

- 起步写代码：`careful_progression` 或 `local_debugging`
- 反复删改 + 多次 run：`looping`、`minor_stuck` 或 `structural_stuck`
- 切到哈希表方案并稳定修改：`steady_flow` 或 `careful_progression`
- 如果自动提醒关闭：只展示上述状态标签、置信度和一句解释，不弹主动干预

## 5. Fallback 方案

### Fallback A：自动提醒不稳

- 立即关闭/忽略自动提醒入口
- 现场只讲“当前状态 + 置信度 + 证据说明”
- 不再尝试触发 `intervention`，避免误报打断演示
- 复盘页照常展示状态轨迹与建议，闭环仍成立

### Fallback B：执行页部分不稳，但 API 正常

- 立刻切到 `http://127.0.0.1:8765/docs`
- 用预置 `session_id` 直接展示：
  - `GET /api/state/current`
  - `GET /api/state/history`
  - `GET /api/session/{session_id}/report`
- 话术固定为：“UI 层先降级，但底层采集、状态和复盘数据都还在，本轮先保证闭环可证明。”

### Fallback C：现场事件采集不稳

- 直接切换到彩排时保留的预置 session，不再现场手敲造数据
- 在 API 页面展示这条预置 session 的 `history/report`
- 话术固定为：“现场输入链路先降级到预置 session，但这条 session 是按同一套 `demo-two-sum` 行为脚本提前生成的，闭环结构不变。”

### 预置 session 准备方式

1. 彩排时完整跑一遍 `demo-two-sum`
2. 记录最后一次成功 session 的 `session_id`
3. 不清空 `daemon/data/mvp_local.db`
4. 正式演示前先用 API 页面确认：
   - `GET /api/state/history?session_id=<预置session_id>`
   - `GET /api/session/<预置session_id>/report`
5. 如果这两个接口可读，则 fallback 预案视为就绪

### Fallback API 展示顺序

1. `GET /api/state/current`：证明当前/最近 session 和最新状态快照存在
2. `GET /api/state/history?session_id=<预置session_id>`：证明状态轨迹存在
3. `GET /api/session/<预置session_id>/report`：证明 session 结束后能复盘

## 6. 彩排记录模板

| 项目 | 结果 | 备注 |
| --- | --- | --- |
| daemon 启动 | 通过/失败 |  |
| 打开 `demo-two-sum` | 通过/失败 |  |
| 写入事件 | 通过/失败 | 记录 `ingested_count` |
| 执行页看到状态 | 通过/失败 | 自动提醒关闭时也算通过 |
| 结束 session 后看到复盘 | 通过/失败 | 记录 `session_id` |
| 预置 session 可通过 API 展示 | 通过/失败 | 记录 fallback `session_id` |
| 60 秒内切换 fallback | 通过/失败 |  |
| 是否有必须当场删减项 | 无/有 | 优先删提醒、次删花哨 UI，不删闭环 |
