import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { loadConfig } from '../lib/config.js';
import { ScenarioStore } from '../lib/scenario_store.js';
import { LifecycleService } from '../lib/lifecycle.js';
import { JobStore } from '../lib/job_store.js';
import { JobManager } from '../lib/job_manager.js';
import { createApp } from '../app.js';

export function tempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-studio-web-'));
  const dataRoot = path.join(root, 'data');
  fs.mkdirSync(path.join(root, 'ui'), { recursive: true });
  fs.writeFileSync(path.join(root, 'ui', 'index.html'), '<!doctype html><title>test</title>');
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  return { root, dataRoot, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

export function sequenceId(prefix = 'id') {
  let n = 0;
  return () => `${prefix}-${String(++n).padStart(4, '0')}`;
}

export function fakeClock(start = '2026-08-02T00:00:00.000Z') {
  let current = Date.parse(start);
  return () => new Date(current++);
}

export class MemoryLogger {
  constructor() { this.entries = []; }
  info(component, fields = {}) { this.entries.push({ level: 'INFO', component, ...fields }); }
  warn(component, fields = {}) { this.entries.push({ level: 'WARN', component, ...fields }); }
  error(component, fields = {}) { this.entries.push({ level: 'ERROR', component, ...fields }); }
}

export class FakeRunner {
  constructor({ result, error, executable = true } = {}) {
    this.calls = [];
    this.result = result || { code: 0, stdout: JSON.stringify({ ok: true, id: 'draft-0001' }), stderr: '' };
    this.error = error;
    this.executable = executable;
    this.stopped = false;
  }
  isExecutable() { return this.executable; }
  async run(executable, args, options) {
    this.calls.push({ executable, args: [...args], options: { ...options } });
    if (this.error) throw this.error;
    return typeof this.result === 'function' ? this.result({ executable, args, options }) : this.result;
  }
  shutdown() { this.stopped = true; }
}

export function writeScenario(dataRoot, status, scenario = {}) {
  const dir = path.join(dataRoot, 'scenarios', status);
  fs.mkdirSync(dir, { recursive: true });
  const { status: _ignored, ...rest } = scenario;
  const record = {
    title: 'Test scenario', tone: 'funny', style: 'bubble', image_style: 'comic', layout: 'comic',
    panels: [{ n: 1, prompt: 'A safe prompt', caption: 'Тест' }], created_at: '2026-08-02T00:00:00Z',
    ...rest, status,
  };
  fs.writeFileSync(path.join(dir, `${record.id}.json`), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

export function makeTestRuntime(options = {}) {
  const project = options.project || tempProject();
  const config = loadConfig({}, {
    projectRoot: project.root,
    dataRoot: project.dataRoot,
    pythonBin: process.execPath,
    host: options.host || '127.0.0.1',
    port: options.port || 3000,
    apiToken: options.apiToken || '',
    allowedOrigins: options.allowedOrigins || [],
    ingestTimeoutMs: 1000,
    renderTimeoutMs: 1000,
    processOutputLimit: 1024 * 1024,
    jobRetentionMs: 60_000,
    artifactRetentionMs: 60_000,
    shutdownGraceMs: 100,
  });
  const logger = options.logger || new MemoryLogger();
  const clock = options.clock || fakeClock();
  const runner = options.runner || new FakeRunner();
  const store = new ScenarioStore({ dataRoot: config.dataRoot, logger, clock, idGenerator: sequenceId('trash') });
  const lifecycle = new LifecycleService({ store, clock, logger, minSeed: config.minSeed, maxSeed: config.maxSeed });
  const jobStore = new JobStore({ dataRoot: config.dataRoot, logger, clock, idGenerator: sequenceId('job') });
  const jobManager = new JobManager({ config, jobStore, runner, logger, onRevisionComplete: async ({ job, parsed, success, error, interrupted = false }) => {
    try {
      if (interrupted) return;
      if (success && parsed && parsed.id) {
        const recordPath = path.join(options.project?.dataRoot || config.dataRoot, 'scenarios', 'draft', `${parsed.id}.json`);
        if (fs.existsSync(recordPath)) {
          const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
          await store.applyRevision(parsed.id, record, { requestId: job.request_id, feedbackCount: parsed.feedback_count });
        }
      } else if (error) {
        await store.markRevisionFailed(job.scenario_id, { requestId: job.request_id, errorCode: error.code || 'REVISION_FAILED', message: error.message || 'Revision failed' });
      }
    } catch {}
  } });
  let stopping = false;
  const runtime = {
    config, logger, store, lifecycle, runner, jobStore, jobManager,
    isShuttingDown: () => stopping,
    async shutdown() { stopping = true; await jobManager.shutdown(config.shutdownGraceMs); },
  };
  return { project, runtime, app: createApp(runtime, { idGenerator: sequenceId('req') }) };
}

export async function listen(app) {
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

export async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();
  return { response, body };
}
