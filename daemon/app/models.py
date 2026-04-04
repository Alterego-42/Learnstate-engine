from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class EventItem(BaseModel):
    event_id: str | None = None
    event_type: str = Field(
        ...,
        examples=[
            "edit.insert",
            "edit.delete",
            "edit.replace",
            "cursor.move",
            "cursor.pause",
            "clipboard.copy",
            "clipboard.paste",
            "run",
            "submit",
            "session.end",
        ],
    )
    event_time: datetime
    payload_summary: dict[str, Any] = Field(default_factory=dict)
    source: str | None = Field(default="monaco")


class EventBatchRequest(BaseModel):
    user_local_id: str = Field(default="local-demo-user")
    task_id: str | None = None
    split_reason: str | None = None
    events: list[EventItem]


class TaskResponse(BaseModel):
    task_id: str
    task_type: str
    title: str
    difficulty_level: str | None
    knowledge_tags: list[str]
    source_type: str | None


class SessionResponse(BaseModel):
    session_id: str
    user_local_id: str
    task_id: str | None
    start_time: str
    end_time: str | None
    session_index: int
    split_reason: str | None
    status: str
    last_event_time: str | None


class SnapshotResponse(BaseModel):
    snapshot_id: str
    session_id: str
    window_start: str
    window_end: str
    feature_values: dict[str, Any]
    created_at: str


class StateVectorResponse(BaseModel):
    state_id: str
    session_id: str
    snapshot_id: str | None
    dimension_scores: dict[str, Any]
    top_states: list[dict[str, Any]]
    confidence: float
    evidence_summary: str | None
    generated_at: str
    source: str


class CurrentStateResponse(BaseModel):
    current_session: SessionResponse | None
    latest_snapshot: SnapshotResponse | None
    latest_state: StateVectorResponse | None


class EventBatchResponse(BaseModel):
    session: SessionResponse
    ingested_count: int
    snapshot: SnapshotResponse
    closed: bool = False


class SettingsResponse(BaseModel):
    settings: dict[str, Any]


class SessionReportResponse(BaseModel):
    session: SessionResponse
    task: TaskResponse | None
    summary: dict[str, Any]
    snapshots: list[SnapshotResponse]
    states: list[StateVectorResponse]
