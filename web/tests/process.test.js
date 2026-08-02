import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { ProcessRunner } from '../lib/process_runner.js';
import { AppError } from '../lib/errors.js';
import { FakeRunner, makeTestRuntime, writeScenario, listen, jsonFetch } from './helpers.js';

test('ProcessRunner passes shell syntax as an opaque argument', async () => {
  const marker = path.join(process.cwd(), `should-not-exist-${process.pid}`);
  const runner = new ProcessRunner();
  const payload = `$(touch ${marker})`;
  const result = await runner.run(process.execPath, ['-e', 'console.log(process.argv[1])', payload], {
    cwd: process.cwd(), timeoutMs: 1000, outputLimit: 1024 * 1024,
  });
  assert.equal(result.stdout.trim(), payload);
  assert.equal(fs.existsSync(marker), false);
});

test('ProcessRunner reports timeout and non-zero exit explicitly', async () => {
  const runner = new ProcessRunner();
  await assert.rejects(
    runner.run(process.execPath, ['-e', 'setTimeout(() => {}, 1000)'], { cwd: process.cwd(), timeoutMs: 50, outputLimit: 1024 }),
    error => error.code === 'PROCESS_TIMEOUT',
  );
  await assert.rejects(
    runner.run(process.execPath, ['-e', 'process.exit(7)'], { cwd: process.cwd(), timeoutMs: 1000, outputLimit: 1024 }),
    error => error.code === 'PROCESS_FAILED' && error.details.exit_code === 7,
  );
});

test('scenario creation validates input before runner invocation', async () => {
  const runner = new FakeRunner();
  const ctx = makeTestRuntime({ runner });
  const server = await listen(ctx.app);
  try {
    const empty = await jsonFetch(`${server.baseUrl}/api/scenarios`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: '   ' }),
    });
    assert.equal(empty.response.status, 400);
    const style = await jsonFetch(`${server.baseUrl}/api/scenarios`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'idea', image_style: '$(bad)' }),
    });
    assert.equal(style.response.status, 400);
    assert.equal(runner.calls.length, 0);
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('scenario creation sends content as one opaque argument and returns 201', async () => {
  const runner = new FakeRunner();
  const ctx = makeTestRuntime({ runner });
  const payload = 'idea $(touch /tmp/never) `whoami`';
  runner.result = ({ args }) => {
    writeScenario(ctx.runtime.config.dataRoot, 'draft', { id: 'draft-0001' });
    return { code: 0, stdout: `${JSON.stringify({ ok: true, id: 'draft-0001', status: 'draft' })}\n`, stderr: '' };
  };
  const server = await listen(ctx.app);
  try {
    const result = await jsonFetch(`${server.baseUrl}/api/scenarios`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: payload, image_style: 'comic', caption_style: 'bubble' }),
    });
    assert.equal(result.response.status, 201);
    assert.equal(result.body.id, 'draft-0001');
    assert.equal(runner.calls.length, 1);
    assert.equal(runner.calls[0].args.at(-1), payload);
    assert.equal(runner.calls[0].args.includes('--json-result'), true);
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('failed or malformed ingest output never claims draft creation', async () => {
  for (const runner of [
    new FakeRunner({ error: new AppError(504, 'PROCESS_TIMEOUT', 'timed out') }),
    new FakeRunner({ result: { code: 0, stdout: 'human output only', stderr: '' } }),
  ]) {
    const ctx = makeTestRuntime({ runner });
    const server = await listen(ctx.app);
    try {
      const result = await jsonFetch(`${server.baseUrl}/api/scenarios`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'valid idea' }),
      });
      assert.ok([502, 504].includes(result.response.status));
      assert.equal(ctx.runtime.store.list('draft').items.length, 0);
    } finally { await server.close(); ctx.project.cleanup(); }
  }
});
