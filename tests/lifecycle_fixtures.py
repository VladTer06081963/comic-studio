"""Shared lifecycle fixtures used by both Python and Node runtime tests."""

LIFECYCLE_CASES = [
    {"from": "draft", "operation": "approve", "to": "approved", "allowed": True},
    {"from": "draft", "operation": "reject", "to": "rejected", "allowed": True},
    {"from": "approved", "operation": "approve", "to": "approved", "allowed": True, "idempotent": True},
    {"from": "approved", "operation": "reject", "allowed": False, "code": "INVALID_TRANSITION"},
    {"from": "rejected", "operation": "approve", "allowed": False, "code": "INVALID_TRANSITION"},
    {"from": "published", "operation": "render", "allowed": False, "code": "PUBLISHED_IMMUTABLE"},
    {"from": "published", "operation": "remix", "allowed": True, "creates": "draft"},
    {"from": "draft", "operation": "revise", "allowed": False, "code": "APPROVAL_REQUIRED"},
    {"from": "rendered", "operation": "render", "mode": "initial", "allowed": False, "code": "RERENDER_CONFIRMATION_REQUIRED"},
    {"from": "rendered", "operation": "render", "mode": "rerender", "allowed": True},
    {"from": "approved", "operation": "revise", "allowed": True, "revoke_approval": True},
    {"from": "rendered", "operation": "revise", "allowed": True, "revoke_approval": True, "legacy_staging": True},
    {"from": "draft", "operation": "render", "allowed": False, "code": "APPROVAL_REQUIRED"},
    {"from": "rejected", "operation": "render", "allowed": False, "code": "APPROVAL_REQUIRED"},
]


def operations_by_state() -> dict:
    grouped: dict = {}
    for case in LIFECYCLE_CASES:
        grouped.setdefault(case["from"], []).append(case)
    return grouped
