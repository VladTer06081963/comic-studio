import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { loadConfig } from '../lib/config.js';
import { safeResolve } from '../lib/validation.js';
import { makeTestRuntime, listen, jsonFetch, writeScenario } from './helpers.js';

async function serve(ctx, fn) {
  const server = await listen(ctx.app);
  try { await fn(server.baseUrl); }
  finally { await server.close(); ctx.project.cleanup(); }
}

test('remote configuration fails closed without token and origins', () => {
  assert.throws(() => loadConfig({}, { host: '0.0.0.0', projectRoot: process.cwd(), dataRoot: path.join(process.cwd(), 'tmp'), pythonBin: process.execPath }), /requires WEB_API_TOKEN/);
});

test('local mode rejects foreign browser origin and emits no wildcard CORS', async () => {
  const ctx = makeTestRuntime();
  await serve(ctx, async baseUrl => {
    const denied = await jsonFetch(`${baseUrl}/api/health`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(denied.response.status, 403);
    assert.equal(denied.body.error.code, 'ORIGIN_FORBIDDEN');
    const allowed = await fetch(`${baseUrl}/api/health`);
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), null);
  });
});

test('remote mode requires exact origin and bearer token for API', async () => {
  const ctx = makeTestRuntime({ host: '0.0.0.0', apiToken: 'top-secret', allowedOrigins: ['https://studio.example'] });
  await serve(ctx, async baseUrl => {
    const missing = await jsonFetch(`${baseUrl}/api/health`, { headers: { Origin: 'https://studio.example' } });
    assert.equal(missing.response.status, 401);
    assert.equal(missing.body.error.code, 'UNAUTHORIZED');

    const forbidden = await jsonFetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'https://evil.example', Authorization: 'Bearer top-secret' },
    });
    assert.equal(forbidden.response.status, 403);

    const ok = await jsonFetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'https://studio.example', Authorization: 'Bearer top-secret' },
    });
    assert.equal(ok.response.status, 200);
    assert.equal(ok.response.headers.get('access-control-allow-origin'), 'https://studio.example');
  });
});

test('legacy scenario static route is denied and API serializer hides absolute paths', async () => {
  const ctx = makeTestRuntime();
  writeScenario(ctx.runtime.config.dataRoot, 'rendered', {
    id: 'safe-0001',
    comic_path: '/Users/private/project/data/comics/safe-0001.png',
    context: 'private source context',
  });
  await serve(ctx, async baseUrl => {
    const legacy = await jsonFetch(`${baseUrl}/scenarios/rendered/safe-0001.json`);
    assert.equal(legacy.response.status, 404);
    const list = await jsonFetch(`${baseUrl}/api/scenarios?status=rendered`);
    assert.equal(list.response.status, 200);
    assert.equal(list.body.items.length, 1);
    assert.equal(list.body.items[0].comic_path, undefined);
    assert.equal(list.body.items[0].context, undefined);
    assert.equal(list.body.items[0].comic_url, '/comics/safe-0001.png');
  });
});

test('safeResolve rejects paths outside configured root', () => {
  const root = path.resolve('/tmp/comic-root');
  assert.throws(() => safeResolve(root, '..', 'outside'), /escapes configured root/);
  assert.equal(safeResolve(root, 'inside', 'file.json'), path.join(root, 'inside', 'file.json'));
});
