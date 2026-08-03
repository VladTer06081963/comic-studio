"""Tests for `py/lib/aipult_client.py` — COMMAND_COOKBOOK + CommandCard routing.

All tests use `chat_client` parameter to inject a mock LLM. NO live MiniMax,
NO subprocess, NO Telegram/Notion calls.
"""
from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path

# Ensure repo root is on sys.path
REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from py.lib import aipult_client  # noqa: E402


def make_candidate(scenario_id: str = "8eaa57cc", title: str = "Кот в одиночестве",
                   status: str = "rendered", confidence: float = 0.95) -> dict:
    return {
        "id": scenario_id,
        "title": title,
        "status": status,
        "confidence": confidence,
        "resolution_method": "title_match",
        "created_at": "2026-08-02T22:45:00",
    }


class TestAipultClient(unittest.TestCase):
    def test_route_command_with_mocked_minimax(self):
        # Mock LLM returns a valid restyle command
        def mock_chat(system, user):
            return json.dumps({
                "intent": "restyle",
                "scenario_id": "8eaa57cc",
                "style": "gothic",
                "explanation": "Сменит стиль баблов «Кот в одиночестве»",
                "warnings": [],
            })

        card = aipult_client.route_command(
            "поменяй стиль у кота на gothic",
            [make_candidate()],
            chat_client=mock_chat,
        )
        self.assertEqual(card["intent"], "restyle")
        self.assertEqual(card["command"],
                         "python3 scripts/restyle.py --scenario-id 8eaa57cc --style gothic")
        self.assertEqual(card["resolved_scenario"]["title"], "Кот в одиночестве")
        self.assertEqual(card["resolved_scenario"]["status"], "rendered")
        self.assertEqual(card["estimated_cost"], "$0")
        self.assertTrue(card["reversible"])
        self.assertIn("data/comics/8eaa57cc.png", card["related_artifacts"])
        # card_id is a UUID hex
        self.assertEqual(len(card["card_id"]), 32)

    def test_route_command_rejects_forbidden_intent(self):
        def mock_chat(system, user):
            return json.dumps({
                "intent": "rm",  # NOT in ALLOWED_INTENTS
                "scenario_id": "8eaa57cc",
                "command": "rm -rf /",
                "explanation": "oops",
                "warnings": [],
            })

        with self.assertRaises(aipult_client.AipultForbiddenIntent) as ctx:
            aipult_client.route_command(
                "delete everything",
                [make_candidate()],
                chat_client=mock_chat,
            )
        self.assertEqual(ctx.exception.intent, "rm")

    def test_route_command_rejects_hallucinated_scenario_id(self):
        def mock_chat(system, user):
            return json.dumps({
                "intent": "restyle",
                "scenario_id": "deadbeef",  # NOT in candidates
                "style": "gothic",
                "command": "python3 scripts/restyle.py --scenario-id deadbeef --style gothic",
                "explanation": "x",
                "warnings": [],
            })

        with self.assertRaises(aipult_client.AipultScenarioNotFound) as ctx:
            aipult_client.route_command(
                "поменяй стиль",
                [make_candidate()],  # only 8eaa57cc
                chat_client=mock_chat,
            )
        self.assertEqual(ctx.exception.scenario_id, "deadbeef")

    def test_route_command_handles_invalid_json_response(self):
        def mock_chat(system, user):
            return "not valid json at all"

        with self.assertRaises(aipult_client.AipultInvalidResponse):
            aipult_client.route_command(
                "поменяй стиль",
                [make_candidate()],
                chat_client=mock_chat,
            )

    def test_route_command_enriches_card_with_title(self):
        # Even if LLM doesn't include title, our enricher adds it from candidates
        def mock_chat(system, user):
            return json.dumps({
                "intent": "view",
                "scenario_id": "a52d7e46",
                "command": "GET /api/scenarios/a52d7e46",
                "explanation": "view",
                "warnings": [],
            })

        card = aipult_client.route_command(
            "покажи мне кота-учителя",
            [make_candidate("a52d7e46", "Кот-учитель", "published")],
            chat_client=mock_chat,
        )
        self.assertEqual(card["resolved_scenario"]["title"], "Кот-учитель")
        self.assertEqual(card["resolved_scenario"]["status"], "published")
        self.assertEqual(card["command"], "GET /api/scenarios/a52d7e46")

    def test_command_cookbook_imports_and_contains_9_intents(self):
        cookbook = aipult_client.COMMAND_COOKBOOK
        self.assertIsInstance(cookbook, str)
        self.assertGreater(len(cookbook), 1000)
        for intent in aipult_client.ALLOWED_INTENTS:
            self.assertIn(f"### {intent}", cookbook,
                          f"cookbook missing section for intent: {intent}")

    def test_route_command_llm_unavailable_propagates(self):
        def mock_chat_raises(system, user):
            raise aipult_client.AipultLlmUnavailable("API key missing")

        with self.assertRaises(aipult_client.AipultLlmUnavailable):
            aipult_client.route_command(
                "поменяй стиль",
                [make_candidate()],
                chat_client=mock_chat_raises,
            )


if __name__ == "__main__":
    unittest.main()
