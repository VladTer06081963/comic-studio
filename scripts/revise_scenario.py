"""Revise an existing scenario via MiniMax Text-01.

Thin CLI that forwards to `py.scenario.writer.revise_scenario` with bounded
feedback history. Designed to be invoked by the Web API through
`process_runner` (shell-disabled).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from py.scenario.writer import revise_scenario


def main() -> int:
    parser = argparse.ArgumentParser(description="Revise an existing scenario via LLM")
    parser.add_argument("--scenario-id", required=True, help="Canonical scenario ID")
    parser.add_argument("--scenario-path", required=True, help="Path to canonical scenario JSON")
    parser.add_argument("--feedback-file", help="Path to JSON array of feedback items")
    parser.add_argument("--feedback", help="Inline JSON array of feedback items")
    parser.add_argument("--source-context-file", help="Optional file with bounded source context")
    parser.add_argument("--source-context", help="Optional inline source context")
    parser.add_argument("--image-style", help="Override image style")
    parser.add_argument("--json-result", action="store_true", help="Print machine-readable result")
    parser.add_argument("--out", help="Optional path to write revised scenario JSON")
    args = parser.parse_args()

    if bool(args.feedback_file) == bool(args.feedback):
        parser.error("Provide exactly one of --feedback-file or --feedback")

    scenario_path = Path(args.scenario_path)
    current = json.loads(scenario_path.read_text(encoding="utf-8"))
    if current.get("id") != args.scenario_id:
        raise SystemExit(f"--scenario-id {args.scenario_id!r} does not match record id {current.get('id')!r}")

    if args.feedback_file:
        feedback = json.loads(Path(args.feedback_file).read_text(encoding="utf-8"))
    else:
        feedback = json.loads(args.feedback)
    if not isinstance(feedback, list) or not feedback:
        raise SystemExit("feedback list must be non-empty")

    source_context = args.source_context or ""
    if args.source_context_file:
        source_context = Path(args.source_context_file).read_text(encoding="utf-8")

    try:
        revised = revise_scenario(
            current,
            feedback,
            source_context=source_context,
            image_style=args.image_style,
        )
    except Exception as error:
        result = {"ok": False, "error": str(error)}
        if args.json_result:
            print(json.dumps(result, ensure_ascii=False))
        else:
            print(f"❌ {error}", file=sys.stderr)
        return 1

    out_path = Path(args.out) if args.out else scenario_path
    out_path.write_text(json.dumps(revised, ensure_ascii=False, indent=2), encoding="utf-8")

    result = {
        "ok": True,
        "id": revised["id"],
        "status": revised["status"],
        "path": str(out_path),
        "revision_at": revised["revision_at"],
        "feedback_count": len(feedback),
    }
    if args.json_result:
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(f"✅ Revised → {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
