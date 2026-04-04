from __future__ import annotations

import sqlite3
from typing import Any

from ..repositories import event_summary_for_session, get_task_by_id, list_snapshots, list_state_vectors


def build_session_report(connection: sqlite3.Connection, session: dict[str, Any]) -> dict[str, Any]:
    summary = event_summary_for_session(connection, session["session_id"])
    snapshots = list_snapshots(connection, session["session_id"], limit=30)
    states = list_state_vectors(connection, session["session_id"], limit=30)
    task = get_task_by_id(connection, session["task_id"]) if session.get("task_id") else None
    summary["snapshot_count"] = len(snapshots)
    summary["state_count"] = len(states)
    summary["report_ready"] = bool(snapshots)
    summary["state_ready"] = bool(states)
    return {
        "session": session,
        "task": task,
        "summary": summary,
        "snapshots": list(reversed(snapshots)),
        "states": list(reversed(states)),
    }
