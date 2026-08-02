"""Tests for `py.lib.lifecycle.revoke_approval` and `create_remix`."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from py.lib import lifecycle


def _build_scenario(state: str) -> dict:
    return {
        'id': f'life-{state}',
        'status': state,
        'title': f'Title {state}',
        'tone': 'epic',
        'style': 'star',
        'image_style': 'comic',
        'layout': 'comic',
        'aspect_ratio': '16:9',
        'panels': [{'n': 1, 'prompt': 'p', 'caption': 'c'}],
        'feedback': [],
    }


class LifecycleRevisionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.tmp_path = Path(self.tmp.name)
        for state in ('draft', 'approved', 'rendered', 'published', 'rejected'):
            (self.tmp_path / 'scenarios' / state).mkdir(parents=True, exist_ok=True)
        self.globals = lifecycle.revoke_approval.__globals__
        self.original_scenarios_dir = self.globals['scenarios_dir']
        self.original_load_scenario = self.globals['load_scenario']
        self.globals['scenarios_dir'] = lambda status='draft': self.tmp_path / 'scenarios' / status
        self.globals['load_scenario'] = self._patched_load

    def tearDown(self):
        self.globals['scenarios_dir'] = self.original_scenarios_dir
        self.globals['load_scenario'] = self.original_load_scenario

    def _patched_load(self, scenario_id):
        for state in lifecycle.STATES:
            file_path = self.tmp_path / 'scenarios' / state / f'{scenario_id}.json'
            if file_path.exists():
                return json.loads(file_path.read_text(encoding='utf-8'))
        return None

    def _write(self, state: str, scenario: dict):
        target = self.tmp_path / 'scenarios' / state / f"{scenario['id']}.json"
        target.write_text(json.dumps(scenario, ensure_ascii=False, indent=2), encoding='utf-8')

    def _build_scenario_data(self, state: str) -> dict:
        base = _build_scenario(state)
        if state == 'rendered':
            base.update({
                'approved_at': '2026-08-01T00:00:00Z',
                'rendered_at': '2026-08-01T00:00:00Z',
                'render_revision': 1,
                'comic_path': '/tmp/comic.png',
                'panel_paths': ['/tmp/p1.png'],
            })
        return base

    def test_revoke_approval_moves_approved_to_draft(self):
        self._write('approved', self._build_scenario_data('approved'))
        result = lifecycle.revoke_approval('life-approved', request_id='req-1')
        self.assertIsNotNone(result)
        self.assertEqual(result['status'], 'draft')
        self.assertEqual(result['revision_status'], 'revision_queued')
        self.assertEqual(result['revision_request_id'], 'req-1')
        self.assertEqual(result['revision_source'], 'approved')
        self.assertNotIn('approved_at', result)
        self.assertNotIn('rendered_at', result)
        on_disk = json.loads((self.tmp_path / 'scenarios' / 'draft' / 'life-approved.json').read_text('utf-8'))
        self.assertEqual(on_disk['status'], 'draft')

    def test_revoke_approval_moves_rendered_to_draft(self):
        self._write('rendered', self._build_scenario_data('rendered'))
        result = lifecycle.revoke_approval('life-rendered', request_id='req-2')
        self.assertEqual(result['status'], 'draft')
        self.assertEqual(result['revision_source'], 'rendered')
        self.assertNotIn('rendered_at', result)
        self.assertNotIn('comic_path', result)
        self.assertNotIn('panel_paths', result)
        self.assertNotIn('render_revision', result)

    def test_revoke_approval_rejects_published(self):
        self._write('published', self._build_scenario_data('published'))
        self.assertIsNone(lifecycle.revoke_approval('life-published'))

    def test_revoke_approval_rejects_missing_scenario(self):
        self.assertIsNone(lifecycle.revoke_approval('life-missing'))

    def test_create_remix_only_from_published(self):
        self._write('approved', self._build_scenario_data('approved'))
        self.assertIsNone(lifecycle.create_remix('life-approved'))
        self._write('published', self._build_scenario_data('published'))
        draft = lifecycle.create_remix('life-published', id_factory=lambda: 'remix01')
        self.assertIsNotNone(draft)
        self.assertEqual(draft['id'], 'remix01')
        self.assertEqual(draft['status'], 'draft')
        self.assertEqual(draft['remix_of'], 'life-published')
        self.assertEqual(draft['revision_of'], 'life-published')
        self.assertEqual(draft['title'], 'Title published')
        self.assertEqual(draft['feedback'], [])
        on_disk = json.loads((self.tmp_path / 'scenarios' / 'draft' / 'remix01.json').read_text('utf-8'))
        self.assertEqual(on_disk['remix_of'], 'life-published')
        # original record untouched
        original = json.loads((self.tmp_path / 'scenarios' / 'published' / 'life-published.json').read_text('utf-8'))
        self.assertEqual(original['status'], 'published')
        self.assertNotIn('remix_of', original)

    def test_revoke_approval_leaves_no_duplicate_active_record(self):
        self._write('approved', self._build_scenario_data('approved'))
        result = lifecycle.revoke_approval('life-approved', request_id='req-x')
        self.assertEqual(result['status'], 'draft')
        states_with_record = []
        for state in lifecycle.STATES:
            p = self.tmp_path / 'scenarios' / state / 'life-approved.json'
            if p.exists():
                states_with_record.append(state)
        self.assertEqual(states_with_record, ['draft'], 'revoke_approval must move the only canonical record to draft, no duplicates')

    def test_create_remix_leaves_no_duplicate_active_record(self):
        self._write('published', self._build_scenario_data('published'))
        draft = lifecycle.create_remix('life-published', id_factory=lambda: 'remix02')
        states_with_record = []
        for state in lifecycle.STATES:
            p = self.tmp_path / 'scenarios' / state / 'remix02.json'
            if p.exists():
                states_with_record.append(state)
        self.assertEqual(states_with_record, ['draft'], 'remix must only create one canonical record in draft')
        # original record still in published
        self.assertTrue((self.tmp_path / 'scenarios' / 'published' / 'life-published.json').exists())

    def test_revise_does_not_replay_paid_work_for_published(self):
        # published records must use remix path, not revoke; ensure revoke refuses.
        self._write('published', self._build_scenario_data('published'))
        self.assertIsNone(lifecycle.revoke_approval('life-published'))


if __name__ == '__main__':
    unittest.main()
