import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { makeTestRuntime, writeScenario, listen, jsonFetch } from './helpers.js';
import { JobManager } from '../lib/job_manager.js';

class DeferredRunner {
  constructor() {
    this.calls = [];
    this.pending = [];
  }
  isExecutable() { return true; }
  async run(executable, args, options) {
    this.calls.push({ executable, args: [...args], options: { ...options } });
    return new Promise((resolve, reject) => this.pending.push({ resolve, reject }));
  }
  shutdown() {}
}

function writeApproved(dataRoot, id) {
  const dir = path.join(dataRoot, 'scenarios', 'approved');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({
    id,
    status: 'approved',
    title: `Title ${id}`,
    tone: 'epic',
    style: 'star',
    image_style: 'comic',
    layout: 'comic',
    aspect_ratio: '16:9',
    panels: [
      { n: 1, prompt: 'A brave hero', caption: 'Герой' },
      { n: 2, prompt: 'A drone above', caption: 'Дрон' },
      { n: 3, prompt: 'A chase through streets', caption: 'Погоня' },
    ],
  }));
}

function writeRendered(dataRoot, id) {
  const dir = path.join(dataRoot, 'scenarios', 'rendered');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({
    id,
    status: 'rendered',
    title: `Title ${id}`,
    tone: 'epic',
    style: 'star',
    image_style: 'comic',
    layout: 'comic',
    aspect_ratio: '16:9',
    panels: [
      { n: 1, prompt: 'A brave hero', caption: 'Герой' },
      { n: 2, prompt: 'A drone above', caption: 'Дрон' },
      { n: 3, prompt: 'A chase through streets', caption: 'Погоня' },
    ],
    approved_at: '2026-08-01T00:00:00Z',
    rendered_at: '2026-08-01T00:01:00Z',
    render_revision: 1,
    comic_path: '/safe/comic.png',
    panel_paths: ['/safe/p1.png'],
  }));
  fs.mkdirSync(path.join(dataRoot, 'comics'), { recursive: true });
  fs.writeFileSync(path.join(dataRoot, 'comics', `${id}.png`), 'final');
  fs.writeFileSync(path.join(dataRoot, 'comics', `${id}.png`), 'final');
  fs.mkdirSync(path.join(dataRoot, 'comics', id), { recursive: true });
  fs.writeFileSync(path.join(dataRoot, 'comics', id, 'panel_1.png'), 'p1');
  fs.mkdirSync(path.join(dataRoot, 'comics', 'raw'), { recursive: true });
  fs.writeFileSync(path.join(dataRoot, 'comics', 'raw', `${id}.png`), 'raw');
}

test('revise on rendered scenario moves artifacts to legacy staging and creates revision job', async () => {
  const runner = new DeferredRunner();
  const ctx = makeTestRuntime({ runner });
  writeRendered(ctx.runtime.config.dataRoot, 'rev-r-0001');
  const server = await listen(ctx.app);
  try {
    const response = await jsonFetch(`${server.baseUrl}/api/scenarios/rev-r-0001/revise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: [{ text: 'сделать мягче' }, { text: 'добавить диалог' }] }),
    });
    assert.equal(response.response.status, 202);
    assert.equal(response.body.job.type, 'revision');
    assert.equal(response.body.job.status, 'queued');
    assert.equal(response.body.job.revision_kind, 'standard');
    assert.equal(response.body.job.feedback_count, 2);
    assert.equal(ctx.runtime.store.find('rev-r-0001').state, 'draft');
    const legacy = fs.readdirSync(path.join(ctx.runtime.config.dataRoot, '.staging', 'legacy'));
    assert.ok(legacy.length > 0, 'legacy staging directory should be populated');
    runner.pending[0].resolve({ code: 0, stdout: JSON.stringify({ ok: true, id: 'rev-r-0001', revision_at: '2026-08-02T00:00:00Z', feedback_count: 2 }), stderr: '' });
    await new Promise(resolve => setTimeout(resolve, 30));
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('revise feedback limit returns 400 with REVISION_FEEDBACK_LIMIT', async () => {
  const ctx = makeTestRuntime();
  writeApproved(ctx.runtime.config.dataRoot, 'rev-fb-0001');
  const server = await listen(ctx.app);
  try {
    const feedback = Array.from({ length: 25 }, (_, i) => ({ text: `note ${i}` }));
    const response = await jsonFetch(`${server.baseUrl}/api/scenarios/rev-fb-0001/revise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback }),
    });
    assert.equal(response.response.status, 400);
    assert.equal(response.body.error.code, 'REVISION_FEEDBACK_LIMIT');
    assert.equal(ctx.runtime.store.find('rev-fb-0001').state, 'approved');
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('empty feedback list returns 400 with REVISION_FEEDBACK_REQUIRED', async () => {
  const ctx = makeTestRuntime();
  writeApproved(ctx.runtime.config.dataRoot, 'rev-empty-0001');
  const server = await listen(ctx.app);
  try {
    const response = await jsonFetch(`${server.baseUrl}/api/scenarios/rev-empty-0001/revise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: [] }),
    });
    assert.equal(response.response.status, 400);
    assert.equal(response.body.error.code, 'REVISION_FEEDBACK_REQUIRED');
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('cross-type job dedup: revision while render is active returns 409 BUSY', async () => {
  const runner = new DeferredRunner();
  const ctx = makeTestRuntime({ runner });
  writeApproved(ctx.runtime.config.dataRoot, 'rev-cross-0001');
  const server = await listen(ctx.app);
  try {
    const renderResponse = await jsonFetch(`${server.baseUrl}/api/scenarios/rev-cross-0001/render`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'initial' }),
    });
    assert.equal(renderResponse.response.status, 202);
    const renderJobId = renderResponse.body.job.id;

    const reviseResponse = await jsonFetch(`${server.baseUrl}/api/scenarios/rev-cross-0001/revise`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: [{ text: 'change' }] }),
    });
    assert.equal(reviseResponse.response.status, 409);
    assert.equal(reviseResponse.body.error.code, 'BUSY');
    assert.equal(reviseResponse.body.error.details.job_id, renderJobId);
    assert.equal(reviseResponse.body.error.details.type, 'render');
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('cross-type job dedup: render while revision is active returns 409 BUSY', async () => {
  const runner = new DeferredRunner();
  const ctx = makeTestRuntime({ runner });
  writeApproved(ctx.runtime.config.dataRoot, 'rev-cross-0002');
  const server = await listen(ctx.app);
  try {
    const reviseResponse = await jsonFetch(`${server.baseUrl}/api/scenarios/rev-cross-0002/revise`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: [{ text: 'change' }] }),
    });
    assert.equal(reviseResponse.response.status, 202);
    const revisionJobId = reviseResponse.body.job.id;

    const renderResponse = await jsonFetch(`${server.baseUrl}/api/scenarios/rev-cross-0002/render`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'initial' }),
    });
    assert.equal(renderResponse.response.status, 409);
    assert.equal(renderResponse.body.error.code, 'BUSY');
    assert.equal(renderResponse.body.error.details.job_id, revisionJobId);
    assert.equal(renderResponse.body.error.details.type, 'revision');
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('revise on scenario with active revision returns REVISION_ALREADY_RUNNING', async () => {
  const runner = new DeferredRunner();
  const ctx = makeTestRuntime({ runner });
  writeApproved(ctx.runtime.config.dataRoot, 'rev-again-0001');
  const server = await listen(ctx.app);
  try {
    const first = await jsonFetch(`${server.baseUrl}/api/scenarios/rev-again-0001/revise`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: [{ text: 'a' }] }),
    });
    assert.equal(first.response.status, 202);
    const second = await jsonFetch(`${server.baseUrl}/api/scenarios/rev-again-0001/revise`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: [{ text: 'b' }] }),
    });
    assert.equal(second.response.status, 409);
    assert.equal(second.body.error.code, 'REVISION_ALREADY_RUNNING');
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('revision job success persists revision_succeeded and bounded revision_history', async () => {
  const runner = new DeferredRunner();
  const ctx = makeTestRuntime({ runner });
  writeApproved(ctx.runtime.config.dataRoot, 'rev-succ-0001');
  const server = await listen(ctx.app);
  try {
    const first = await jsonFetch(`${server.baseUrl}/api/scenarios/rev-succ-0001/revise`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: [{ text: 'первый' }] }),
    });
    runner.pending[0].resolve({
      code: 0,
      stdout: JSON.stringify({ ok: true, id: 'rev-succ-0001', revision_at: '2026-08-02T01:00:00Z', feedback_count: 1 }),
      stderr: '',
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    const after = ctx.runtime.store.get('rev-succ-0001').record;
    assert.equal(after.revision_status, 'revision_succeeded');
    assert.ok(after.revision_at, 'revision_at should be set after a successful apply');
    assert.equal(after.revision_history.length, 1);
    assert.equal(after.revision_history[0].status, 'revision_queued');
    assert.equal(after.revision_history[0].feedback_count, 1);
    assert.equal(after.feedback_count, 1);
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('revision job failure marks scenario as revision_failed and preserves feedback', async () => {
  const runner = new DeferredRunner();
  const ctx = makeTestRuntime({ runner });
  writeApproved(ctx.runtime.config.dataRoot, 'rev-fail-0001');
  const server = await listen(ctx.app);
  try {
    const first = await jsonFetch(`${server.baseUrl}/api/scenarios/rev-fail-0001/revise`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: [{ text: 'сделать мягче' }] }),
    });
    runner.pending[0].reject(Object.assign(new Error('LLM timeout'), { code: 'PROCESS_TIMEOUT' }));
    await new Promise(resolve => setTimeout(resolve, 50));
    const after = ctx.runtime.store.get('rev-fail-0001').record;
    assert.equal(after.revision_status, 'revision_failed');
    assert.equal(after.revision_error.code, 'PROCESS_TIMEOUT');
    assert.equal(after.status, 'draft');
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('startup reconciliation recovers interrupted revoke transitions', async () => {
  const ctx = makeTestRuntime();
  writeApproved(ctx.runtime.config.dataRoot, 'rev-intr-0001');
  const file = path.join(ctx.runtime.config.dataRoot, 'scenarios', 'approved', 'rev-intr-0001.json');
  const record = JSON.parse(fs.readFileSync(file, 'utf-8'));
  fs.writeFileSync(file, JSON.stringify({
    ...record,
    revision_status: 'revision_queued',
    revision_request_id: 'req-stale',
  }));
  const job = ctx.runtime.jobStore.create({ type: 'revision', scenarioId: 'rev-intr-0001', requestId: 'req-stale', mode: 'initial', revisionKind: 'standard', feedbackCount: 1 });
  ctx.runtime.jobStore.update(job.id, { status: 'running' });
  const recovered = ctx.runtime.store.reconcileTransitions();
  assert.ok(recovered >= 1, 'reconcileTransitions should detect a stale revoked transition');
  const interrupted = ctx.runtime.jobStore.markInterrupted();
  assert.ok(interrupted >= 1, 'markInterrupted should mark active revision jobs as interrupted');
  const after = ctx.runtime.store.get('rev-intr-0001').record;
  assert.equal(after.status, 'draft');
  assert.equal(after.revision_status, 'revision_idle');
  assert.equal(after.revision_request_id, 'req-stale');
});

test('remix preserves original published record unchanged', async () => {
  const ctx = makeTestRuntime();
  writeScenario(ctx.runtime.config.dataRoot, 'published', { id: 'rev-remix-0001', published_at: '2026-08-01T00:00:00Z', published_url: 'https://site/comic/0001' });
  const server = await listen(ctx.app);
  try {
    const response = await jsonFetch(`${server.baseUrl}/api/scenarios/rev-remix-0001/remix`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_style: 'anime', title: 'Remix title' }),
    });
    assert.equal(response.response.status, 201);
    assert.equal(response.body.status, 'draft');
    assert.equal(response.body.remix_of, 'rev-remix-0001');
    assert.equal(response.body.revision_endpoint, `/api/scenarios/${response.body.id}/revise`);
    const original = ctx.runtime.store.get('rev-remix-0001').record;
    assert.equal(original.status, 'published');
    assert.equal(original.published_url, 'https://site/comic/0001');
    assert.equal(original.remix_of, undefined);
    const draft = ctx.runtime.store.get(response.body.id).record;
    assert.equal(draft.image_style, 'anime');
    assert.equal(draft.title, 'Remix title');
    assert.deepEqual(draft.feedback, []);
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('serializer exposes revision_endpoint during active revision and hides absolute paths', async () => {
  const ctx = makeTestRuntime();
  writeApproved(ctx.runtime.config.dataRoot, 'rev-ser-0001');
  const runner = new DeferredRunner();
  ctx.runtime.runner = runner;
  const jobManager = new JobManager({ config: ctx.runtime.config, jobStore: ctx.runtime.jobStore, runner, logger: ctx.runtime.logger, onRevisionComplete: () => {} });
  ctx.runtime.jobManager = jobManager;
  const server = await listen(ctx.app);
  try {
    const response = await jsonFetch(`${server.baseUrl}/api/scenarios/rev-ser-0001/revise`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: [{ text: 'change' }] }),
    });
    assert.equal(response.response.status, 202);
    const detail = await jsonFetch(`${server.baseUrl}/api/scenarios/rev-ser-0001`);
    assert.equal(detail.body.status, 'draft');
    assert.equal(detail.body.revision_status, 'revision_queued');
    assert.equal(detail.body.revision_endpoint, '/api/scenarios/rev-ser-0001/revise');
    const serialized = JSON.stringify(detail.body);
    assert.equal(serialized.includes('/Users/'), false, 'serializer must not leak absolute filesystem paths');
    assert.equal(serialized.includes('comic_path'), false);
    assert.equal(serialized.includes('panel_paths'), false);
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('revision_kind, source_context_preview and feedback_count are exposed in job detail', async () => {
  const ctx = makeTestRuntime();
  writeApproved(ctx.runtime.config.dataRoot, 'rev-job-0001');
  const server = await listen(ctx.app);
  try {
    const revise = await jsonFetch(`${server.baseUrl}/api/scenarios/rev-job-0001/revise`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: [{ text: 'a' }, { text: 'b' }], source_context: 'long source context' }),
    });
    const jobId = revise.body.job.id;
    const detail = await jsonFetch(`${server.baseUrl}/api/jobs/${jobId}`);
    assert.equal(detail.body.job.type, 'revision');
    assert.equal(detail.body.job.revision_kind, 'standard');
    assert.equal(detail.body.job.feedback_count, 2);
    assert.equal(typeof detail.body.job.source_context_preview, 'string');
    assert.equal(detail.body.job.request_id, revise.body.request_id);
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('logger emits revision.requested and remix.created with request_id and scenario_id', async () => {
  const ctx = makeTestRuntime();
  writeApproved(ctx.runtime.config.dataRoot, 'rev-log-0001');
  writeScenario(ctx.runtime.config.dataRoot, 'published', { id: 'rev-log-0002' });
  const server = await listen(ctx.app);
  try {
    await jsonFetch(`${server.baseUrl}/api/scenarios/rev-log-0001/revise`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: [{ text: 'note' }] }),
    });
    await jsonFetch(`${server.baseUrl}/api/scenarios/rev-log-0002/remix`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    });
    const requested = ctx.runtime.logger.entries.find(entry => entry.component === 'revision.requested');
    const created = ctx.runtime.logger.entries.find(entry => entry.component === 'remix.created');
    assert.ok(requested, 'revision.requested event should be logged');
    assert.equal(requested.scenario_id, 'rev-log-0001');
    assert.equal(typeof requested.request_id, 'string');
    assert.equal(requested.feedback_count, 1);
    assert.ok(created, 'remix.created event should be logged');
    assert.equal(created.source_id, 'rev-log-0002');
    assert.equal(typeof created.scenario_id, 'string');
    assert.equal(typeof created.request_id, 'string');
  } finally { await server.close(); ctx.project.cleanup(); }
});
