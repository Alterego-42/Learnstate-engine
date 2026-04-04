# Local Daemon MVP

本目录提供比赛版 MVP 的本地 Python daemon：

- 单进程 `FastAPI` 服务
- 本地 `SQLite` 存储
- `Session / RawEvent / FeatureSnapshot / StateVector / Task / Settings` 最小闭环
- 前端批量写事件、推理模块读 `FeatureSnapshot` 并写回 `StateVector`

## 目录建议

```text
daemon/
  app/
    main.py
    config.py
    database.py
    models.py
    repositories.py
    services/
      session_service.py
      snapshot_service.py
      report_service.py
  data/
  requirements.txt
```

## 本地运行

```powershell
cd E:\clawSpace\NewProject\daemon
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8765
```

访问：

- API 根：`http://127.0.0.1:8765`
- Swagger：`http://127.0.0.1:8765/docs`

## 关键约束

- SQLite 文件仅落在本地 `daemon/data/mvp_local.db`
- `payload_summary` 入库前会脱敏，拒绝源码类字段
- 不保存原始代码文本，只保存行为摘要

## StateVector 写回

- 不新增 HTTP 接口
- 推理模块直接复用 `app.services.state_vector_service.write_state_vector_v1`
- 或运行 `python -m app.runners.state_vector_runner --stdin`
- 详细口径见 `STATE_VECTOR_INTEGRATION.md`
