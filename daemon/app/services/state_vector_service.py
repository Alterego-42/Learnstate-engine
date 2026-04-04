from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from statistics import mean
from typing import Any

from ..repositories import get_latest_state_vector, save_state_vector


DIMENSION_ALPHA = 0.35
STATE_ALPHA = 0.30
SWITCH_MARGIN = 0.12
SWITCH_CONFIRM_FRAMES = 2
SEVERE_STATE_BYPASS_SCORE = 0.85
HIGH_CONFIDENCE_THRESHOLD = 0.70
HIGH_SCORE_THRESHOLD = 0.72
REMINDER_COOLDOWN_SECONDS = 90
TOP_STATE_LIMIT = 2
SEVERE_TRIGGER_STATES = {"looping", "structural_stuck", "attention_drop"}
STATE_FAMILIES = {
    "steady_flow": "flow",
    "careful_progression": "flow",
    "local_debugging": "explore",
    "branch_exploration": "explore",
    "minor_stuck": "stuck",
    "looping": "stuck",
    "structural_stuck": "stuck",
    "deep_thinking": "attention",
    "attention_drop": "attention",
}
STATE_SCORE_TERMS: dict[str, list[dict[str, Any]]] = {
    "steady_flow": [
        {"feature": "stability", "mode": "up", "weight": 0.40},
        {"feature": "rhythm", "mode": "up", "weight": 0.35},
        {"feature": "friction", "mode": "down", "weight": 0.25},
    ],
    "careful_progression": [
        {"feature": "stability", "mode": "up", "weight": 0.40},
        {"feature": "exploration", "mode": "down", "weight": 0.30},
        {"feature": "friction", "mode": "down", "weight": 0.30},
    ],
    "local_debugging": [
        {"feature": "exploration", "mode": "up", "weight": 0.40},
        {"feature": "friction", "mode": "up", "weight": 0.35},
        {"feature": "stability", "mode": "up", "weight": 0.25},
    ],
    "branch_exploration": [
        {"feature": "exploration", "mode": "up", "weight": 0.55},
        {"feature": "stability", "mode": "up", "weight": 0.25},
        {"feature": "friction", "mode": "down", "weight": 0.20},
    ],
    "minor_stuck": [
        {"feature": "friction", "mode": "up", "weight": 0.45},
        {"feature": "rhythm", "mode": "down", "weight": 0.30},
        {"feature": "stability", "mode": "down", "weight": 0.25},
    ],
    "looping": [
        {"feature": "backtrack_loop_score", "mode": "up", "weight": 0.45},
        {"feature": "friction", "mode": "up", "weight": 0.25},
        {"feature": "delete_ratio", "mode": "up", "weight": 0.20},
        {"feature": "attempt_frequency", "mode": "up", "weight": 0.10},
    ],
    "structural_stuck": [
        {"feature": "friction", "mode": "up", "weight": 0.40},
        {"feature": "long_pause_ratio", "mode": "up", "weight": 0.30},
        {"feature": "stability", "mode": "down", "weight": 0.30},
    ],
    "deep_thinking": [
        {"feature": "long_pause_ratio", "mode": "up", "weight": 0.40},
        {"feature": "stability", "mode": "up", "weight": 0.30},
        {"feature": "friction", "mode": "down", "weight": 0.30},
    ],
    "attention_drop": [
        {"feature": "long_pause_ratio", "mode": "up", "weight": 0.40},
        {"feature": "rhythm", "mode": "down", "weight": 0.30},
        {"feature": "stability", "mode": "down", "weight": 0.30},
    ],
}
EVIDENCE_LABELS = {
    "stability": "稳定性",
    "exploration": "探索性",
    "friction": "摩擦",
    "rhythm": "节奏",
    "backtrack_loop_score": "回退循环",
    "delete_ratio": "删除率",
    "attempt_frequency": "尝试频率",
    "long_pause_ratio": "长暂停",
}


def _normalize_short_text(value: Any) -> str:
    text = str(value or "").strip()
    return text[:200] if text else "state inferred locally"


def _clamp(value: Any, lower: float = 0.0, upper: float = 1.0) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        numeric = 0.0
    return max(lower, min(upper, numeric))


def _round_score(value: Any) -> float:
    return round(_clamp(value), 4)


def _safe_iso_to_datetime(value: Any) -> datetime:
    text = str(value or "").replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        dt = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _smooth_score(current: float, previous: float | None, alpha: float) -> float:
    if previous is None:
        return _round_score(current)
    return _round_score(alpha * current + (1 - alpha) * previous)


def _get_nested(mapping: dict[str, Any] | None, *keys: str) -> Any:
    current: Any = mapping or {}
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def _extract_engine_cache(prev_state: dict[str, Any] | None) -> tuple[dict[str, float], dict[str, float], dict[str, Any]]:
    prev_dimensions = {}
    prev_display_scores = {}
    prev_engine = {}
    if not prev_state:
        return prev_dimensions, prev_display_scores, prev_engine

    dimension_scores = prev_state.get("dimension_scores")
    if isinstance(dimension_scores, dict):
        for key in ("stability", "exploration", "friction", "rhythm"):
            entry = dimension_scores.get(key)
            if isinstance(entry, dict):
                prev_dimensions[key] = _clamp(entry.get("smoothed", entry.get("raw", 0.0)))
            else:
                prev_dimensions[key] = _clamp(entry)
        cached_scores = dimension_scores.get("_display_scores")
        if isinstance(cached_scores, dict):
            prev_display_scores = {str(key): _clamp(value) for key, value in cached_scores.items()}
        engine_meta = dimension_scores.get("_engine")
        if isinstance(engine_meta, dict):
            prev_engine = dict(engine_meta)
    return prev_dimensions, prev_display_scores, prev_engine


def _normalize_feature_inputs(feature_snapshot: dict[str, Any]) -> tuple[dict[str, float], float]:
    values = feature_snapshot.get("feature_values") or {}
    if not isinstance(values, dict):
        values = {}

    required = {
        "delete_ratio": _clamp(values.get("delete_ratio")),
        "cv_inter_edit_gap": _clamp(values.get("edit_interval_cv")),
        "idle_ratio": _clamp(values.get("pause_ratio")),
        "long_pause_ratio": _clamp(_clamp(values.get("max_pause_ms"), 0.0, 30000.0) / 30000.0),
        "backtrack_loop_score": _clamp(values.get("backtrack_loop_score")),
        "branch_switch_score": _clamp(values.get("branch_switch_score")),
        "file_switch_rate": _clamp(values.get("branch_switch_score")),
        "attempt_frequency": _clamp(_clamp(values.get("attempt_freq_per_min"), 0.0, 4.0) / 4.0),
    }
    present_count = sum(
        1
        for key in (
            "delete_ratio",
            "edit_interval_cv",
            "pause_ratio",
            "max_pause_ms",
            "backtrack_loop_score",
            "branch_switch_score",
            "attempt_freq_per_min",
        )
        if values.get(key) is not None
    )
    if values.get("branch_switch_score") is not None:
        present_count += 1
    data_quality = present_count / 8
    return required, _round_score(data_quality)


def _build_dimension_scores(features: dict[str, float], prev_dimensions: dict[str, float]) -> dict[str, dict[str, Any]]:
    raw_scores = {
        "stability": 1
        - (
            0.35 * features["cv_inter_edit_gap"]
            + 0.20 * features["delete_ratio"]
            + 0.30 * features["backtrack_loop_score"]
            + 0.15 * features["file_switch_rate"]
        ),
        "exploration": (
            0.45 * features["branch_switch_score"]
            + 0.30 * features["file_switch_rate"]
            + 0.25 * features["attempt_frequency"]
        ),
        "friction": (
            0.40 * features["backtrack_loop_score"]
            + 0.25 * features["idle_ratio"]
            + 0.20 * features["delete_ratio"]
            + 0.15 * features["cv_inter_edit_gap"]
        ),
        "rhythm": 1
        - (
            0.45 * features["cv_inter_edit_gap"]
            + 0.30 * features["idle_ratio"]
            + 0.25 * features["long_pause_ratio"]
        ),
    }
    payload: dict[str, dict[str, Any]] = {}
    for key, raw_value in raw_scores.items():
        raw = _round_score(raw_value)
        smoothed = _smooth_score(raw, prev_dimensions.get(key), DIMENSION_ALPHA)
        if smoothed >= 0.67:
            band = "high"
        elif smoothed >= 0.34:
            band = "mid"
        else:
            band = "low"
        payload[key] = {
            "raw": raw,
            "smoothed": smoothed,
            "band": band,
        }
    return payload


def _state_inputs(dimension_scores: dict[str, dict[str, Any]], features: dict[str, float]) -> dict[str, float]:
    return {
        "stability": _clamp(_get_nested(dimension_scores, "stability", "smoothed")),
        "exploration": _clamp(_get_nested(dimension_scores, "exploration", "smoothed")),
        "friction": _clamp(_get_nested(dimension_scores, "friction", "smoothed")),
        "rhythm": _clamp(_get_nested(dimension_scores, "rhythm", "smoothed")),
        "backtrack_loop_score": features["backtrack_loop_score"],
        "delete_ratio": features["delete_ratio"],
        "attempt_frequency": features["attempt_frequency"],
        "long_pause_ratio": features["long_pause_ratio"],
    }


def _score_terms(state_key: str, inputs: dict[str, float]) -> tuple[float, list[dict[str, Any]]]:
    contributions: list[dict[str, Any]] = []
    total = 0.0
    for term in STATE_SCORE_TERMS[state_key]:
        observed = _clamp(inputs.get(term["feature"]))
        contribution = term["weight"] * observed if term["mode"] == "up" else term["weight"] * (1 - observed)
        total += contribution
        contributions.append(
            {
                "feature": term["feature"],
                "direction": "up" if term["mode"] == "up" else "down",
                "observed": _round_score(observed),
                "contribution": _round_score(contribution),
            }
        )
    contributions.sort(key=lambda item: item["contribution"], reverse=True)
    return _round_score(total), contributions


def _build_state_scores(
    dimension_scores: dict[str, dict[str, Any]],
    features: dict[str, float],
    prev_display_scores: dict[str, float],
) -> tuple[dict[str, float], dict[str, list[dict[str, Any]]]]:
    inputs = _state_inputs(dimension_scores, features)
    smoothed_scores: dict[str, float] = {}
    contributions_map: dict[str, list[dict[str, Any]]] = {}
    for state_key in STATE_SCORE_TERMS:
        raw_score, contributions = _score_terms(state_key, inputs)
        smoothed_scores[state_key] = _smooth_score(raw_score, prev_display_scores.get(state_key), STATE_ALPHA)
        contributions_map[state_key] = contributions
    return smoothed_scores, contributions_map


def _resolve_primary_state(
    sorted_scores: list[tuple[str, float]],
    prev_engine: dict[str, Any],
) -> tuple[str, dict[str, Any]]:
    candidate_key, candidate_score = sorted_scores[0]
    prev_primary = str(prev_engine.get("primary_state") or "")
    prev_pending_key = str(prev_engine.get("pending_state") or "")
    prev_pending_count = int(prev_engine.get("pending_count") or 0)
    resolved = {
        "primary_state": candidate_key,
        "pending_state": None,
        "pending_count": 0,
    }
    if not prev_primary or prev_primary == candidate_key:
        return candidate_key, resolved

    prev_primary_score = dict(sorted_scores).get(prev_primary, 0.0)
    margin = candidate_score - prev_primary_score
    if candidate_key in SEVERE_TRIGGER_STATES and candidate_score >= SEVERE_STATE_BYPASS_SCORE:
        return candidate_key, resolved
    if margin < SWITCH_MARGIN:
        return prev_primary, {"primary_state": prev_primary, "pending_state": None, "pending_count": 0}

    if prev_pending_key == candidate_key and prev_pending_count + 1 >= SWITCH_CONFIRM_FRAMES:
        return candidate_key, resolved

    return prev_primary, {
        "primary_state": prev_primary,
        "pending_state": candidate_key,
        "pending_count": 1 if prev_pending_key != candidate_key else prev_pending_count + 1,
    }


def _compose_top_states(
    display_scores: dict[str, float],
    primary_state: str,
    overall_confidence: float,
    contributions_map: dict[str, list[dict[str, Any]]],
    top_level_evidence: str,
    trigger_ready: bool,
    trigger_state: str | None,
    trigger_meta: dict[str, Any],
) -> list[dict[str, Any]]:
    ordered = sorted(display_scores.items(), key=lambda item: item[1], reverse=True)
    top_keys = [primary_state]
    for state_key, _ in ordered:
        if state_key != primary_state:
            top_keys.append(state_key)
        if len(top_keys) >= TOP_STATE_LIMIT:
            break

    top_states = []
    for index, state_key in enumerate(top_keys):
        score = display_scores.get(state_key, 0.0)
        state_confidence = _round_score(0.65 * score + 0.35 * overall_confidence)
        evidence_payload = {
            "short_text": top_level_evidence if index == 0 else f"次高状态为 {state_key}。",
            "evidence_items": contributions_map.get(state_key, [])[:3],
        }
        state_payload = {
            "state_key": state_key,
            "family": STATE_FAMILIES.get(state_key, "unknown"),
            "score": score,
            "confidence": state_confidence,
            "evidence_summary": evidence_payload,
            "trigger_ready": bool(trigger_ready and trigger_state == state_key),
        }
        if index == 0:
            state_payload["meta"] = {
                "consecutive_frames": int(trigger_meta.get("consecutive_frames", 1)),
                "last_triggered_at": trigger_meta.get("last_triggered_at"),
            }
        top_states.append(state_payload)
    return top_states


def _build_evidence_summary(state_key: str, contributions: list[dict[str, Any]]) -> dict[str, Any]:
    top_items = contributions[:3]
    phrases = []
    for item in top_items[:2]:
        label = EVIDENCE_LABELS.get(item["feature"], item["feature"])
        if item["direction"] == "up":
            phrases.append(f"{label}偏高")
        else:
            phrases.append(f"{label}偏低")
    short_text = "、".join(phrases) if phrases else "局部行为信号稳定"
    return {
        "short_text": f"{short_text}，因此判断为 {state_key}。",
        "evidence_items": top_items,
    }


def _compute_confidence(
    display_scores: dict[str, float],
    dimension_scores: dict[str, dict[str, Any]],
    prev_dimensions: dict[str, float],
    top_contributions: list[dict[str, Any]],
    data_quality: float,
) -> float:
    ordered = sorted(display_scores.values(), reverse=True)
    if len(ordered) >= 3:
        separation = _round_score(ordered[0] - ordered[2])
    elif len(ordered) >= 2:
        separation = _round_score(ordered[0] - ordered[1])
    else:
        separation = 0.0

    current_dims = [dimension_scores[key]["smoothed"] for key in ("stability", "exploration", "friction", "rhythm")]
    if prev_dimensions:
        deltas = [
            abs(current_dims[index] - prev_dimensions.get(key, current_dims[index]))
            for index, key in enumerate(("stability", "exploration", "friction", "rhythm"))
        ]
        temporal_consistency = _round_score(1 - mean(deltas))
    else:
        temporal_consistency = 0.5

    evidence_strength = _round_score(mean(item["contribution"] for item in top_contributions[:3])) if top_contributions else 0.0
    overall = (
        0.30 * data_quality
        + 0.35 * separation
        + 0.20 * temporal_consistency
        + 0.15 * evidence_strength
    )
    return _round_score(overall)


def _compute_trigger_state(
    *,
    primary_state: str,
    primary_score: float,
    primary_confidence: float,
    display_scores: dict[str, float],
    dimension_scores: dict[str, dict[str, Any]],
    features: dict[str, float],
    snapshot_time: datetime,
    prev_engine: dict[str, Any],
) -> tuple[bool, dict[str, Any]]:
    per_state_thresholds = {
        "looping": (
            primary_score >= HIGH_SCORE_THRESHOLD
            and features["backtrack_loop_score"] >= 0.70
            and dimension_scores["friction"]["smoothed"] >= 0.65
        ),
        "structural_stuck": (
            primary_score >= 0.74
            and features["long_pause_ratio"] >= 0.65
            and dimension_scores["stability"]["smoothed"] <= 0.45
        ),
        "attention_drop": (
            primary_score >= 0.74
            and features["long_pause_ratio"] >= 0.70
            and dimension_scores["rhythm"]["smoothed"] <= 0.40
        ),
    }
    previous_primary = str(prev_engine.get("primary_state") or "")
    previous_consecutive = int(prev_engine.get("consecutive_frames") or 0)
    consecutive_frames = previous_consecutive + 1 if previous_primary == primary_state else 1

    last_triggered_map = prev_engine.get("last_triggered_at_map")
    if not isinstance(last_triggered_map, dict):
        last_triggered_map = {}
    last_triggered_at = last_triggered_map.get(primary_state)
    trigger_ready = False
    if (
        primary_state in SEVERE_TRIGGER_STATES
        and primary_confidence >= HIGH_CONFIDENCE_THRESHOLD
        and primary_score >= HIGH_SCORE_THRESHOLD
        and consecutive_frames >= SWITCH_CONFIRM_FRAMES
        and per_state_thresholds.get(primary_state, False)
    ):
        cooldown_ok = True
        if last_triggered_at:
            cooldown_ok = (snapshot_time - _safe_iso_to_datetime(last_triggered_at)).total_seconds() >= REMINDER_COOLDOWN_SECONDS
        trigger_ready = cooldown_ok
        if trigger_ready:
            last_triggered_map[primary_state] = snapshot_time.isoformat()

    engine_meta = {
        "primary_state": primary_state,
        "consecutive_frames": consecutive_frames,
        "last_triggered_at": last_triggered_map.get(primary_state),
        "last_triggered_at_map": last_triggered_map,
    }
    return trigger_ready, engine_meta


def infer_state(feature_snapshot: dict[str, Any], prev_state: dict[str, Any] | None = None) -> dict[str, Any]:
    prev_dimensions, prev_display_scores, prev_engine = _extract_engine_cache(prev_state)
    features, data_quality = _normalize_feature_inputs(feature_snapshot)
    dimension_scores = _build_dimension_scores(features, prev_dimensions)
    display_scores, contributions_map = _build_state_scores(dimension_scores, features, prev_display_scores)
    ordered_scores = sorted(display_scores.items(), key=lambda item: item[1], reverse=True)
    primary_state, hysteresis_meta = _resolve_primary_state(ordered_scores, prev_engine)
    snapshot_time = _safe_iso_to_datetime(
        feature_snapshot.get("window_end") or feature_snapshot.get("created_at") or datetime.now(timezone.utc).isoformat()
    )
    primary_score = display_scores.get(primary_state, 0.0)
    evidence_payload = _build_evidence_summary(primary_state, contributions_map.get(primary_state, []))
    overall_confidence = _compute_confidence(
        display_scores,
        dimension_scores,
        prev_dimensions,
        contributions_map.get(primary_state, []),
        data_quality,
    )
    primary_confidence = _round_score(0.65 * primary_score + 0.35 * overall_confidence)
    trigger_ready, trigger_meta = _compute_trigger_state(
        primary_state=primary_state,
        primary_score=primary_score,
        primary_confidence=primary_confidence,
        display_scores=display_scores,
        dimension_scores=dimension_scores,
        features=features,
        snapshot_time=snapshot_time,
        prev_engine={**prev_engine, **hysteresis_meta},
    )
    engine_meta = {**hysteresis_meta, **trigger_meta}
    dimension_scores["_display_scores"] = {key: _round_score(value) for key, value in display_scores.items()}
    dimension_scores["_engine"] = engine_meta
    top_states = _compose_top_states(
        display_scores=display_scores,
        primary_state=primary_state,
        overall_confidence=overall_confidence,
        contributions_map=contributions_map,
        top_level_evidence=evidence_payload["short_text"],
        trigger_ready=trigger_ready,
        trigger_state=primary_state,
        trigger_meta=trigger_meta,
    )
    return {
        "session_id": str(feature_snapshot.get("session_id") or ""),
        "snapshot_id": feature_snapshot.get("snapshot_id"),
        "dimension_scores": dimension_scores,
        "top_states": top_states,
        "confidence": overall_confidence,
        "evidence_summary": json.dumps(evidence_payload, ensure_ascii=False),
        "generated_at": snapshot_time.isoformat(),
        "source": "agent_c_rule_engine_v1",
    }


def normalize_evidence_summary(evidence_summary: str | dict[str, Any] | None) -> str:
    if evidence_summary is None:
        payload: dict[str, Any] = {"short_text": "state inferred locally"}
    elif isinstance(evidence_summary, str):
        text = evidence_summary.strip()
        if not text:
            payload = {"short_text": "state inferred locally"}
        else:
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                payload = {"short_text": _normalize_short_text(text)}
            else:
                if isinstance(parsed, dict):
                    payload = dict(parsed)
                else:
                    payload = {"short_text": _normalize_short_text(parsed)}
    elif isinstance(evidence_summary, dict):
        payload = dict(evidence_summary)
    else:
        payload = {"short_text": _normalize_short_text(evidence_summary)}

    payload["short_text"] = _normalize_short_text(payload.get("short_text"))
    return json.dumps(payload, ensure_ascii=False)


def normalize_top_states(top_states: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for index, state in enumerate(top_states[:2]):
        item = dict(state)
        evidence = item.get("evidence_summary")
        if isinstance(evidence, dict):
            evidence_payload = dict(evidence)
        else:
            evidence_payload = {"short_text": _normalize_short_text(evidence)}
        evidence_payload["short_text"] = _normalize_short_text(evidence_payload.get("short_text"))

        normalized_item = {
            "state_key": str(item.get("state_key") or f"unknown_{index}"),
            "family": str(item.get("family") or "unknown"),
            "score": round(float(item.get("score", 0.0)), 4),
            "confidence": round(float(item.get("confidence", item.get("score", 0.0))), 4),
            "evidence_summary": evidence_payload,
            "trigger_ready": bool(item.get("trigger_ready", False)),
        }
        if isinstance(item.get("meta"), dict):
            normalized_item["meta"] = dict(item["meta"])
        normalized.append(normalized_item)
    return normalized


def write_state_vector_v1(
    connection: sqlite3.Connection,
    *,
    session_id: str,
    snapshot_id: str | None,
    dimension_scores: dict[str, Any],
    top_states: list[dict[str, Any]],
    confidence: float,
    evidence_summary: str | dict[str, Any] | None,
    generated_at: str | None = None,
    source: str = "agent_c",
) -> dict[str, Any]:
    normalized_top_states = normalize_top_states(top_states)
    normalized_evidence_summary = normalize_evidence_summary(evidence_summary)
    normalized_confidence = round(max(0.0, min(float(confidence), 1.0)), 4)
    normalized_dimension_scores = {
        str(key): round(float(value), 4) if isinstance(value, (int, float)) else value
        for key, value in dimension_scores.items()
    }

    return save_state_vector(
        connection=connection,
        session_id=session_id,
        snapshot_id=snapshot_id,
        dimension_scores=normalized_dimension_scores,
        top_states=normalized_top_states,
        confidence=normalized_confidence,
        evidence_summary=normalized_evidence_summary,
        generated_at=generated_at,
        source=source,
    )


def infer_and_write_state_vector_v1(
    connection: sqlite3.Connection,
    *,
    feature_snapshot: dict[str, Any],
    prev_state: dict[str, Any] | None = None,
    source: str = "agent_c_rule_engine_v1",
) -> dict[str, Any]:
    prior_state = prev_state or get_latest_state_vector(connection, feature_snapshot["session_id"])
    inferred = infer_state(feature_snapshot, prior_state)
    return write_state_vector_v1(
        connection=connection,
        session_id=inferred["session_id"],
        snapshot_id=inferred.get("snapshot_id"),
        dimension_scores=inferred["dimension_scores"],
        top_states=inferred["top_states"],
        confidence=inferred["confidence"],
        evidence_summary=inferred["evidence_summary"],
        generated_at=inferred.get("generated_at"),
        source=source,
    )
