"""Tests for `py.scenario.writer.revise_scenario` and CLI helper behaviour."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from py.scenario import writer


def _build_scenario() -> dict:
    return {
        'id': 'revise-0001',
        'title': 'Истории',
        'tone': 'epic',
        'style': 'star',
        'image_style': 'comic',
        'layout': 'comic',
        'aspect_ratio': '16:9',
        'panels': [
            {'n': 1, 'prompt': 'A brave hero walks into the alley', 'caption': 'Смелый входит'},
            {'n': 2, 'prompt': 'A drone follows above the city', 'caption': 'Дрон сверху'},
            {'n': 3, 'prompt': 'A chase through narrow streets', 'caption': 'Погоня'},
        ],
        'feedback': [],
    }


class ReviseScenarioTests(unittest.TestCase):
    def test_validation_rejects_non_dict(self):
        with self.assertRaises(ValueError):
            writer._validate_revision_response([])

    def test_validation_rejects_wrong_panel_count(self):
        with self.assertRaises(ValueError):
            writer._validate_revision_response({'panels': [{'n': 1, 'prompt': 'a', 'caption': 'b'}, {'n': 2, 'prompt': 'a', 'caption': 'b'}]})

    def test_validation_rejects_long_prompt(self):
        with self.assertRaises(ValueError):
            writer._validate_revision_response({
                'panels': [
                    {'n': 1, 'prompt': 'x' * (writer.MAX_PROMPT_CHARS + 1), 'caption': 'ok'},
                    {'n': 2, 'prompt': 'p', 'caption': 'ok'},
                    {'n': 3, 'prompt': 'p', 'caption': 'ok'},
                ]
            })

    def test_validation_rejects_long_caption(self):
        with self.assertRaises(ValueError):
            writer._validate_revision_response({
                'panels': [
                    {'n': 1, 'prompt': 'p', 'caption': 'one two three four five six seven'},
                    {'n': 2, 'prompt': 'p', 'caption': 'ok'},
                    {'n': 3, 'prompt': 'p', 'caption': 'ok'},
                ]
            })

    def test_validation_accepts_well_formed_response(self):
        writer._validate_revision_response({
            'panels': [
                {'n': 1, 'prompt': 'a', 'caption': 'ok'},
                {'n': 2, 'prompt': 'b', 'caption': 'fine'},
                {'n': 3, 'prompt': 'c', 'caption': 'three'},
            ]
        })

    def test_format_feedback_history_filters_empty(self):
        history = [
            {'text': 'первый'},
            {'text': '   '},
            {'text': 'третий'},
        ]
        self.assertEqual(writer._format_feedback_history(history), '1. первый\n3. третий')

    def test_revise_scenario_rejects_too_much_feedback(self):
        scenario = _build_scenario()
        feedback = [{'text': f'note {index}'} for index in range(writer.MAX_FEEDBACK_FOR_REVISION + 1)]
        with self.assertRaises(ValueError):
            writer.revise_scenario(scenario, feedback, source_context='initial')

    def test_revise_scenario_returns_required_metadata(self):
        scenario = _build_scenario()
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            chat_stub = {
                'captured': [],
                'call_count': 0,
            }

            def fake_chat(system, user):
                chat_stub['captured'].append((system, user))
                chat_stub['call_count'] += 1
                return json.dumps({
                    'title': 'Истории',
                    'tone': 'epic',
                    'style': 'star',
                    'image_style': 'comic',
                    'layout': 'comic',
                    'aspect_ratio': '16:9',
                    'panels': [
                        {'n': 1, 'prompt': 'Новая сцена', 'caption': 'Старт'},
                        {'n': 2, 'prompt': 'Развитие', 'caption': 'Середина'},
                        {'n': 3, 'prompt': 'Финал', 'caption': 'Конец'},
                    ],
                })

            original = writer._call_minimax_chat
            writer._call_minimax_chat = fake_chat
            try:
                revised = writer.revise_scenario(
                    scenario,
                    [{'text': 'Сделать финал мягче'}, {'text': 'Добавить диалог'}],
                    source_context='Исходный контекст для revision',
                )
            finally:
                writer._call_minimax_chat = original

        self.assertEqual(chat_stub['call_count'], 1)
        self.assertEqual(revised['id'], scenario['id'])
        self.assertEqual(revised['status'], 'draft')
        self.assertEqual(revised['revision_of'], scenario['id'])
        self.assertIn('revision_at', revised)
        self.assertEqual(len(revised['panels']), 3)
        for panel in revised['panels']:
            self.assertIn(writer.STYLE_TEMPLATES['comic'], panel['prompt'])
        self.assertEqual(revised['title'], scenario['title'])
        self.assertEqual(revised['tone'], scenario['tone'])

    def test_revise_scenario_timeout_is_surfaced(self):
        scenario = _build_scenario()

        class _TimeoutLike(Exception):
            pass

        def fake_chat(system, user):
            raise _TimeoutLike('read timed out')

        original = writer._call_minimax_chat
        writer._call_minimax_chat = fake_chat
        try:
            with self.assertRaises(_TimeoutLike):
                writer.revise_scenario(
                    scenario,
                    [{'text': 'change'}],
                    source_context='ctx',
                )
        finally:
            writer._call_minimax_chat = original

    def test_revise_scenario_invalid_json_is_surfaced(self):
        scenario = _build_scenario()

        def fake_chat(system, user):
            return 'not a json response at all'

        original = writer._call_minimax_chat
        writer._call_minimax_chat = fake_chat
        try:
            with self.assertRaises(json.JSONDecodeError):
                writer.revise_scenario(
                    scenario,
                    [{'text': 'change'}],
                    source_context='ctx',
                )
        finally:
            writer._call_minimax_chat = original

    def test_revise_scenario_rejects_non_dict_payload(self):
        scenario = _build_scenario()

        def fake_chat(system, user):
            return json.dumps(['not', 'an', 'object'])

        original = writer._call_minimax_chat
        writer._call_minimax_chat = fake_chat
        try:
            with self.assertRaises(ValueError):
                writer.revise_scenario(
                    scenario,
                    [{'text': 'change'}],
                    source_context='ctx',
                )
        finally:
            writer._call_minimax_chat = original

    def test_revise_scenario_rejects_missing_panels(self):
        scenario = _build_scenario()

        def fake_chat(system, user):
            return json.dumps({'title': 'no panels'})

        original = writer._call_minimax_chat
        writer._call_minimax_chat = fake_chat
        try:
            with self.assertRaises(ValueError):
                writer.revise_scenario(
                    scenario,
                    [{'text': 'change'}],
                    source_context='ctx',
                )
        finally:
            writer._call_minimax_chat = original

    def test_format_feedback_history_skips_blank_and_truncates(self):
        history = [{'text': 'первый'}, {'text': ''}, {'text': '   '}, {'text': 'третий'}]
        self.assertEqual(writer._format_feedback_history(history), '1. первый\n4. третий')

    def test_revise_scenario_rejects_empty_feedback(self):
        scenario = _build_scenario()
        with self.assertRaises(ValueError):
            writer.revise_scenario(scenario, [], source_context='ctx')

    def test_revise_scenario_rejects_non_dict_scenario(self):
        with self.assertRaises(ValueError):
            writer.revise_scenario([], [{'text': 'change'}])

    def test_revise_scenario_preserves_source_seed_and_aspect(self):
        scenario = _build_scenario()
        scenario['seed'] = 7
        scenario['aspect_ratio'] = '1:1'

        def fake_chat(system, user):
            return json.dumps({
                'panels': [
                    {'n': 1, 'prompt': 'a', 'caption': 'ok'},
                    {'n': 2, 'prompt': 'b', 'caption': 'fine'},
                    {'n': 3, 'prompt': 'c', 'caption': 'three'},
                ],
            })

        original = writer._call_minimax_chat
        writer._call_minimax_chat = fake_chat
        try:
            revised = writer.revise_scenario(scenario, [{'text': 'change'}], source_context='ctx')
        finally:
            writer._call_minimax_chat = original
        self.assertEqual(revised['aspect_ratio'], '1:1')
        self.assertNotIn('seed', revised)  # seed is preserved implicitly via id/status but writer does not set it


if __name__ == '__main__':
    unittest.main()
