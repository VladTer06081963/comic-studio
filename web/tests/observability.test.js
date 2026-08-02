import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { createLogger } from '../lib/logger.js';
import { loadConfig } from '../lib/config.js';
import { FakeRunner, makeTestRuntime, writeScenario, listen, jsonFetch } from './helpers.js';

class HangingRunner extends FakeRunner {
  run(executable, args, options) {
    this.calls.push({ executable, args, options });
    return new Promise(() => {});
  }
}

test('logger redacts credentials, content and local paths in daily file', () => {
  const ctx = makeTestRuntime();
  try {
    const output = [];
    const logger = createLogger({
      dataRoot: ctx.runtime.config.dataRoot,
      projectRoot: ctx.runtime.config.projectRoot,
      clock: () => new Date('2026-08-02T10:00:00Z'),
      stdout: { log: line => output.push(line), error: line => output.push(line) },
    });
    logger.info('redaction.test', {
      api_token: 'super-secret',
      authorization: 'Bearer secret-value',
      content: 'private article',
      path: path.join(ctx.runtime.config.dataRoot, 'scenarios', 'draft'),
    });
    const text = fs.readFileSync(path.join(ctx.runtime.config.dataRoot, 'logs', '2026-08-02.log'), 'utf8');
    for (const secret of ['super-secret', 'secret-value', 'private article', ctx.runtime.config.dataRoot]) {
      assert.equal(text.includes(secret), false);
    }
    assert.equal(output.length, 1);
  } finally { ctx.project.cleanup(); }
});

test('malformed JSON returns INVALID_JSON and server remains alive', async () => {
  const ctx = makeTestRuntime();
  const server = await listen(ctx.app);
  try {
    const invalid = await jsonFetch(`${server.baseUrl}/api/scenarios`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad',
    });
    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.body.error.code, 'INVALID_JSON');
    const health = await jsonFetch(`${server.baseUrl}/api/health`);
    assert.equal(health.response.status, 200);
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('liveness remains healthy while readiness reports unavailable executable', async () => {
  const ctx = makeTestRuntime({ runner: new FakeRunner({ executable: false }) });
  const server = await listen(ctx.app);
  try {
    const health = await jsonFetch(`${server.baseUrl}/api/health`);
    const ready = await jsonFetch(`${server.baseUrl}/api/ready`);
    assert.equal(health.response.status, 200);
    assert.equal(ready.response.status, 503);
    assert.equal(ready.body.checks.python, false);
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('configuration rejects invalid port and incomplete remote security', () => {
  assert.throws(() => loadConfig({ PORT: 'invalid' }), error => error.code === 'INVALID_CONFIGURATION');
  assert.throws(() => loadConfig({}, { host: '0.0.0.0', projectRoot: process.cwd(), dataRoot: '/tmp/data', pythonBin: process.execPath }), error => error.code === 'INVALID_REMOTE_CONFIGURATION');
});

test('request log correlates request and scenario IDs', async () => {
  const ctx = makeTestRuntime();
  writeScenario(ctx.runtime.config.dataRoot, 'draft', { id: 'obs-0001' });
  const server = await listen(ctx.app);
  try {
    const result = await jsonFetch(`${server.baseUrl}/api/scenarios/obs-0001`);
    const requestId = result.response.headers.get('x-request-id');
    await new Promise(resolve => setImmediate(resolve));
    const entry = ctx.runtime.logger.entries.find(item => item.component === 'web.request' && item.request_id === requestId);
    assert.equal(entry.scenario_id, 'obs-0001');
    assert.equal(entry.status, 200);
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('shutdown stops mutations and marks unfinished jobs interrupted', async () => {
  const runner = new HangingRunner();
  const ctx = makeTestRuntime({ runner });
  writeScenario(ctx.runtime.config.dataRoot, 'approved', { id: 'obs-0002' });
  const server = await listen(ctx.app);
  try {
    const accepted = await jsonFetch(`${server.baseUrl}/api/scenarios/obs-0002/render`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'initial' }),
    });
    await ctx.runtime.shutdown();
    assert.equal(ctx.runtime.jobStore.get(accepted.body.job.id).status, 'interrupted');
    assert.equal(runner.stopped, true);
    const mutation = await jsonFetch(`${server.baseUrl}/api/scenarios/obs-0002/approve`, { method: 'POST' });
    assert.equal(mutation.response.status, 503);
    assert.equal(mutation.body.error.code, 'SERVER_SHUTTING_DOWN');
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('retention removes old terminal jobs but preserves archive content', () => {
  const ctx = makeTestRuntime();
  try {
    const job = ctx.runtime.jobStore.create({ type: 'render', scenarioId: 'obs-0003', mode: 'initial', requestId: 'req-old' });
    ctx.runtime.jobStore.update(job.id, { status: 'failed', finished_at: '2020-01-01T00:00:00Z' });
    const archive = path.join(ctx.runtime.config.dataRoot, 'archive', 'keep.txt');
    fs.mkdirSync(path.dirname(archive), { recursive: true });
    fs.writeFileSync(archive, 'keep');
    assert.equal(ctx.runtime.jobStore.cleanup(1000), 1);
    assert.equal(fs.readFileSync(archive, 'utf8'), 'keep');
  } finally { ctx.project.cleanup(); }
});
