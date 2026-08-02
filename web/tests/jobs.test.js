import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../lib/errors.js';
import { FakeRunner, makeTestRuntime, writeScenario, listen, jsonFetch } from './helpers.js';
import fs from 'fs';
import path from 'path';

class DeferredRunner extends FakeRunner {
  constructor() {
    super();
    this.pending = [];
  }
  run(executable, args, options) {
    this.calls.push({ executable, args: [...args], options: { ...options } });
    return new Promise((resolve, reject) => this.pending.push({ resolve, reject }));
  }
}

async function pollJob(baseUrl, id, expected = 'succeeded') {
  for (let i = 0; i < 50; i += 1) {
    const result = await jsonFetch(`${baseUrl}/api/jobs/${id}`);
    const job = result.body.job;
    if (job.status === expected) return job;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error(`Job ${id} did not reach ${expected}`);
}

test('render policy rejects draft, rejected and published before runner call', async () => {
  const runner = new FakeRunner();
  const ctx = makeTestRuntime({ runner });
  writeScenario(ctx.runtime.config.dataRoot, 'draft', { id: 'job-draft' });
  writeScenario(ctx.runtime.config.dataRoot, 'rejected', { id: 'job-reject' });
  writeScenario(ctx.runtime.config.dataRoot, 'published', { id: 'job-published' });
  const server = await listen(ctx.app);
  try {
    for (const [id, code] of [['job-draft', 'APPROVAL_REQUIRED'], ['job-reject', 'APPROVAL_REQUIRED'], ['job-published', 'PUBLISHED_IMMUTABLE']]) {
      const result = await jsonFetch(`${server.baseUrl}/api/scenarios/${id}/render`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'initial' }),
      });
      assert.equal(result.response.status, 409);
      assert.equal(result.body.error.code, code);
    }
    assert.equal(runner.calls.length, 0);
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('approved render creates observable job and deduplicates active requests', async () => {
  const runner = new DeferredRunner();
  const ctx = makeTestRuntime({ runner });
  writeScenario(ctx.runtime.config.dataRoot, 'approved', { id: 'job-0001', seed: 9 });
  const server = await listen(ctx.app);
  try {
    const first = await jsonFetch(`${server.baseUrl}/api/scenarios/job-0001/render`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'initial' }),
    });
    assert.equal(first.response.status, 202);
    assert.equal(first.body.job.status, 'queued');
    const second = await jsonFetch(`${server.baseUrl}/api/scenarios/job-0001/render`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'initial' }),
    });
    assert.equal(second.response.status, 409);
    assert.equal(second.body.error.code, 'BUSY');
    assert.equal(second.body.error.details.job_id, first.body.job.id);

    runner.pending[0].resolve({ code: 0, stdout: JSON.stringify({ ok: true, comic_path: '/safe/comic.png', render_revision: 1 }), stderr: '' });
    const completed = await pollJob(server.baseUrl, first.body.job.id);
    assert.equal(completed.status, 'succeeded');
    assert.equal(completed.request_id, first.body.request_id);
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('rendered scenario requires explicit rerender and passes staging arguments', async () => {
  const runner = new FakeRunner({ result: { code: 0, stdout: JSON.stringify({ ok: true, comic_path: '/safe/current.png', render_revision: 2 }), stderr: '' } });
  const ctx = makeTestRuntime({ runner });
  writeScenario(ctx.runtime.config.dataRoot, 'rendered', { id: 'job-0002', seed: 10, render_revision: 1 });
  const server = await listen(ctx.app);
  try {
    const implicit = await jsonFetch(`${server.baseUrl}/api/scenarios/job-0002/render`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'initial' }),
    });
    assert.equal(implicit.response.status, 409);
    assert.equal(implicit.body.error.code, 'RERENDER_CONFIRMATION_REQUIRED');
    const explicit = await jsonFetch(`${server.baseUrl}/api/scenarios/job-0002/render`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'rerender', seed: 99 }),
    });
    assert.equal(explicit.response.status, 202);
    const job = await pollJob(server.baseUrl, explicit.body.job.id);
    assert.equal(job.status, 'succeeded');
    assert.equal(runner.calls[0].args.includes('--rerender'), true);
    assert.equal(runner.calls[0].args.includes('--staging-dir'), true);
    assert.equal(runner.calls[0].args.includes('99'), true);
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('failed process produces failed job and restart marks active jobs interrupted', async () => {
  const runner = new FakeRunner({ error: new AppError(502, 'PROCESS_FAILED', 'failed') });
  const ctx = makeTestRuntime({ runner });
  writeScenario(ctx.runtime.config.dataRoot, 'approved', { id: 'job-0003' });
  const server = await listen(ctx.app);
  try {
    const accepted = await jsonFetch(`${server.baseUrl}/api/scenarios/job-0003/render`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'initial' }),
    });
    const failed = await pollJob(server.baseUrl, accepted.body.job.id, 'failed');
    assert.equal(failed.error.code, 'PROCESS_FAILED');

    const stale = ctx.runtime.jobStore.create({ type: 'render', scenarioId: 'job-other', mode: 'initial', requestId: 'req-stale' });
    ctx.runtime.jobStore.update(stale.id, { status: 'running' });
    assert.equal(ctx.runtime.jobStore.markInterrupted(), 1);
    assert.equal(ctx.runtime.jobStore.get(stale.id).status, 'interrupted');
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('remix endpoint creates new draft from published scenario', async () => {
  const ctx = makeTestRuntime();
  writeScenario(ctx.runtime.config.dataRoot, 'published', { id: 'remix-0001' });
  const server = await listen(ctx.app);
  try {
    const result = await jsonFetch(`${server.baseUrl}/api/scenarios/remix-0001/remix`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    assert.equal(result.response.status, 201);
    assert.match(result.body.id, /^[a-zA-Z0-9_-]{4,64}$/);
    assert.equal(result.body.status, 'draft');
    assert.equal(result.body.remix_of, 'remix-0001');
    assert.equal(ctx.runtime.store.find(result.body.id).state, 'draft');
    assert.equal(ctx.runtime.store.find('remix-0001').state, 'published');
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('remix endpoint rejects non-published scenarios with REMIX_REQUIRES_PUBLISHED', async () => {
  const ctx = makeTestRuntime();
  writeScenario(ctx.runtime.config.dataRoot, 'approved', { id: 'remix-0002' });
  const server = await listen(ctx.app);
  try {
    const result = await jsonFetch(`${server.baseUrl}/api/scenarios/remix-0002/remix`, { method: 'POST' });
    assert.equal(result.response.status, 409);
    assert.equal(result.body.error.code, 'REMIX_REQUIRES_PUBLISHED');
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('revise endpoint accepts approved scenario and returns queued job with revoke', async () => {
  const runner = new DeferredRunner();
  const ctx = makeTestRuntime({ runner });
  fs.writeFileSync(path.join(ctx.project.dataRoot, 'scenarios', 'approved', 'rev-0001.json'), JSON.stringify({ id: 'rev-0001', status: 'approved', title: 'r', tone: 'epic', style: 'star', image_style: 'comic', layout: 'comic', aspect_ratio: '16:9', panels: [{ n: 1, prompt: 'p', caption: 'c' }] }));
  const server = await listen(ctx.app);
  try {
    const result = await jsonFetch(`${server.baseUrl}/api/scenarios/rev-0001/revise`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: [{ text: 'Сделать мягче' }] }),
    });
    assert.equal(result.response.status, 202);
    assert.equal(result.body.status, 'draft');
    assert.equal(result.body.job.type, 'revision');
    assert.equal(result.body.job.status, 'queued');
    const revoked = ctx.runtime.store.find('rev-0001');
    assert.equal(revoked.state, 'draft');
    assert.equal(revoked.record.revision_status, 'revision_queued');
    runner.pending[0].resolve({ code: 0, stdout: JSON.stringify({ ok: true, id: 'rev-0001', revision_at: '2026-08-02T00:00:00Z', feedback_count: 1 }), stderr: '' });
    const job = await pollJob(server.baseUrl, result.body.job.id);
    assert.equal(job.status, 'succeeded');
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('revise endpoint rejects draft and published with structured errors', async () => {
  const ctx = makeTestRuntime();
  fs.writeFileSync(path.join(ctx.project.dataRoot, 'scenarios', 'draft', 'rev-0002.json'), JSON.stringify({ id: 'rev-0002', status: 'draft', title: 'r', tone: 'epic', style: 'star', image_style: 'comic', layout: 'comic', aspect_ratio: '16:9', panels: [{ n: 1, prompt: 'p', caption: 'c' }] }));
  fs.writeFileSync(path.join(ctx.project.dataRoot, 'scenarios', 'published', 'rev-0003.json'), JSON.stringify({ id: 'rev-0003', status: 'published', title: 'r', tone: 'epic', style: 'star', image_style: 'comic', layout: 'comic', aspect_ratio: '16:9', panels: [{ n: 1, prompt: 'p', caption: 'c' }] }));
  const server = await listen(ctx.app);
  try {
    const draft = await jsonFetch(`${server.baseUrl}/api/scenarios/rev-0002/revise`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feedback: [{ text: 'note' }] }) });
    assert.equal(draft.response.status, 409);
    assert.equal(draft.body.error.code, 'APPROVAL_REQUIRED');
    const published = await jsonFetch(`${server.baseUrl}/api/scenarios/rev-0003/revise`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feedback: [{ text: 'note' }] }) });
    assert.equal(published.response.status, 409);
    assert.equal(published.body.error.code, 'PUBLISHED_IMMUTABLE');
  } finally { await server.close(); ctx.project.cleanup(); }
});