import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../lib/errors.js';
import { FakeRunner, makeTestRuntime, writeScenario, listen, jsonFetch } from './helpers.js';

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
    assert.equal(second.body.error.code, 'RENDER_ALREADY_RUNNING');
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
