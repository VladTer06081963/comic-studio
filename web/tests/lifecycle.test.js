import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { atomicWriteJson } from '../lib/fs_atomic.js';
import { makeTestRuntime, writeScenario, listen, jsonFetch } from './helpers.js';

test('atomic writer replaces complete JSON and leaves no temp files', () => {
  const ctx = makeTestRuntime();
  try {
    const target = path.join(ctx.runtime.config.dataRoot, 'atomic', 'record.json');
    atomicWriteJson(target, { value: 1 });
    atomicWriteJson(target, { value: 2 });
    assert.deepEqual(JSON.parse(fs.readFileSync(target)), { value: 2 });
    assert.deepEqual(fs.readdirSync(path.dirname(target)), ['record.json']);
  } finally { ctx.project.cleanup(); }
});

test('approve transition is atomic and idempotent', async () => {
  const ctx = makeTestRuntime();
  try {
    writeScenario(ctx.runtime.config.dataRoot, 'draft', { id: 'life-0001' });
    const first = await ctx.runtime.lifecycle.approve('life-0001');
    assert.equal(first.idempotent, false);
    assert.equal(first.record.status, 'approved');
    assert.equal(fs.existsSync(path.join(ctx.runtime.config.dataRoot, 'scenarios', 'draft', 'life-0001.json')), false);
    assert.equal(fs.existsSync(path.join(ctx.runtime.config.dataRoot, 'scenarios', 'approved', 'life-0001.json')), true);
    const repeated = await ctx.runtime.lifecycle.approve('life-0001');
    assert.equal(repeated.idempotent, true);
  } finally { ctx.project.cleanup(); }
});

test('concurrent approve requests serialize under one scenario lock', async () => {
  const ctx = makeTestRuntime();
  try {
    writeScenario(ctx.runtime.config.dataRoot, 'draft', { id: 'life-0002' });
    const results = await Promise.all([
      ctx.runtime.lifecycle.approve('life-0002'),
      ctx.runtime.lifecycle.approve('life-0002'),
    ]);
    assert.deepEqual(results.map(item => item.idempotent).sort(), [false, true]);
    assert.equal(ctx.runtime.store.find('life-0002').state, 'approved');
  } finally { ctx.project.cleanup(); }
});

test('duplicate IDs fail closed instead of selecting the first queue', () => {
  const ctx = makeTestRuntime();
  try {
    writeScenario(ctx.runtime.config.dataRoot, 'draft', { id: 'life-0003' });
    writeScenario(ctx.runtime.config.dataRoot, 'approved', { id: 'life-0003' });
    assert.throws(() => ctx.runtime.store.find('life-0003'), error => error.code === 'SCENARIO_STATE_CONFLICT');
  } finally { ctx.project.cleanup(); }
});

test('malformed list record is isolated and counted', () => {
  const ctx = makeTestRuntime();
  try {
    writeScenario(ctx.runtime.config.dataRoot, 'draft', { id: 'life-0004' });
    fs.writeFileSync(path.join(ctx.runtime.config.dataRoot, 'scenarios', 'draft', 'bad-0001.json'), '{bad');
    const result = ctx.runtime.store.list('draft');
    assert.equal(result.items.length, 1);
    assert.equal(result.invalidCount, 1);
  } finally { ctx.project.cleanup(); }
});

test('interrupted pending transition is reconciled without duplicate record', () => {
  const ctx = makeTestRuntime();
  try {
    const record = writeScenario(ctx.runtime.config.dataRoot, 'draft', { id: 'life-0005' });
    const file = path.join(ctx.runtime.config.dataRoot, 'scenarios', 'draft', 'life-0005.json');
    fs.writeFileSync(file, JSON.stringify({
      ...record,
      status: 'approved',
      _transition: { from: 'draft', to: 'approved', started_at: '2026-08-02T00:00:00Z' },
    }));
    const found = ctx.runtime.store.find('life-0005');
    assert.equal(found.state, 'approved');
    assert.equal(found.record._transition, undefined);
    assert.equal(fs.existsSync(file), false);
  } finally { ctx.project.cleanup(); }
});

test('completed rename with pending metadata is finalized in place', () => {
  const ctx = makeTestRuntime();
  try {
    const record = writeScenario(ctx.runtime.config.dataRoot, 'approved', { id: 'life-0007' });
    const file = path.join(ctx.runtime.config.dataRoot, 'scenarios', 'approved', 'life-0007.json');
    fs.writeFileSync(file, JSON.stringify({
      ...record,
      _transition: { from: 'draft', to: 'approved', started_at: '2026-08-02T00:00:00Z' },
    }));
    const found = ctx.runtime.store.find('life-0007');
    assert.equal(found.state, 'approved');
    assert.equal(found.record._transition, undefined);
  } finally { ctx.project.cleanup(); }
});

test('scenario routes use structured lifecycle responses', async () => {
  const ctx = makeTestRuntime();
  writeScenario(ctx.runtime.config.dataRoot, 'draft', { id: 'life-0006' });
  const server = await listen(ctx.app);
  try {
    const approved = await jsonFetch(`${server.baseUrl}/api/scenarios/life-0006/approve`, { method: 'POST' });
    assert.equal(approved.response.status, 200);
    assert.equal(approved.body.status, 'approved');
    const invalidReject = await jsonFetch(`${server.baseUrl}/api/scenarios/life-0006/reject`, { method: 'POST' });
    assert.equal(invalidReject.response.status, 409);
    assert.equal(invalidReject.body.error.code, 'INVALID_TRANSITION');
    const list = await jsonFetch(`${server.baseUrl}/api/scenarios?status=approved`);
    assert.equal(list.body.items[0].id, 'life-0006');
  } finally { await server.close(); ctx.project.cleanup(); }
});
