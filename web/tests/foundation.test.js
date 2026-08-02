import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTestRuntime, listen, jsonFetch } from './helpers.js';

async function withServer(fn) {
  const ctx = makeTestRuntime();
  const server = await listen(ctx.app);
  try { await fn(ctx, server); }
  finally { await server.close(); ctx.project.cleanup(); }
}

test('createApp is injectable and health requires no live credentials', async () => {
  await withServer(async ({ runtime }, { baseUrl }) => {
    const { response, body } = await jsonFetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(runtime.runner.calls.length, 0);
    assert.match(response.headers.get('x-request-id'), /^req-/);
  });
});

test('readiness uses local executable and mutable temporary data root only', async () => {
  await withServer(async (_ctx, { baseUrl }) => {
    const { response, body } = await jsonFetch(`${baseUrl}/api/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(body.checks, { shutting_down: true, data_root: true, python: true, security: true });
  });
});

test('unknown route returns structured error', async () => {
  await withServer(async (_ctx, { baseUrl }) => {
    const { response, body } = await jsonFetch(`${baseUrl}/api/missing`);
    assert.equal(response.status, 404);
    assert.equal(body.error.code, 'ROUTE_NOT_FOUND');
    assert.equal(body.error.request_id, response.headers.get('x-request-id'));
  });
});
