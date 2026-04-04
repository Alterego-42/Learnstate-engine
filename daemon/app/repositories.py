from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterable
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from .database import utc_now


FORBIDDEN_PAYLOAD_KEYS = {
    "code",
    "text",
    "content",
    "snippet",
    "source_code",
    "before_text",
    "after_text",
    "full_text",
    "diff",
}


def to_utc_iso(value: datetime | str) -> str:
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def row_to_session(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def row_to_task(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    payload = dict(row)
    payload["knowledge_tags"] = json.loads(payload["knowledge_tags"] or "[]")
    return payload


def row_to_snapshot(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    payload = dict(row)
    payload["feature_values"] = json.loads(payload["feature_values"] or "{}")
    return payload


def row_to_state(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    payload = dict(row)
    payload["dimension_scores"] = json.loads(payload["dimension_scores"] or "{}")
    payload["top_states"] = json.loads(payload["top_states"] or "[]")
    return payload


def sanitize_payload_summary(payload_summary: dict[str, Any]) -> dict[str, Any]:
    def sanitize_value(key: str, value: Any) -> Any:
        lowered = key.lower()
        if lowered in FORBIDDEN_PAYLOAD_KEYS:
            return "[redacted]"
        if isinstance(value, dict):
            return {k: sanitize_value(k, v) for k, v in value.items() if len(k) <= 64}
        if isinstance(value, list):
            return [sanitize_value(key, item) for item in value[:20]]
        if isinstance(value, (bool, int, float)):
            return value
        if value is None:
            return None
        text = str(value)
        if len(text) > 120 or "\n" in text or "\r" in text:
            return "[redacted]"
        return text

    return {key: sanitize_value(key, value) for key, value in payload_summary.items() if len(key) <= 64}


def get_setting_map(connection: sqlite3.Connection) -> dict[str, Any]:
    rows = connection.execute("SELECT key, value FROM settings").fetchall()
    return {row["key"]: json.loads(row["value"]) for row in rows}


def update_settings(connection: sqlite3.Connection, settings: dict[str, Any]) -> dict[str, Any]:
    now = utc_now()
    for key, value in settings.items():
        connection.execute(
            """
            INSERT INTO settings(key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
            """,
            (key, json.dumps(value), now),
        )
    return get_setting_map(connection)


def get_current_open_session(connection: sqlite3.Connection, user_local_id: str) -> dict[str, Any] | None:
    row = connection.execute(
        """
        SELECT *
        FROM sessions
        WHERE user_local_id = ? AND status = 'open'
        ORDER BY start_time DESC
        LIMIT 1
        """,
        (user_local_id,),
    ).fetchone()
    return row_to_session(row)


def get_latest_session(connection: sqlite3.Connection, user_local_id: str) -> dict[str, Any] | None:
    row = connection.execute(
        """
        SELECT *
        FROM sessions
        WHERE user_local_id = ?
        ORDER BY start_time DESC
        LIMIT 1
        """,
        (user_local_id,),
    ).fetchone()
    return row_to_session(row)


def get_next_session_index(connection: sqlite3.Connection, user_local_id: str) -> int:
    row = connection.execute(
        "SELECT COALESCE(MAX(session_index), 0) + 1 AS next_index FROM sessions WHERE user_local_id = ?",
        (user_local_id,),
    ).fetchone()
    return int(row["next_index"])


def create_session(
    connection: sqlite3.Connection,
    user_local_id: str,
    task_id: str | None,
    start_time: str,
    split_reason: str | None,
) -> dict[str, Any]:
    session_id = str(uuid4())
    now = utc_now()
    payload = {
        "session_id": session_id,
        "user_local_id": user_local_id,
        "task_id": task_id,
        "start_time": start_time,
        "end_time": None,
        "session_index": get_next_session_index(connection, user_local_id),
        "split_reason": split_reason,
        "status": "open",
        "last_event_time": start_time,
        "created_at": now,
        "updated_at": now,
    }
    connection.execute(
        """
        INSERT INTO sessions(
            session_id, user_local_id, task_id, start_time, end_time, session_index,
            split_reason, status, last_event_time, created_at, updated_at
        )
        VALUES (
            :session_id, :user_local_id, :task_id, :start_time, :end_time, :session_index,
            :split_reason, :status, :last_event_time, :created_at, :updated_at
        )
        """,
        payload,
    )
    return {key: value for key, value in payload.items() if key not in {"created_at", "updated_at"}}


def close_session(
    connection: sqlite3.Connection,
    session_id: str,
    end_time: str,
    split_reason: str | None,
) -> dict[str, Any]:
    now = utc_now()
    connection.execute(
        """
        UPDATE sessions
        SET end_time = ?, split_reason = COALESCE(?, split_reason), status = 'closed',
            last_event_time = ?, updated_at = ?
        WHERE session_id = ?
        """,
        (end_time, split_reason, end_time, now, session_id),
    )
    row = connection.execute("SELECT * FROM sessions WHERE session_id = ?", (session_id,)).fetchone()
    return row_to_session(row)  # type: ignore[return-value]


def touch_session(
    connection: sqlite3.Connection,
    session_id: str,
    task_id: str | None,
    last_event_time: str,
) -> dict[str, Any]:
    now = utc_now()
    connection.execute(
        """
        UPDATE sessions
        SET task_id = COALESCE(?, task_id), last_event_time = ?, updated_at = ?
        WHERE session_id = ?
        """,
        (task_id, last_event_time, now, session_id),
    )
    row = connection.execute("SELECT * FROM sessions WHERE session_id = ?", (session_id,)).fetchone()
    return row_to_session(row)  # type: ignore[return-value]


def save_events(
    connection: sqlite3.Connection,
    session_id: str,
    task_id: str | None,
    events: Iterable[dict[str, Any]],
) -> int:
    now = utc_now()
    rows = []
    for event in events:
        rows.append(
            (
                event.get("event_id") or str(uuid4()),
                session_id,
                task_id,
                event["event_type"],
                to_utc_iso(event["event_time"]),
                json.dumps(sanitize_payload_summary(event.get("payload_summary") or {}), ensure_ascii=False),
                event.get("source"),
                now,
            )
        )
    connection.executemany(
        """
        INSERT INTO raw_events(
            event_id, session_id, task_id, event_type, event_time, payload_summary, source, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    return len(rows)


def cleanup_old_raw_events(connection: sqlite3.Connection, retention_days: int) -> int:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=retention_days)).isoformat()
    cursor = connection.execute("DELETE FROM raw_events WHERE event_time < ?", (cutoff,))
    return cursor.rowcount


def get_session_by_id(connection: sqlite3.Connection, session_id: str) -> dict[str, Any] | None:
    row = connection.execute("SELECT * FROM sessions WHERE session_id = ?", (session_id,)).fetchone()
    return row_to_session(row)


def list_tasks(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = connection.execute("SELECT * FROM tasks ORDER BY updated_at DESC, task_id ASC").fetchall()
    return [row_to_task(row) for row in rows]


def get_task_by_id(connection: sqlite3.Connection, task_id: str) -> dict[str, Any] | None:
    row = connection.execute("SELECT * FROM tasks WHERE task_id = ?", (task_id,)).fetchone()
    return row_to_task(row)


def list_snapshots(connection: sqlite3.Connection, session_id: str, limit: int = 50) -> list[dict[str, Any]]:
    rows = connection.execute(
        """
        SELECT *
        FROM feature_snapshots
        WHERE session_id = ?
        ORDER BY window_end DESC
        LIMIT ?
        """,
        (session_id, limit),
    ).fetchall()
    return [row_to_snapshot(row) for row in rows]


def save_snapshot(
    connection: sqlite3.Connection,
    session_id: str,
    window_start: str,
    window_end: str,
    feature_values: dict[str, Any],
) -> dict[str, Any]:
    snapshot_id = str(uuid4())
    created_at = utc_now()
    connection.execute(
        """
        INSERT INTO feature_snapshots(snapshot_id, session_id, window_start, window_end, feature_values, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (snapshot_id, session_id, window_start, window_end, json.dumps(feature_values, ensure_ascii=False), created_at),
    )
    return {
        "snapshot_id": snapshot_id,
        "session_id": session_id,
        "window_start": window_start,
        "window_end": window_end,
        "feature_values": feature_values,
        "created_at": created_at,
    }


def save_state_vector(
    connection: sqlite3.Connection,
    session_id: str,
    snapshot_id: str | None,
    dimension_scores: dict[str, Any],
    top_states: list[dict[str, Any]],
    confidence: float,
    evidence_summary: str | None,
    generated_at: str | None = None,
    source: str = "inference_module",
) -> dict[str, Any]:
    state_id = str(uuid4())
    generated_at = generated_at or utc_now()
    connection.execute(
        """
        INSERT INTO state_vectors(
            state_id, session_id, snapshot_id, dimension_scores, top_states,
            confidence, evidence_summary, generated_at, source
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            state_id,
            session_id,
            snapshot_id,
            json.dumps(dimension_scores, ensure_ascii=False),
            json.dumps(top_states, ensure_ascii=False),
            confidence,
            evidence_summary,
            generated_at,
            source,
        ),
    )
    return {
        "state_id": state_id,
        "session_id": session_id,
        "snapshot_id": snapshot_id,
        "dimension_scores": dimension_scores,
        "top_states": top_states,
        "confidence": confidence,
        "evidence_summary": evidence_summary,
        "generated_at": generated_at,
        "source": source,
    }


def get_latest_snapshot(connection: sqlite3.Connection, session_id: str) -> dict[str, Any] | None:
    row = connection.execute(
        """
        SELECT *
        FROM feature_snapshots
        WHERE session_id = ?
        ORDER BY window_end DESC
        LIMIT 1
        """,
        (session_id,),
    ).fetchone()
    return row_to_snapshot(row)


def get_snapshot_by_id(connection: sqlite3.Connection, snapshot_id: str) -> dict[str, Any] | None:
    row = connection.execute(
        "SELECT * FROM feature_snapshots WHERE snapshot_id = ?",
        (snapshot_id,),
    ).fetchone()
    return row_to_snapshot(row)


def list_state_vectors(connection: sqlite3.Connection, session_id: str, limit: int = 50) -> list[dict[str, Any]]:
    rows = connection.execute(
        """
        SELECT *
        FROM state_vectors
        WHERE session_id = ?
        ORDER BY generated_at DESC
        LIMIT ?
        """,
        (session_id, limit),
    ).fetchall()
    return [row_to_state(row) for row in rows]


def get_latest_state_vector(connection: sqlite3.Connection, session_id: str) -> dict[str, Any] | None:
    row = connection.execute(
        """
        SELECT *
        FROM state_vectors
        WHERE session_id = ?
        ORDER BY generated_at DESC
        LIMIT 1
        """,
        (session_id,),
    ).fetchone()
    return row_to_state(row)


def event_summary_for_session(connection: sqlite3.Connection, session_id: str) -> dict[str, Any]:
    row = connection.execute(
        """
        SELECT
            COUNT(*) AS event_count,
            SUM(CASE WHEN event_type LIKE 'edit.%' THEN 1 ELSE 0 END) AS edit_count,
            SUM(CASE WHEN event_type LIKE '%delete%' THEN 1 ELSE 0 END) AS delete_count,
            SUM(CASE WHEN event_type LIKE '%run%' OR event_type LIKE '%submit%' THEN 1 ELSE 0 END) AS run_count,
            MIN(event_time) AS first_event_time,
            MAX(event_time) AS last_event_time
        FROM raw_events
        WHERE session_id = ?
        """,
        (session_id,),
    ).fetchone()
    return dict(row)
