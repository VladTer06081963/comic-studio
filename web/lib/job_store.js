import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { atomicWriteJson, readJson } from './fs_atomic.js';
import { notFound } from './errors.js';
import { safeResolve } from './validation.js';

const ACTIVE = new Set(['queued', 'running']);
const TERMINAL = new Set(['succeeded', 'failed', 'interrupted']);
const JOB_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

export class JobStore {
  constructor({ dataRoot, clock = () => new Date(), idGenerator = randomUUID, logger } = {}) {
    this.root = safeResolve(path.resolve(dataRoot), 'jobs');
    this.clock = clock;
    this.idGenerator = idGenerator;
    this.logger = logger;
    fs.mkdirSync(this.root, { recursive: true });
  }

  pathFor(id) {
    if (!JOB_ID_RE.test(String(id))) throw notFound('JOB_NOT_FOUND', 'Job not found');
    return safeResolve(this.root, `${id}.json`);
  }

  create({ type, scenarioId, mode, requestId, seed, revisionKind, sourceContextPreview, feedbackCount }) {
    if (!['render', 'revision'].includes(type)) {
      const err = new Error(`Invalid job type: ${type}`);
      err.code = 'INVALID_JOB_TYPE';
      throw err;
    }
    const job = {
      id: this.idGenerator(),
      type,
      scenario_id: scenarioId,
      mode,
      status: 'queued',
      created_at: this.clock().toISOString(),
      request_id: requestId,
      ...(seed !== undefined ? { seed } : {}),
      ...(revisionKind !== undefined ? { revision_kind: revisionKind } : {}),
      ...(sourceContextPreview !== undefined ? { source_context_preview: sourceContextPreview } : {}),
      ...(feedbackCount !== undefined ? { feedback_count: feedbackCount } : {}),
    };
    atomicWriteJson(this.pathFor(job.id), job, { overwrite: false });
    return job;
  }

  get(id) {
    const filePath = this.pathFor(id);
    if (!fs.existsSync(filePath)) throw notFound('JOB_NOT_FOUND', 'Job not found');
    return readJson(filePath);
  }

  update(id, patch) {
    const job = this.get(id);
    const next = { ...job, ...patch };
    atomicWriteJson(this.pathFor(id), next);
    return next;
  }

  list() {
    const jobs = [];
    for (const file of fs.readdirSync(this.root).filter(name => name.endsWith('.json')).sort()) {
      try { jobs.push(readJson(safeResolve(this.root, file))); }
      catch { this.logger?.error('job.invalid', { job_file: file }); }
    }
    return jobs.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  activeForScenario(scenarioId) {
    return this.list().find(job => job.scenario_id === scenarioId && ACTIVE.has(job.status)) || null;
  }

  markInterrupted() {
    let count = 0;
    for (const job of this.list()) {
      if (!ACTIVE.has(job.status)) continue;
      this.update(job.id, {
        status: 'interrupted',
        finished_at: this.clock().toISOString(),
        error: { code: 'PROCESS_INTERRUPTED', message: 'Server restarted or shut down during job' },
      });
      count += 1;
    }
    return count;
  }

  cleanup(retentionMs) {
    const cutoff = this.clock().getTime() - retentionMs;
    let removed = 0;
    for (const job of this.list()) {
      if (!TERMINAL.has(job.status)) continue;
      const when = Date.parse(job.finished_at || job.created_at);
      if (Number.isFinite(when) && when < cutoff) {
        fs.unlinkSync(this.pathFor(job.id));
        removed += 1;
      }
    }
    return removed;
  }
}

export function serializeJob(job) {
  return {
    id: job.id,
    type: job.type,
    scenario_id: job.scenario_id,
    mode: job.mode,
    revision_kind: job.revision_kind,
    source_context_preview: job.source_context_preview,
    feedback_count: job.feedback_count,
    status: job.status,
    created_at: job.created_at,
    started_at: job.started_at,
    finished_at: job.finished_at,
    request_id: job.request_id,
    seed: job.seed,
    result: job.result,
    error: job.error,
  };
}
