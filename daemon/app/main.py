from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Query

from .config import config
from .database import get_connection, initialize_database
from .models import (
    CurrentStateResponse,
    EventBatchRequest,
    EventBatchResponse,
    SessionReportResponse,
    SettingsResponse,
    TaskResponse,
)
from .repositories import (
    cleanup_old_raw_events,
    get_current_open_session,
    get_latest_session,
    get_latest_snapshot,
    get_latest_state_vector,
    get_session_by_id,
    get_setting_map,
    get_task_by_id,
    list_state_vectors,
    list_tasks,
    save_events,
    touch_session,
    update_settings,
)
from .services.report_service import build_session_report
from .services.session_service import ensure_session_for_batch
from .services.snapshot_service import build_snapshot_for_session
from .services.state_vector_service import infer_and_write_state_vector_v1


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


app = FastAPI(title=config.app_name, version="0.1.0", lifespan=lifespan)


@app.get("/")
def root() -> dict[str, Any]:
    return {"service": config.app_name, "status": "ok"}


@app.post("/api/events", response_model=EventBatchResponse)
def post_events(payload: EventBatchRequest) -> EventBatchResponse:
    if not payload.events:
        raise HTTPException(status_code=400, detail="events must not be empty")

    ordered_events = sorted(
        [event.model_dump() for event in payload.events],
        key=lambda item: (
            item["event_time"],
            int((item.get("payload_summary") or {}).get("seq", 0)),
        ),
    )
    with get_connection() as connection:
        settings = get_setting_map(connection)
        session, closed = ensure_session_for_batch(
            connection=connection,
            user_local_id=payload.user_local_id,
            task_id=payload.task_id,
            split_reason=payload.split_reason,
            events=ordered_events,
        )
        ingested_count = save_events(connection, session["session_id"], session.get("task_id") or payload.task_id, ordered_events)
        if not closed:
            session = touch_session(connection, session["session_id"], session.get("task_id") or payload.task_id, ordered_events[-1]["event_time"].isoformat())
        snapshot = build_snapshot_for_session(
            connection=connection,
            session_id=session["session_id"],
            window_end=ordered_events[-1]["event_time"].isoformat(),
            window_seconds=int(settings["snapshot_window_seconds"]),
        )
        if int((snapshot.get("feature_values") or {}).get("event_count", 0)) > 0:
            infer_and_write_state_vector_v1(
                connection=connection,
                feature_snapshot=snapshot,
            )
        cleanup_old_raw_events(connection, int(settings["raw_event_retention_days"]))
        refreshed_session = get_session_by_id(connection, session["session_id"])
        return EventBatchResponse(
            session=refreshed_session,  # type: ignore[arg-type]
            ingested_count=ingested_count,
            snapshot=snapshot,  # type: ignore[arg-type]
            closed=closed,
        )


@app.get("/api/state/current", response_model=CurrentStateResponse)
def get_current_state(user_local_id: str = Query(default=config.default_user_local_id)) -> CurrentStateResponse:
    with get_connection() as connection:
        session = get_current_open_session(connection, user_local_id) or get_latest_session(connection, user_local_id)
        if session is None:
            return CurrentStateResponse(current_session=None, latest_snapshot=None, latest_state=None)
        latest_snapshot = get_latest_snapshot(connection, session["session_id"])
        latest_state = get_latest_state_vector(connection, session["session_id"])
        return CurrentStateResponse(
            current_session=session,  # type: ignore[arg-type]
            latest_snapshot=latest_snapshot,  # type: ignore[arg-type]
            latest_state=latest_state,  # type: ignore[arg-type]
        )


@app.get("/api/state/history")
def get_state_history(
    session_id: str | None = Query(default=None),
    user_local_id: str = Query(default=config.default_user_local_id),
    limit: int = Query(default=50, ge=1, le=200),
) -> dict[str, Any]:
    with get_connection() as connection:
        target_session = (
            get_session_by_id(connection, session_id)
            if session_id
            else get_current_open_session(connection, user_local_id) or get_latest_session(connection, user_local_id)
        )
        if target_session is None:
            return {"session": None, "history": []}
        history = list(reversed(list_state_vectors(connection, target_session["session_id"], limit=limit)))
        return {"session": target_session, "history": history}


@app.get("/api/session/{session_id}/report", response_model=SessionReportResponse)
def get_session_report(session_id: str) -> SessionReportResponse:
    with get_connection() as connection:
        session = get_session_by_id(connection, session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="session not found")
        return SessionReportResponse(**build_session_report(connection, session))


@app.get("/api/tasks", response_model=list[TaskResponse])
def get_tasks() -> list[TaskResponse]:
    with get_connection() as connection:
        return [TaskResponse(**task) for task in list_tasks(connection)]


@app.get("/api/tasks/{task_id}", response_model=TaskResponse)
def get_task(task_id: str) -> TaskResponse:
    with get_connection() as connection:
        task = get_task_by_id(connection, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="task not found")
        return TaskResponse(**task)


@app.get("/api/settings", response_model=SettingsResponse)
def get_settings() -> SettingsResponse:
    with get_connection() as connection:
        return SettingsResponse(settings=get_setting_map(connection))


@app.put("/api/settings", response_model=SettingsResponse)
def put_settings(payload: dict[str, Any]) -> SettingsResponse:
    with get_connection() as connection:
        return SettingsResponse(settings=update_settings(connection, payload))
