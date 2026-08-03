"""Tests for `py/lib/scenario_resolver.py` — fuzzy scenario matching.

All tests use isolated `data/scenarios/` via `tempfile.TemporaryDirectory`.
NO live MiniMax, NO network calls, NO Telegram/Notion.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

# Ensure repo root is on sys.path
REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from py.lib import scenario_resolver as resolver  # noqa: E402


def make_scenario(
    scenario_id: str,
    title: str,
    status: str = "rendered",
    context: str = "",
    created_at: str = "2026-08-02T00:00:00",
) -> dict:
    return {
        "id": scenario_id,
        "title": title,
        "status": status,
        "context": context,
        "created_at": created_at,
        "tone": "funny",
        "style": "bubble",
        "panels": [],
    }


class TestScenarioResolver(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp_path = Path(self._tmp.name)
        # Patch `scenarios_dir` to use our temp dir
        self._patch = mock.patch.object(
            resolver, "scenarios_dir",
            side_effect=lambda status="draft": self.tmp_path / status,
        )
        self._patch.start()
        self.addCleanup(self._patch.stop)
        for state in ("draft", "approved", "rejected", "rendered", "published"):
            (self.tmp_path / state).mkdir(parents=True, exist_ok=True)

    def _write(self, status: str, scenario: dict) -> None:
        path = self.tmp_path / status / f"{scenario['id']}.json"
        path.write_text(json.dumps(scenario, ensure_ascii=False), encoding="utf-8")

    def test_explicit_id_returns_immediately(self):
        self._write("rendered", make_scenario("8eaa57cc", "Кот в одиночестве"))
        self._write("published", make_scenario("a52d7e46", "Кот-учитель"))
        result = resolver.resolve_scenario("8eaa57cc")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["id"], "8eaa57cc")
        self.assertEqual(result[0]["resolution_method"], "explicit_id")
        self.assertEqual(result[0]["confidence"], 1.0)
        # Even though "кот" would match both, ID short-circuit wins
        self.assertNotIn("ambiguity", result[0])

    def test_title_fuzzy_match_cyrillic(self):
        self._write("rendered", make_scenario("8eaa57cc", "Кот в одиночестве"))
        self._write("published", make_scenario("a52d7e46", "Кот-учитель"))
        result = resolver.resolve_scenario("кот")
        self.assertGreaterEqual(len(result), 1)
        # Both should match, sorted by confidence desc
        ids = [c["id"] for c in result]
        self.assertIn("8eaa57cc", ids)
        self.assertIn("a52d7e46", ids)
        for c in result:
            self.assertEqual(c["resolution_method"], "title_match")
            self.assertGreaterEqual(c["confidence"], 0.6)

    def test_context_fuzzy_match_weighted_07x(self):
        self._write(
            "rendered",
            make_scenario(
                "8eaa57cc",
                "Random title",
                context="Длинный контекст про кота, который сидит на окне и смотрит на птиц",
            ),
        )
        self._write("rendered", make_scenario("a52d7e46", "Another title", context="Про собак"))
        # Use a phrase that matches the context as substring (100), not the title (0)
        result = resolver.resolve_scenario("кот")
        self.assertGreaterEqual(len(result), 1)
        match = next((c for c in result if c["id"] == "8eaa57cc"), None)
        self.assertIsNotNone(match)
        # Title score is 0 (no "кот" in "Random title"), so context match wins
        self.assertEqual(match["resolution_method"], "context_match")
        # Context score is weighted 0.7x → at most 0.7
        self.assertLessEqual(match["confidence"], 0.7)
        # ...and the title-match scenario ("Про Сашу"-style) didn't pass the floor
        self.assertNotIn("a52d7e46", [c["id"] for c in result if c.get("ambiguity")])

    def test_recency_fallback_for_last_rendered(self):
        # Two rendered scenarios, the second is newer
        self._write("rendered", make_scenario("old0001", "Старый", created_at="2026-01-01T00:00:00"))
        self._write("rendered", make_scenario("new0002", "Новый", created_at="2026-08-02T00:00:00"))
        result = resolver.resolve_scenario("поменяй последний")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["id"], "new0002")
        self.assertEqual(result[0]["resolution_method"], "recency")
        self.assertEqual(result[0]["confidence"], 0.5)

    def test_disambiguation_with_close_scores(self):
        # Two very similar titles
        self._write("rendered", make_scenario("aaaa1111", "Кот в одиночестве"))
        self._write("rendered", make_scenario("bbbb2222", "Кот-учитель"))
        result = resolver.resolve_scenario("кот")
        self.assertGreaterEqual(len(result), 2)
        # Top-2 scores should be close enough → ambiguity flag
        self.assertTrue(result[0].get("ambiguity"))
        self.assertTrue(result[1].get("ambiguity"))

    def test_low_confidence_filtered_out(self):
        self._write("rendered", make_scenario("aaaa1111", "Совершенно другое название"))
        result = resolver.resolve_scenario("xyz123")
        self.assertEqual(result, [])

    def test_empty_data_dir_returns_empty(self):
        # No scenarios written
        result = resolver.resolve_scenario("anything")
        self.assertEqual(result, [])

    def test_injected_scenarios_skips_disk(self):
        scenarios = [
            make_scenario("aaa00001", "Кот в одиночестве"),
            make_scenario("bbb00002", "Про Сашу"),
        ]
        result = resolver.resolve_scenario("Сашу", scenarios=scenarios)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["id"], "bbb00002")


if __name__ == "__main__":
    unittest.main()
