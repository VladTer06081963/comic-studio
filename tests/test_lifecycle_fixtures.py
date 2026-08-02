"""Cross-runtime parity test: Node `web/tests/fixtures/lifecycle.js` and
`tests/lifecycle_fixtures.py` MUST expose the same matrix.
"""
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
NODE_FIXTURE = REPO_ROOT / 'web' / 'tests' / 'fixtures' / 'lifecycle.js'
PY_FIXTURE = REPO_ROOT / 'tests' / 'lifecycle_fixtures.py'


def parse_node_cases():
    source = NODE_FIXTURE.read_text(encoding='utf-8')
    match = re.search(r'LIFECYCLE_CASES\s*=\s*Object\.freeze\(\[(.*)\]\)', source, re.S)
    assert match, 'LIFECYCLE_CASES not found in node fixture'
    block = match.group(1)
    entries = []
    depth = 0
    start = None
    for index, char in enumerate(block):
        if char == '{':
            if depth == 0:
                start = index
            depth += 1
        elif char == '}':
            depth -= 1
            if depth == 0 and start is not None:
                entries.append(block[start:index + 1])
                start = None
    cases = []
    for entry in entries:
        item = {}
        for key in ('from', 'operation', 'to', 'mode', 'code', 'creates', 'revoke_approval', 'legacy_staging', 'idempotent'):
            m = re.search(rf"{key}:\s*'([^']*)'", entry)
            if m:
                item[key] = m.group(1)
        cases.append(item)
    return cases


class LifecycleFixtureParity(unittest.TestCase):
    def test_python_fixture_loads(self):
        from tests import lifecycle_fixtures
        self.assertGreater(len(lifecycle_fixtures.LIFECYCLE_CASES), 0)
        self.assertEqual(lifecycle_fixtures.operations_by_state().keys() & {'draft', 'approved', 'rendered', 'published', 'rejected'}, {'draft', 'approved', 'rendered', 'published', 'rejected'})

    def test_node_fixture_present(self):
        self.assertTrue(NODE_FIXTURE.exists(), f'Missing Node fixture: {NODE_FIXTURE}')

    def test_matrices_have_same_operations(self):
        from tests import lifecycle_fixtures
        node_ops = {(c.get('from'), c.get('operation')) for c in parse_node_cases()}
        py_ops = {(c.get('from'), c.get('operation')) for c in lifecycle_fixtures.LIFECYCLE_CASES}
        self.assertEqual(node_ops, py_ops, f'Mismatched operations: only node={node_ops - py_ops}, only python={py_ops - node_ops}')

    def test_published_remix_and_revision_codes(self):
        from tests import lifecycle_fixtures
        py = lifecycle_fixtures.LIFECYCLE_CASES
        published = [c for c in py if c.get('from') == 'published']
        remix_codes = {c.get('code') for c in published if c.get('operation') == 'render'}
        self.assertEqual(remix_codes, {'PUBLISHED_IMMUTABLE'})
        self.assertTrue(any(c.get('operation') == 'remix' and c.get('allowed') for c in published))
        approved = [c for c in py if c.get('from') == 'approved']
        self.assertTrue(any(c.get('operation') == 'revise' and c.get('allowed') for c in approved))


if __name__ == '__main__':
    unittest.main()
