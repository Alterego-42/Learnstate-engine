from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from ..database import get_connection, initialize_database
from ..repositories import get_latest_snapshot, get_session_by_id, get_snapshot_by_id
from ..services.state_vector_service import write_state_vector_v1


if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def _load_payload(args: argparse.Namespace) -> dict[str, Any]:
    if args.input:
        return json.loads(Path(args.input).read_text(encoding="utf-8"))
    if args.stdin:
        return json.loads(sys.stdin.read())
    raise SystemExit("Provide --input <file> or --stdin")


def _resolve_session_and_snapshot(payload: dict[str, Any], args: argparse.Namespace) -> tuple[str, str | None]:
    session_id = payload.get("session_id") or args.session_id
    snapshot_id = payload.get("snapshot_id") or args.snapshot_id

    with get_connection() as connection:
        if snapshot_id and not session_id:
            snapshot = get_snapshot_by_id(connection, snapshot_id)
            if snapshot is None:
                raise SystemExit(f"snapshot not found: {snapshot_id}")
            session_id = snapshot["session_id"]
        if session_id and not snapshot_id and args.latest_snapshot:
            snapshot = get_latest_snapshot(connection, session_id)
            snapshot_id = snapshot["snapshot_id"] if snapshot else None
        if not session_id:
            raise SystemExit("session_id is required either in payload or CLI")
        if get_session_by_id(connection, session_id) is None:
            raise SystemExit(f"session not found: {session_id}")
    return session_id, snapshot_id


def main() -> None:
    parser = argparse.ArgumentParser(description="Write StateVector v1 into local SQLite.")
    parser.add_argument("--input", help="JSON file path")
    parser.add_argument("--stdin", action="store_true", help="Read one-line JSON from stdin")
    parser.add_argument("--session-id", help="Fallback session_id")
    parser.add_argument("--snapshot-id", help="Fallback snapshot_id")
    parser.add_argument("--latest-snapshot", action="store_true", help="Bind to latest snapshot of the session")
    parser.add_argument("--source", default="agent_c", help="state vector source label")
    args = parser.parse_args()

    initialize_database()
    payload = _load_payload(args)
    session_id, snapshot_id = _resolve_session_and_snapshot(payload, args)

    with get_connection() as connection:
        result = write_state_vector_v1(
            connection=connection,
            session_id=session_id,
            snapshot_id=snapshot_id,
            dimension_scores=payload.get("dimension_scores") or {},
            top_states=payload.get("top_states") or [],
            confidence=payload.get("confidence", 0.0),
            evidence_summary=payload.get("evidence_summary"),
            generated_at=payload.get("generated_at"),
            source=payload.get("source") or args.source,
        )
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
