from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from typing import Any

from ..repositories import (
    close_session,
    create_session,
    get_current_open_session,
    get_setting_map,
    touch_session,
    to_utc_iso,
)


def ensure_session_for_batch(
    connection: sqlite3.Connection,
    user_local_id: str,
    task_id: str | None,
    split_reason: str | None,
    events: list[dict[str, Any]],
) -> tuple[dict[str, Any], bool]:
    settings = get_setting_map(connection)
    max_session_seconds = int(settings["max_session_seconds"])
    idle_split_seconds = int(settings["idle_split_seconds"])
    first_event_time = min(to_utc_iso(event["event_time"]) for event in events)
    last_event_time = max(to_utc_iso(event["event_time"]) for event in events)
    current_session = get_current_open_session(connection, user_local_id)

    if current_session is None:
        session = create_session(connection, user_local_id, task_id, first_event_time, split_reason or "auto_start")
    else:
        current_start = datetime.fromisoformat(current_session["start_time"])
        current_last = datetime.fromisoformat(current_session["last_event_time"] or current_session["start_time"])
        batch_first = datetime.fromisoformat(first_event_time)
        explicit_split = split_reason is not None
        duration_split = (batch_first - current_start).total_seconds() >= max_session_seconds
        idle_split = (batch_first - current_last).total_seconds() >= idle_split_seconds
        task_switch = task_id is not None and current_session["task_id"] not in {None, task_id}

        if explicit_split or duration_split or idle_split or task_switch:
            reason = split_reason or (
                "duration_limit"
                if duration_split
                else "idle_timeout"
                if idle_split
                else "task_switch"
            )
            close_session(connection, current_session["session_id"], current_last.astimezone(timezone.utc).isoformat(), reason)
            session = create_session(connection, user_local_id, task_id, first_event_time, reason)
        else:
            session = touch_session(connection, current_session["session_id"], task_id, last_event_time)

    close_requested = any(event["event_type"] == "session.end" for event in events)
    if close_requested:
        session = close_session(connection, session["session_id"], last_event_time, "client_end")
    return session, close_requested
