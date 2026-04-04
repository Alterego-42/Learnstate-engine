from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta
from statistics import mean, pstdev
from typing import Any

from ..repositories import save_snapshot


SUPPORTED_EVENT_TYPES = {
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
}


def _payload_value(payload: dict[str, Any], *keys: str, default: Any = 0) -> Any:
    for key in keys:
        if key in payload and payload[key] is not None:
            return payload[key]
    return default


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _round_score(value: float) -> float:
    return round(max(0.0, min(value, 1.0)), 4)


def build_snapshot_for_session(
    connection: sqlite3.Connection,
    session_id: str,
    window_end: str,
    window_seconds: int,
) -> dict[str, Any]:
    end_dt = datetime.fromisoformat(window_end)
    start_dt = end_dt - timedelta(seconds=window_seconds)
    rows = connection.execute(
        """
        SELECT event_type, event_time, payload_summary
        FROM raw_events
        WHERE session_id = ? AND event_time BETWEEN ? AND ?
        ORDER BY event_time ASC
        """,
        (session_id, start_dt.isoformat(), end_dt.isoformat()),
    ).fetchall()

    normalized_rows = []
    for row in rows:
        payload = json.loads(row["payload_summary"] or "{}")
        normalized_rows.append(
            {
                "event_type": row["event_type"],
                "event_time": datetime.fromisoformat(row["event_time"]),
                "payload": payload,
                "seq": _safe_int(_payload_value(payload, "seq", default=0), default=0),
            }
        )
    normalized_rows.sort(key=lambda item: (item["event_time"], item["seq"]))

    filtered_rows = [row for row in normalized_rows if row["event_type"] in SUPPORTED_EVENT_TYPES]
    edit_rows = [row for row in filtered_rows if str(row["event_type"]).startswith("edit.")]
    edit_times = [row["event_time"] for row in edit_rows]
    edit_intervals_ms = [
        (edit_times[index] - edit_times[index - 1]).total_seconds() * 1000
        for index in range(1, len(edit_times))
    ]

    insert_chars = sum(
        _safe_int(_payload_value(row["payload"], "insert_chars", "delta_chars", "char_count", default=0))
        for row in filtered_rows
        if row["event_type"] == "edit.insert"
    )
    delete_chars = sum(
        _safe_int(_payload_value(row["payload"], "delete_chars", "delta_chars", "char_count", default=0))
        for row in filtered_rows
        if row["event_type"] == "edit.delete"
    )
    replace_count = sum(1 for row in filtered_rows if row["event_type"] == "edit.replace")

    pause_durations_ms = [
        _safe_int(_payload_value(row["payload"], "pause_time_ms", "duration_ms", default=0))
        for row in filtered_rows
        if row["event_type"] == "cursor.pause"
    ]
    pause_count = len(pause_durations_ms)
    pause_time_ms = sum(pause_durations_ms)
    max_pause_ms = max(pause_durations_ms) if pause_durations_ms else 0

    run_count = sum(1 for row in filtered_rows if row["event_type"] == "run")
    submit_count = sum(1 for row in filtered_rows if row["event_type"] == "submit")

    file_sequence = [
        str(_payload_value(row["payload"], "file_id_hash", default=""))
        for row in filtered_rows
        if _payload_value(row["payload"], "file_id_hash", default="")
    ]
    distinct_file_count = len(set(file_sequence))
    branch_switch_count = sum(
        1
        for index in range(1, len(file_sequence))
        if file_sequence[index] != file_sequence[index - 1]
    )
    branch_switch_score = _round_score(
        branch_switch_count / max(len(file_sequence) - 1, 1)
    ) if len(file_sequence) > 1 else 0.0

    total_edit_chars = insert_chars + delete_chars
    delete_ratio = round(delete_chars / total_edit_chars, 4) if total_edit_chars else 0.0
    edit_interval_mean_ms = round(mean(edit_intervals_ms), 4) if edit_intervals_ms else 0.0
    edit_interval_cv = round(
        pstdev(edit_intervals_ms) / mean(edit_intervals_ms),
        4,
    ) if len(edit_intervals_ms) >= 2 and mean(edit_intervals_ms) else 0.0
    window_ms = window_seconds * 1000
    pause_ratio = round(pause_time_ms / window_ms, 4) if window_ms else 0.0
    backtrack_loop_score = _round_score(
        (delete_chars + replace_count * 8) / max(total_edit_chars + replace_count * 8, 1)
    ) if (total_edit_chars or replace_count) else 0.0
    window_minutes = window_seconds / 60 if window_seconds else 0
    attempt_freq_per_min = round((run_count + submit_count) / window_minutes, 4) if window_minutes else 0.0

    feature_values = {
        "event_count": len(filtered_rows),
        "edit_count": len(edit_rows),
        "insert_chars": insert_chars,
        "delete_chars": delete_chars,
        "replace_count": replace_count,
        "pause_count": pause_count,
        "pause_time_ms": pause_time_ms,
        "max_pause_ms": max_pause_ms,
        "run_count": run_count,
        "submit_count": submit_count,
        "distinct_file_count": distinct_file_count,
        "delete_ratio": delete_ratio,
        "edit_interval_mean_ms": edit_interval_mean_ms,
        "edit_interval_cv": edit_interval_cv,
        "pause_ratio": pause_ratio,
        "backtrack_loop_score": backtrack_loop_score,
        "attempt_freq_per_min": attempt_freq_per_min,
        "branch_switch_score": branch_switch_score,
    }
    return save_snapshot(connection, session_id, start_dt.isoformat(), end_dt.isoformat(), feature_values)
