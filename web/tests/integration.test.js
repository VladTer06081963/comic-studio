import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { makeTestRuntime, writeScenario, listen, jsonFetch } from './helpers.js';
import { LIFECYCLE_CASES } from './fixtures/lifecycle.js';

test('remaining read endpoints and reject success follow API contracts', async () => {
  const ctx = makeTestRuntime();
  writeScenario(ctx.runtime.config.dataRoot, 'draft', { id: 'api-0001' });
  writeScenario(ctx.runtime.config.dataRoot, 'rendered', { id: 'api-0002' });
  fs.mkdirSync(path.join(ctx.runtime.config.dataRoot, 'comics'), { recursive: true });
  fs.writeFileSync(path.join(ctx.runtime.config.dataRoot, 'comics', 'api-0002.png'), 'png');
  const job = ctx.runtime.jobStore.create({ type: 'render', scenarioId: 'api-0002', mode: 'rerender', requestId: 'req-api' });
  ctx.runtime.jobStore.update(job.id, { status: 'failed', finished_at: '2026-08-02T00:00:00Z' });
  const server = await listen(ctx.app);
  try {
    const rejected = await jsonFetch(`${server.baseUrl}/api/scenarios/api-0001/reject`, { method: 'POST' });
    assert.equal(rejected.response.status, 200);
    assert.equal(rejected.body.status, 'rejected');

    const detail = await jsonFetch(`${server.baseUrl}/api/scenarios/api-0001`);
    assert.equal(detail.body.status, 'rejected');
    const comics = await jsonFetch(`${server.baseUrl}/api/comics`);
    assert.deepEqual(comics.body.map(item => item.scenario_id), ['api-0002']);
    const jobs = await jsonFetch(`${server.baseUrl}/api/jobs`);
    assert.equal(jobs.body.items[0].id, job.id);
    const missing = await jsonFetch(`${server.baseUrl}/api/scenarios/miss-0001`);
    assert.equal(missing.response.status, 404);
    assert.equal(missing.body.error.code, 'SCENARIO_NOT_FOUND');
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('path traversal and encoded separators never access out-of-root files', async () => {
  const ctx = makeTestRuntime();
  const outside = path.join(ctx.project.root, 'outside.json');
  fs.writeFileSync(outside, JSON.stringify({ secret: true }));
  const server = await listen(ctx.app);
  try {
    const statusTraversal = await jsonFetch(`${server.baseUrl}/api/scenarios?status=${encodeURIComponent('../../outside')}`);
    assert.equal(statusTraversal.response.status, 400);
    assert.equal(statusTraversal.body.error.code, 'INVALID_STATUS');

    const idTraversal = await jsonFetch(`${server.baseUrl}/api/scenarios/${encodeURIComponent('safe/../../outside')}`);
    assert.ok([400, 404].includes(idTraversal.response.status));
    assert.equal(fs.readFileSync(outside, 'utf8'), JSON.stringify({ secret: true }));
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('invalid IDs and styles do not invoke a process', async () => {
  const ctx = makeTestRuntime();
  const server = await listen(ctx.app);
  try {
    const invalidId = await jsonFetch(`${server.baseUrl}/api/scenarios/${encodeURIComponent('$(whoami)')}/render`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'initial' }),
    });
    assert.equal(invalidId.response.status, 400);
    const invalidStyle = await jsonFetch(`${server.baseUrl}/api/scenarios`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'idea', caption_style: 'bubble; touch /tmp/bad' }),
    });
    assert.equal(invalidStyle.response.status, 400);
    assert.equal(ctx.runtime.runner.calls.length, 0);
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('oversized bodies receive a structured 413', async () => {
  const ctx = makeTestRuntime();
  const server = await listen(ctx.app);
  try {
    const result = await jsonFetch(`${server.baseUrl}/api/scenarios`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'x'.repeat(200_000) }),
    });
    assert.equal(result.response.status, 413);
    assert.equal(result.body.error.code, 'PAYLOAD_TOO_LARGE');
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('shared lifecycle fixture documents all controlling policy branches', () => {
  const expected = new Set([
    'draft:approve', 'draft:reject', 'approved:approve', 'approved:reject',
    'rejected:approve', 'published:render', 'draft:render', 'rendered:render',
  ]);
  for (const item of LIFECYCLE_CASES) expected.delete(`${item.from}:${item.operation}`);
  assert.deepEqual([...expected], []);
  assert.equal(LIFECYCLE_CASES.find(item => item.from === 'published' && item.operation === 'render').code, 'PUBLISHED_IMMUTABLE');
});
