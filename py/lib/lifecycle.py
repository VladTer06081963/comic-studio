"""Shared lifecycle helpers for scenario state transitions.

All state changes use atomic write-then-rename to avoid corruption on crash.
Transitions are idempotent: repeated calls return current state without error.
"""
from __future__ import annotations

from datetime import datetime as _dt

import json
import os
from pathlib import Path
from typing import Optional

from py.lib.config import scenarios_dir
from py.lib.logging_setup import setup

logger = setup("lib.lifecycle")

# Canonical states in order
STATES = ("draft", "approved", "rejected", "rendered", "published")
VALID_STATES = frozenset(STATES)


def _atomic_write(path: Path, data: dict) -> None:
    """Write JSON atomically: temp file → flush → rename."""
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def load_scenario(scenario_id: str) -> Optional[dict]:
    """Load scenario JSON from any lifecycle queue by ID."""
    for status in STATES:
        p = scenarios_dir(status) / f"{scenario_id}.json"
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8"))
    return None


def get_scenario_status(scenario_id: str) -> Optional[str]:
    """Return current status string or None if not found."""
    sc = load_scenario(scenario_id)
    return sc.get("status") if sc else None


def transition(
    scenario_id: str,
    from_status: Optional[str],
    to_status: str,
    extra_fields: Optional[dict] = None,
) -> Optional[dict]:
    """Atomically move a scenario between lifecycle queues.

    - If from_status is None, the scenario is found automatically.
    - If the scenario is already in to_status, returns it without error (idempotent).
    - Raises ValueError for invalid status values.

    Returns the updated scenario dict, or None if not found.
    """
    if to_status not in VALID_STATES:
        raise ValueError(f"Invalid target status: {to_status!r}. Must be one of {STATES}")

    # Idempotent: already in target state
    current = load_scenario(scenario_id)
    if current:
        if current.get("status") == to_status:
            logger.info(f"Scenario {scenario_id} already {to_status}, skipping")
            return current

        if from_status is not None and current.get("status") != from_status:
            logger.warning(
                f"Scenario {scenario_id} is '{current.get('status')}', "
                f"not '{from_status}' — rejecting transition"
            )
            return None

    # Locate source
    src_dir = scenarios_dir(from_status if from_status else "draft")
    src_path = src_dir / f"{scenario_id}.json"

    # If auto-finding and not in expected dir, search
    if not src_path.exists() and from_status:
        for s in STATES:
            p = scenarios_dir(s) / f"{scenario_id}.json"
            if p.exists():
                src_path = p
                break
        else:
            logger.error(f"Scenario {scenario_id} not found in any queue")
            return None

    if not src_path.exists():
        logger.error(f"Scenario {scenario_id} not found in {src_dir}")
        return None

    sc = json.loads(src_path.read_text(encoding="utf-8"))

    # Validate
    if from_status and sc.get("status") != from_status:
        logger.warning(
            f"Scenario {scenario_id} status is '{sc.get('status')}', "
            f"expected '{from_status}'"
        )
        return None

    # Apply transition
    sc["status"] = to_status
    sc[f"{to_status}_at"] = _dt.now().isoformat()
    if extra_fields:
        sc.update(extra_fields)

    # Write target
    dst_dir = scenarios_dir(to_status)
    dst_path = dst_dir / f"{scenario_id}.json"
    _atomic_write(dst_path, sc)

    # Remove source (only if different path)
    if src_path != dst_path:
        src_path.unlink(missing_ok=True)

    logger.info(f"Transitioned {scenario_id}: {sc.get('status')} → {to_status}")
    return sc


def approve(scenario_id: str) -> Optional[dict]:
    """Approve a draft scenario. Idempotent."""
    return transition(scenario_id, from_status="draft", to_status="approved")


def reject(scenario_id: str) -> Optional[dict]:
    """Reject a draft scenario. Idempotent."""
    return transition(scenario_id, from_status="draft", to_status="rejected")


def mark_rendered(
    scenario_id: str,
    comic_path: str,
    panel_paths: Optional[list[str]] = None,
    seed: Optional[int] = None,
) -> Optional[dict]:
    """Mark an approved scenario as rendered with canonical artifact metadata."""
    extra: dict = {"comic_path": comic_path, "render_revision": 1}
    if panel_paths is not None:
        extra["panel_paths"] = panel_paths
    if seed is not None:
        extra["seed"] = seed
    return transition(
        scenario_id,
        from_status="approved",
        to_status="rendered",
        extra_fields=extra,
    )


def update_in_place(scenario_id: str, status: str, extra_fields: dict) -> Optional[dict]:
    """Atomically update a scenario without changing its lifecycle queue."""
    if status not in VALID_STATES:
        raise ValueError(f"Invalid status: {status!r}")
    path = scenarios_dir(status) / f"{scenario_id}.json"
    if not path.exists():
        logger.error(f"Scenario {scenario_id} not found in {status}")
        return None
    scenario = json.loads(path.read_text(encoding="utf-8"))
    if scenario.get("status") != status:
        logger.error(f"Scenario {scenario_id} status mismatch in {status}")
        return None
    scenario.update(extra_fields)
    _atomic_write(path, scenario)
    logger.info(f"Updated {scenario_id} in place ({status})")
    return scenario


def mark_published(scenario_id: str, published_url: Optional[str] = None) -> Optional[dict]:
    """Mark a rendered scenario as published. Idempotent."""
    extra = {}
    if published_url:
        extra["published_url"] = published_url
    return transition(
        scenario_id,
        from_status="rendered",
        to_status="published",
        extra_fields=extra or None,
    )


def validate_approved(scenario_id: str) -> Optional[dict]:
    """Load a scenario and verify it is in approved status.

    This is the defense-in-depth gate called immediately before any
    image-generation request. Returns the scenario dict if valid, None otherwise.
    """
    sc = load_scenario(scenario_id)
    if not sc:
        logger.error(f"{scenario_id}: scenario not found")
        return None
    if sc.get("status") != "approved":
        logger.error(
            f"{scenario_id}: status is '{sc.get('status')}', expected 'approved' — "
            "render blocked"
        )
        return None
    return sc
