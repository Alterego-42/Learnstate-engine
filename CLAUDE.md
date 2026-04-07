# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Learnstate-engine is a **learning state感知与分析系统** (Learning State Perception and Analysis System). The MVP targets programming learning / algorithm practice scenarios, capturing behavioral signals during coding sessions to infer the user's learning state (flow, stuck, exploration, etc.).

**Core MVP loop**: `behavior capture → feature snapshot → state inference → execution feedback → session review`

---

## Architecture

### Backend: `daemon/`

Python FastAPI + SQLite local-first architecture.

```
daemon/
  app/
    main.py              # FastAPI app, all HTTP routes
    config.py            # Configuration (DB path, defaults)
    database.py         # SQLite connection & initialization
    models.py            # Pydantic request/response models
    repositories.py      # All DB CRUD operations
    services/
      state_vector_service.py  # Core state inference engine (4-dimension model)
      snapshot_service.py      # Feature extraction from raw events
      session_service.py        # Session lifecycle management
      report_service.py        # Session review report generation
    runners/
      state_vector_runner.py   # Offline batch inference runner
  requirements.txt
```

**Key state dimensions** (4 enabled of 6 theoretical):
- `stability` - cognitive stability
- `exploration` - path exploration level
- `friction` - blockage/stuck level
- `rhythm` - temporal rhythm

**State output**: Multi-label weighted (TOP-2 states + confidence), not single exclusive label.

### Frontend: `frontend/`

React 19 + TypeScript + Vite + Monaco Editor.

```
frontend/src/
  App.tsx               # Routing: execution page vs report page via URL params
  components/
    ExecutionPage.tsx   # Main learning workspace (IDE-like layout)
    SessionReportPage.tsx  # Post-session review with timeline
    StatusPanel.tsx    # Real-time state display (right panel)
    MonacoWorkbench.tsx # Code editor wrapper
    TaskBrief.tsx      # Task instructions panel
    RunResultPanel.tsx # Code execution results
  hooks/
    useEventReporter.ts  # Captures editor events (keystrokes, paste, run, etc.)
    useStatePolling.ts   # Polls daemon every 2-3s for current state
    useSessionReport.ts  # Fetches session review report
    useDaemonTasks.ts    # Fetches available tasks
  api/
    client.ts          # API client (fetch wrappers)
```

**Frontend URL routing** (via query params):
- `?view=execution` - Main learning execution page
- `?view=report&sessionId=xxx` - Session review page

---

## Commands

### Backend (Daemon)

```bash
cd daemon
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8765
```

API docs at `http://127.0.0.1:8765/docs`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite dev server typically at `http://localhost:5173`

### Build

```bash
# Frontend production build
cd frontend && npm run build
```

---

## Key API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/events` | Ingest batch of behavioral events, returns snapshot + state |
| GET | `/api/state/current` | Poll current session + latest state vector |
| GET | `/api/state/history` | Get state history for a session |
| GET | `/api/session/{id}/report` | Get session review report |
| GET | `/api/tasks` | List available learning tasks |
| GET/PUT | `/api/settings` | Get/update system settings |

---

## Data Model

Core entities: `Session` → `RawEvent` → `FeatureSnapshot` → `StateVector`

- **RawEvent**: Granular behavioral events (edit, paste, run, pause, etc.)
- **FeatureSnapshot**: Windowed feature aggregates (delete_ratio, backtrack_loop_score, etc.)
- **StateVector**: Inferred multi-dimensional state + TOP-2 display states + confidence

---

## Privacy / ESM

All behavior data stays local. Only encrypted statistical summaries (ESM - Encrypted State Machine) may be uploaded for cloud analysis. Original code is never transmitted.
