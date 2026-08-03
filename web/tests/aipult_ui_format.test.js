import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCard,
  formatCandidate,
  formatStatus,
  formatIntent,
  formatTimestamp,
  formatDuration,
  formatBytes,
  escapeHtml,
  truncate,
  INTENT_LABELS,
  STATUS_LABELS,
} from '../lib/aipult/ui_format.js';

test('aipult-ui: formatCard includes title and id+status line', () => {
  const card = {
    card_id: 'abc',
    intent: 'restyle',
    command: 'python3 scripts/restyle.py --scenario-id 8eaa57cc --style gothic',
    estimated_time: '2-5 сек',
    estimated_cost: '$0',
    reversible: true,
    resolved_scenario: { id: '8eaa57cc', title: 'Кот в одиночестве', status: 'rendered' },
  };
  const f = formatCard(card);
  assert.equal(f.title, 'Кот в одиночестве');
  assert.equal(f.intentLabel, 'Restyle');
  assert.match(f.subtitle, /Restyle/);
  assert.match(f.scenarioLine, /8eaa57cc/);
  assert.match(f.scenarioLine, /rendered/i);
  assert.equal(f.command, card.command);
  assert.equal(f.reversible, true);
});

test('aipult-ui: formatCandidate produces idLine+status+confidence', () => {
  const c = formatCandidate({ id: 'aaa12345', title: 'Кот', status: 'rendered', confidence: 0.85 });
  assert.equal(c.idLine, 'ID: aaa12345');
  assert.equal(c.title, 'Кот');
  assert.match(c.status, /rendered/i);
  assert.equal(c.confidencePct, 85);
});

test('aipult-ui: formatStatus returns icon+label+color for all 5 states', () => {
  for (const state of ['draft', 'approved', 'rejected', 'rendered', 'published']) {
    const s = formatStatus(state);
    assert.ok(s.icon, `missing icon for ${state}`);
    assert.ok(s.label, `missing label for ${state}`);
    assert.match(s.color, /^#[0-9a-f]{6}$/i, `bad color for ${state}: ${s.color}`);
  }
  // Unknown status → fallback
  const unk = formatStatus('mystery');
  assert.equal(unk.label, 'mystery');
  assert.match(unk.color, /^#[0-9a-f]{6}$/i);
});

test('aipult-ui: formatIntent maps all 9 intents', () => {
  assert.equal(Object.keys(INTENT_LABELS).length, 9);
  for (const intent of Object.keys(INTENT_LABELS)) {
    const f = formatIntent(intent);
    assert.ok(f.icon, `missing icon for ${intent}`);
    assert.ok(f.label, `missing label for ${intent}`);
    assert.ok(f.verb, `missing verb for ${intent}`);
  }
  // Unknown intent → fallback
  const unk = formatIntent('hack');
  assert.equal(unk.label, 'hack');
});

test('aipult-ui: formatTimestamp produces relative labels', () => {
  const now = Date.parse('2026-08-03T12:00:00Z');
  // <60s → 'только что'
  assert.equal(formatTimestamp('2026-08-03T11:59:30Z', now), 'только что');
  // 5 min ago
  assert.equal(formatTimestamp('2026-08-03T11:55:00Z', now), '5 мин назад');
  // 3 hours ago
  assert.equal(formatTimestamp('2026-08-03T09:00:00Z', now), '3 ч назад');
  // 2 days ago
  assert.equal(formatTimestamp('2026-08-01T12:00:00Z', now), '2 дн назад');
  // 60 days ago → date format
  const old = formatTimestamp('2026-06-01T12:00:00Z', now);
  assert.match(old, /^\d+ [а-яА-ЯёЁa-zA-Z]+, \d{2}:\d{2}$/u);
  // Empty/invalid → empty
  assert.equal(formatTimestamp(''), '');
  assert.equal(formatTimestamp('not-a-date'), '');
});

test('aipult-ui: formatDuration converts ms to human', () => {
  assert.equal(formatDuration(500), '500 мс');
  assert.equal(formatDuration(1000), '1.0 сек');
  assert.equal(formatDuration(2500), '2.5 сек');
  assert.equal(formatDuration(60_000), '1.0 мин');
  assert.equal(formatDuration(180_000), '3.0 мин');
  assert.equal(formatDuration(3_600_000), '1.0 ч');
  assert.equal(formatDuration(-1), '');
  assert.equal(formatDuration(NaN), '');
});

test('aipult-ui: formatBytes scales units', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(500), '500 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
  assert.equal(formatBytes(2 * 1024 * 1024 * 1024), '2.00 GB');
  assert.equal(formatBytes(-1), '0 B');
});

test('aipult-ui: escapeHtml escapes all 5 special chars', () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'),
    '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml('Tom & Jerry'), 'Tom &amp; Jerry');
  assert.equal(escapeHtml('"hello"'), '&quot;hello&quot;');
  assert.equal(escapeHtml("it's"), 'it&#39;s');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(42), '42');
});

test('aipult-ui: truncate cuts at max with ellipsis', () => {
  assert.equal(truncate('hello', 10), 'hello');
  assert.equal(truncate('hello world', 5), 'hell…');
  assert.equal(truncate('hi', 5), 'hi');
  assert.equal(truncate('hello', 0), '');
  assert.equal(truncate('hello', -1), 'hello');
  assert.equal(truncate(null, 5), '');
});

test('aipult-ui: card with null resolved_scenario does not throw', () => {
  const card = {
    card_id: 'x',
    intent: 'stats',
    command: 'GET /api/stats',
    estimated_time: '<1 сек',
    estimated_cost: '$0',
    reversible: true,
    resolved_scenario: null,
  };
  const f = formatCard(card);
  assert.equal(f.title, 'Stats');  // falls back to intent label
  assert.equal(f.scenarioLine, '');
  assert.equal(f.command, 'GET /api/stats');
});

test('aipult-ui: formatCandidate with missing fields returns safe defaults', () => {
  const c = formatCandidate({ id: 'aaa11111' });
  assert.equal(c.title, '');
  assert.equal(c.confidencePct, 0);
  assert.equal(c.ambiguity, false);
  const empty = formatCandidate(null);
  assert.equal(empty.idLine, '');
});
