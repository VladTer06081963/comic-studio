import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { AppError, conflict, notFound } from './errors.js';
import { atomicWriteJson, readJson } from './fs_atomic.js';
import { KeyedLock } from './keyed_lock.js';
import { safeResolve, scenarioId, STATES } from './validation.js';

function sortScenarios(a, b) {
  return String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id));
}

export function serializeScenario(record, { detail = false } = {}) {
  const out = {};
  const fields = [
    'id', 'title', 'status', 'tone', 'style', 'image_style', 'layout', 'aspect_ratio', 'seed',
    'source', 'source_url', 'created_at', 'approved_at', 'rejected_at', 'rendered_at',
    'published_at', 'published_url', 'render_revision', 'revision_status',
  ];
  for (const field of fields) if (record[field] !== undefined) out[field] = record[field];
  out.panels = Array.isArray(record.panels)
    ? record.panels.map(panel => ({
        n: panel.n,
        caption: panel.caption,
        ...(detail && typeof panel.prompt === 'string' ? { prompt: panel.prompt } : {}),
      }))
    : [];
  out.feedback_count = Array.isArray(record.feedback) ? record.feedback.length : 0;
  if (detail && Array.isArray(record.feedback)) {
    out.feedback = record.feedback.map(item => ({ ts: item.ts, text: item.text, source: item.source }));
  }
  if (['rendered', 'published'].includes(record.status)) out.comic_url = `/comics/${record.id}.png`;
  return out;
}

export class ScenarioStore {
  constructor({ dataRoot, logger, clock = () => new Date(), idGenerator = randomUUID } = {}) {
    this.dataRoot = path.resolve(dataRoot);
    this.scenariosRoot = safeResolve(this.dataRoot, 'scenarios');
    this.comicsRoot = safeResolve(this.dataRoot, 'comics');
    this.trashRoot = safeResolve(this.dataRoot, '.trash');
    this.logger = logger;
    this.clock = clock;
    this.idGenerator = idGenerator;
    this.lock = new KeyedLock();
    this.ensureRoots();
  }

  ensureRoots() {
    for (const state of STATES) fs.mkdirSync(this.statusDir(state), { recursive: true });
    for (const dir of [this.comicsRoot, safeResolve(this.comicsRoot, 'raw'), this.trashRoot]) fs.mkdirSync(dir, { recursive: true });
  }

  statusDir(state) {
    return safeResolve(this.scenariosRoot, state);
  }

  scenarioPath(state, id) {
    return safeResolve(this.statusDir(state), `${scenarioId(id)}.json`);
  }

  _candidate(state, id) {
    const filePath = this.scenarioPath(state, id);
    if (!fs.existsSync(filePath)) return null;
    let record;
    try {
      record = readJson(filePath);
    } catch (error) {
      throw new AppError(409, 'SCENARIO_MALFORMED', 'Scenario record is malformed', { id, status: state });
    }
    if (!record || typeof record !== 'object' || record.id !== id) {
      throw new AppError(409, 'SCENARIO_INVALID_RECORD', 'Scenario record has invalid identity', { id, status: state });
    }
    return { state, path: filePath, record };
  }

  _collect(id) {
    return STATES.map(state => this._candidate(state, id)).filter(Boolean);
  }

  reconcileOne(candidate) {
    const { state, path: sourcePath, record } = candidate;
    const transition = record._transition;
    if (transition && transition.to === state && record.status === state) {
      const clean = { ...record };
      delete clean._transition;
      atomicWriteJson(sourcePath, clean);
      this.logger?.warn('scenario.transition.finalized', { scenario_id: record.id, to: state });
      return { state, path: sourcePath, record: clean };
    }
    if (!transition || transition.from !== state || transition.to !== record.status || !STATES.includes(transition.to)) {
      if (record.status !== state) {
        throw conflict('SCENARIO_STATE_MISMATCH', 'Scenario directory and status do not match', { id: record.id, directory: state });
      }
      return candidate;
    }
    const destination = this.scenarioPath(transition.to, record.id);
    if (fs.existsSync(destination)) throw conflict('SCENARIO_STATE_CONFLICT', 'Transition destination already exists');
    fs.renameSync(sourcePath, destination);
    const clean = { ...record };
    delete clean._transition;
    atomicWriteJson(destination, clean);
    this.logger?.warn('scenario.transition.recovered', { scenario_id: record.id, from: state, to: transition.to });
    return { state: transition.to, path: destination, record: clean };
  }

  find(id, { reconcile = true } = {}) {
    scenarioId(id);
    const candidates = this._collect(id);
    if (candidates.length === 0) return null;
    if (candidates.length > 1) throw conflict('SCENARIO_STATE_CONFLICT', 'Scenario exists in multiple lifecycle queues', { id });
    const candidate = candidates[0];
    if (candidate.record._transition) return reconcile ? this.reconcileOne(candidate) : candidate;
    if (candidate.record.status !== candidate.state) return reconcile ? this.reconcileOne(candidate) : candidate;
    return candidate;
  }

  get(id, options) {
    const found = this.find(id, options);
    if (!found) throw notFound('SCENARIO_NOT_FOUND', 'Scenario not found');
    return found;
  }

  list(selected = 'all') {
    const states = selected === 'all' ? STATES : [selected];
    const items = [];
    let invalidCount = 0;
    const seen = new Set();
    for (const state of states) {
      const dir = this.statusDir(state);
      const files = fs.readdirSync(dir).filter(name => name.endsWith('.json')).sort();
      for (const file of files) {
        const id = file.slice(0, -5);
        try {
          scenarioId(id);
          const candidate = this._candidate(state, id);
          if (candidate.record.status !== state) throw conflict('SCENARIO_STATE_MISMATCH', 'Scenario directory and status do not match');
          if (seen.has(id)) throw conflict('SCENARIO_STATE_CONFLICT', 'Duplicate scenario ID');
          seen.add(id);
          items.push(candidate.record);
        } catch (error) {
          invalidCount += 1;
          this.logger?.error('scenario.list.invalid', { scenario_id: id, directory: state, code: error.code || 'INVALID_RECORD' });
        }
      }
    }
    items.sort(sortScenarios);
    return { items, invalidCount };
  }

  async transition(id, fromState, toState, extraFields = {}) {
    return this.lock.withKey(id, async () => {
      const current = this.get(id);
      if (current.state === toState && current.record.status === toState) {
        return { record: current.record, idempotent: true };
      }
      if (current.state !== fromState || current.record.status !== fromState) {
        throw conflict('INVALID_TRANSITION', `Cannot transition ${current.state} to ${toState}`);
      }
      const destination = this.scenarioPath(toState, id);
      if (fs.existsSync(destination)) throw conflict('DESTINATION_EXISTS', 'Transition destination already exists');
      const next = {
        ...current.record,
        ...extraFields,
        status: toState,
        [`${toState}_at`]: this.clock().toISOString(),
        _transition: { from: fromState, to: toState, started_at: this.clock().toISOString() },
      };
      atomicWriteJson(current.path, next);
      fs.renameSync(current.path, destination);
      delete next._transition;
      atomicWriteJson(destination, next);
      this.logger?.info('scenario.transition', { scenario_id: id, from: fromState, to: toState, outcome: 'success' });
      return { record: next, idempotent: false };
    });
  }

  async update(id, mutator) {
    return this.lock.withKey(id, async () => {
      const current = this.get(id);
      const next = await mutator({ ...current.record }, current.state);
      if (!next || next.id !== id || next.status !== current.state) {
        throw conflict('INVALID_UPDATE', 'Update cannot change scenario identity or lifecycle status');
      }
      atomicWriteJson(current.path, next);
      return { record: next, state: current.state };
    });
  }

  reconcileTransitions() {
    let recovered = 0;
    for (const state of STATES) {
      for (const file of fs.readdirSync(this.statusDir(state)).filter(name => name.endsWith('.json'))) {
        const id = file.slice(0, -5);
        try {
          const candidate = this._candidate(state, id);
          if (candidate.record._transition || candidate.record.status !== state) {
            this.reconcileOne(candidate);
            recovered += 1;
          }
        } catch (error) {
          this.logger?.error('scenario.reconcile.failed', { scenario_id: id, directory: state, code: error.code || 'RECONCILE_FAILED' });
        }
      }
    }
    return recovered;
  }

  _deletePlan(candidate) {
    const id = candidate.record.id;
    return [
      candidate.path,
      safeResolve(this.comicsRoot, id),
      safeResolve(this.comicsRoot, `${id}.png`),
      safeResolve(this.comicsRoot, 'raw', `${id}.png`),
    ].filter(item => fs.existsSync(item));
  }

  async deleteMutable(id) {
    return this.lock.withKey(id, async () => {
      const candidate = this.get(id);
      if (candidate.state === 'published') throw conflict('PUBLISHED_IMMUTABLE', 'Published scenarios cannot be deleted');
      const operationId = this.idGenerator();
      const operationRoot = safeResolve(this.trashRoot, operationId);
      fs.mkdirSync(operationRoot, { recursive: false });
      const plan = this._deletePlan(candidate).map((original, index) => ({
        original,
        staged: safeResolve(operationRoot, `${index}-${path.basename(original)}`),
        moved: false,
      }));
      const manifestPath = safeResolve(operationRoot, 'manifest.json');
      const manifest = { id: operationId, scenario_id: id, phase: 'moving', artifacts: plan };
      atomicWriteJson(manifestPath, manifest);
      try {
        for (const item of plan) {
          fs.renameSync(item.original, item.staged);
          item.moved = true;
          atomicWriteJson(manifestPath, manifest);
        }
        manifest.phase = 'committed';
        atomicWriteJson(manifestPath, manifest);
        const artifacts = plan.map(item => path.relative(this.dataRoot, item.original));
        fs.rmSync(operationRoot, { recursive: true, force: true });
        this.logger?.info('scenario.delete', { scenario_id: id, artifacts, outcome: 'success' });
        return artifacts;
      } catch (error) {
        for (const item of [...plan].reverse()) {
          if (item.moved && fs.existsSync(item.staged) && !fs.existsSync(item.original)) {
            try { fs.renameSync(item.staged, item.original); } catch {}
          }
        }
        throw error;
      }
    });
  }

  recoverTrash() {
    let recovered = 0;
    for (const entry of fs.readdirSync(this.trashRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const operationRoot = safeResolve(this.trashRoot, entry.name);
      const manifestPath = safeResolve(operationRoot, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;
      try {
        const manifest = readJson(manifestPath);
        if (manifest.phase === 'committed') {
          fs.rmSync(operationRoot, { recursive: true, force: true });
          recovered += 1;
          continue;
        }
        for (const item of [...manifest.artifacts].reverse()) {
          const original = path.resolve(item.original);
          const staged = path.resolve(item.staged);
          if (!original.startsWith(`${this.dataRoot}${path.sep}`) || !staged.startsWith(`${this.trashRoot}${path.sep}`)) continue;
          if (fs.existsSync(staged) && !fs.existsSync(original)) {
            fs.mkdirSync(path.dirname(original), { recursive: true });
            fs.renameSync(staged, original);
          }
        }
        fs.rmSync(operationRoot, { recursive: true, force: true });
        recovered += 1;
      } catch (error) {
        this.logger?.error('trash.recovery.failed', { operation_id: entry.name, code: error.code || 'TRASH_RECOVERY_FAILED' });
      }
    }
    return recovered;
  }
}
