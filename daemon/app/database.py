from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from .config import config


SCHEMA_SQL = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    user_local_id TEXT NOT NULL,
    task_id TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT,
    session_index INTEGER NOT NULL,
    split_reason TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    last_event_time TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_status
ON sessions(user_local_id, status, start_time DESC);

CREATE TABLE IF NOT EXISTS tasks (
    task_id TEXT PRIMARY KEY,
    task_type TEXT NOT NULL,
    title TEXT NOT NULL,
    difficulty_level TEXT,
    knowledge_tags TEXT NOT NULL DEFAULT '[]',
    source_type TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS raw_events (
    event_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    task_id TEXT,
    event_type TEXT NOT NULL,
    event_time TEXT NOT NULL,
    payload_summary TEXT NOT NULL DEFAULT '{}',
    source TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
    FOREIGN KEY(task_id) REFERENCES tasks(task_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_raw_events_session_time
ON raw_events(session_id, event_time DESC);

CREATE TABLE IF NOT EXISTS feature_snapshots (
    snapshot_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    window_start TEXT NOT NULL,
    window_end TEXT NOT NULL,
    feature_values TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_feature_snapshots_session_time
ON feature_snapshots(session_id, window_end DESC);

CREATE TABLE IF NOT EXISTS state_vectors (
    state_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    snapshot_id TEXT,
    dimension_scores TEXT NOT NULL DEFAULT '{}',
    top_states TEXT NOT NULL DEFAULT '[]',
    confidence REAL NOT NULL DEFAULT 0,
    evidence_summary TEXT,
    generated_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'inference_module',
    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
    FOREIGN KEY(snapshot_id) REFERENCES feature_snapshots(snapshot_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_state_vectors_session_time
ON state_vectors(session_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_data_dir() -> None:
    Path(config.database_path).parent.mkdir(parents=True, exist_ok=True)


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    ensure_data_dir()
    connection = sqlite3.connect(config.database_path)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database() -> None:
    ensure_data_dir()
    with get_connection() as connection:
        connection.executescript(SCHEMA_SQL)
        seed_settings(connection)
        seed_tasks(connection)


def seed_settings(connection: sqlite3.Connection) -> None:
    now = utc_now()
    for key, value in config.default_settings.items():
        connection.execute(
            """
            INSERT INTO settings(key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO NOTHING
            """,
            (key, json.dumps(value), now),
        )


def seed_tasks(connection: sqlite3.Connection) -> None:
    existing = connection.execute("SELECT COUNT(*) AS count FROM tasks").fetchone()["count"]
    if existing:
        return

    now = utc_now()
    demo_tasks = [
        (
            "demo-two-sum",
            "algorithm",
            "Two Sum Demo",
            "easy",
            json.dumps(["array", "hash-table"]),
            "builtin",
            now,
            now,
        ),
        (
            "demo-binary-search",
            "algorithm",
            "Binary Search Demo",
            "easy",
            json.dumps(["binary-search"]),
            "builtin",
            now,
            now,
        ),
    ]
    connection.executemany(
        """
        INSERT INTO tasks(
            task_id, task_type, title, difficulty_level, knowledge_tags,
            source_type, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        demo_tasks,
    )
