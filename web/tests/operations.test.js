import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { makeTestRuntime, writeScenario, listen, jsonFetch } from './helpers.js';

function createArtifacts(dataRoot, id) {
  const panels = path.join(dataRoot, 'comics', id);
  const raw = path.join(dataRoot, 'comics', 'raw');
  fs.mkdirSync(panels, { recursive: true });
  fs.mkdirSync(raw, { recursive: true });
  fs.writeFileSync(path.join(panels, 'panel_1.png'), 'panel');
  fs.writeFileSync(path.join(dataRoot, 'comics', `${id}.png`), 'final');
  fs.writeFileSync(path.join(raw, `${id}.png`), 'raw');
}

test('seed endpoint validates integer and prevents rendered drift', async () => {
  const ctx = makeTestRuntime();
  writeScenario(ctx.runtime.config.dataRoot, 'approved', { id: 'ops-0001', seed: 1 });
  writeScenario(ctx.runtime.config.dataRoot, 'rendered', { id: 'ops-0002', seed: 2 });
  const server = await listen(ctx.app);
  try {
    const invalid = await jsonFetch(`${server.baseUrl}/api/scenarios/ops-0001/seed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seed: 'abc' }),
    });
    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.body.error.code, 'INVALID_SEED');
    const valid = await jsonFetch(`${server.baseUrl}/api/scenarios/ops-0001/seed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seed: 123 }),
    });
    assert.equal(valid.response.status, 200);
    assert.equal(valid.body.seed, 123);
    const rendered = await jsonFetch(`${server.baseUrl}/api/scenarios/ops-0002/seed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seed: 456 }),
    });
    assert.equal(rendered.response.status, 409);
    assert.equal(rendered.body.error.code, 'SEED_REQUIRES_RERENDER');
    assert.equal(ctx.runtime.store.get('ops-0002').record.seed, 2);
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('feedback rejects non-published scenarios with REVISION_REQUIRED and published with PUBLISHED_IMMUTABLE', async () => {
  const ctx = makeTestRuntime();
  writeScenario(ctx.runtime.config.dataRoot, 'approved', { id: 'ops-0003' });
  writeScenario(ctx.runtime.config.dataRoot, 'published', { id: 'ops-0004' });
  const server = await listen(ctx.app);
  try {
    const recorded = await jsonFetch(`${server.baseUrl}/api/scenarios/ops-0003/feedback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Сделать финал смешнее' }),
    });
    assert.equal(recorded.response.status, 409);
    assert.equal(recorded.body.error.code, 'REVISION_REQUIRED');
    assert.equal(recorded.body.error.details.revise_endpoint, '/api/scenarios/ops-0003/revise');
    assert.equal(ctx.runtime.store.get('ops-0003').record.status, 'approved');

    const published = await jsonFetch(`${server.baseUrl}/api/scenarios/ops-0004/feedback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'change' }),
    });
    assert.equal(published.response.status, 409);
    assert.equal(published.body.error.code, 'PUBLISHED_IMMUTABLE');
    assert.equal(published.body.error.details.remix_endpoint, '/api/scenarios/ops-0004/remix');
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('delete requires confirmation, removes mutable artifacts and preserves archive', async () => {
  const ctx = makeTestRuntime();
  writeScenario(ctx.runtime.config.dataRoot, 'rendered', { id: 'ops-0005' });
  createArtifacts(ctx.runtime.config.dataRoot, 'ops-0005');
  const archive = path.join(ctx.runtime.config.dataRoot, 'archive', '2026-08-02');
  fs.mkdirSync(archive, { recursive: true });
  const sentinel = path.join(archive, 'ops-0005.json');
  fs.writeFileSync(sentinel, 'immutable');
  const server = await listen(ctx.app);
  try {
    const missing = await jsonFetch(`${server.baseUrl}/api/scenarios/ops-0005`, { method: 'DELETE' });
    assert.equal(missing.response.status, 409);
    assert.equal(missing.body.error.code, 'DELETE_CONFIRMATION_REQUIRED');
    const deleted = await jsonFetch(`${server.baseUrl}/api/scenarios/ops-0005?confirm=true`, { method: 'DELETE' });
    assert.equal(deleted.response.status, 200);
    assert.equal(deleted.body.artifacts.length, 4);
    assert.equal(ctx.runtime.store.find('ops-0005'), null);
    assert.equal(fs.existsSync(path.join(ctx.runtime.config.dataRoot, 'comics', 'ops-0005.png')), false);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'immutable');
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('published delete is rejected before artifact mutation', async () => {
  const ctx = makeTestRuntime();
  writeScenario(ctx.runtime.config.dataRoot, 'published', { id: 'ops-0006' });
  createArtifacts(ctx.runtime.config.dataRoot, 'ops-0006');
  const server = await listen(ctx.app);
  try {
    const result = await jsonFetch(`${server.baseUrl}/api/scenarios/ops-0006?confirm=true`, { method: 'DELETE' });
    assert.equal(result.response.status, 409);
    assert.equal(result.body.error.code, 'PUBLISHED_IMMUTABLE');
    assert.equal(ctx.runtime.store.find('ops-0006').state, 'published');
    assert.equal(fs.existsSync(path.join(ctx.runtime.config.dataRoot, 'comics', 'ops-0006.png')), true);
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('partial staged delete rolls back already moved artifacts', async () => {
  const ctx = makeTestRuntime();
  writeScenario(ctx.runtime.config.dataRoot, 'rendered', { id: 'ops-0007' });
  createArtifacts(ctx.runtime.config.dataRoot, 'ops-0007');
  const panelsPath = path.join(ctx.runtime.config.dataRoot, 'comics', 'ops-0007');
  const originalRename = fs.renameSync;
  fs.renameSync = function (source, destination) {
    if (path.resolve(source) === path.resolve(panelsPath)) throw new Error('simulated move failure');
    return originalRename.call(fs, source, destination);
  };
  try {
    await assert.rejects(ctx.runtime.store.deleteMutable('ops-0007'), /simulated move failure/);
    assert.equal(ctx.runtime.store.find('ops-0007').state, 'rendered');
    assert.equal(fs.existsSync(panelsPath), true);
  } finally {
    fs.renameSync = originalRename;
    ctx.project.cleanup();
  }
});
