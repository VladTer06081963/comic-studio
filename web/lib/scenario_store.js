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
    'published_at', 'published_url', 'render_revision',
    'revision_status', 'revision_at', 'revision_request_id', 'revision_of',
    'revision_error', 'remix_of', 'remix_created_at',
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
  if (Array.isArray(record.revision_history)) {
    out.revision_history = record.revision_history.map(item => ({
      ts: item.ts,
      status: item.status,
      request_id: item.request_id,
      feedback_count: item.feedback_count,
    }));
  }
  if (['rendered', 'published'].includes(record.status)) out.comic_url = `/comics/${record.id}.png`;
  if (record.remix_of) out.revision_endpoint = `/api/scenarios/${record.remix_of}/revise`;
  if (record.status === 'published' && !record.remix_of) {
    out.revision_endpoint = `/api/scenarios/${record.id}/remix`;
  }
  if (['revision_queued', 'revision_running', 'revision_idle'].includes(record.revision_status)) {
    out.revision_endpoint = `/api/scenarios/${record.id}/revise`;
  }
  return out;
}

export class ScenarioStore {
  constructor({ dataRoot, logger, clock = () => new Date(), idGenerator = randomUUID, maxRevisionHistory = 10 } = {}) {
    this.dataRoot = path.resolve(dataRoot);
    this.scenariosRoot = safeResolve(this.dataRoot, 'scenarios');
    this.comicsRoot = safeResolve(this.dataRoot, 'comics');
    this.legacyRoot = safeResolve(this.dataRoot, '.staging', 'legacy');
    this.trashRoot = safeResolve(this.dataRoot, '.trash');
    this.logger = logger;
    this.clock = clock;
    this.idGenerator = idGenerator;
    this.maxRevisionHistory = maxRevisionHistory;
    this.lock = new KeyedLock();
    this.ensureRoots();
  }

  ensureRoots() {
    for (const state of STATES) fs.mkdirSync(this.statusDir(state), { recursive: true });
    for (const dir of [this.comicsRoot, safeResolve(this.comicsRoot, 'raw'), this.legacyRoot, this.trashRoot]) fs.mkdirSync(dir, { recursive: true });
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
    if (candidates.length > 1) {
      const distinctStates = new Set(candidates.map(item => item.state));
      if (distinctStates.size > 1) {
        this.logger?.error('scenario.find.duplicate_states', { scenario_id: id, states: [...distinctStates] });
        throw conflict('SCENARIO_STATE_CONFLICT', 'Duplicate scenario ID across lifecycle queues', { id, states: [...distinctStates] });
      }
      this.logger?.warn('scenario.find.duplicates', { scenario_id: id, count: candidates.length });
    }
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

  async revokeApproval(id, { requestId, reason = 'revision' } = {}) {
    return this.lock.withKey(id, async () => {
      const current = this.get(id);
      if (!['approved', 'rendered'].includes(current.state)) {
        throw conflict('APPROVAL_REQUIRED', 'Scenario must be approved or rendered before revision');
      }
      const now = this.clock().toISOString();
      const destination = this.scenarioPath('draft', id);
      if (fs.existsSync(destination)) throw conflict('DESTINATION_EXISTS', 'Draft destination already exists for revoked scenario');
      const next = {
        ...current.record,
        status: 'draft',
        revision_status: 'revision_queued',
        revision_request_id: requestId || this.idGenerator(),
        revision_at: now,
        revision_source: current.state,
        draft_at: now,
      };
      delete next.approved_at;
      delete next.rendered_at;
      delete next.render_revision;
      delete next.panel_paths;
      delete next.comic_path;
      delete next._transition;
      atomicWriteJson(destination, next);
      fs.unlinkSync(current.path);
      this.logger?.info('scenario.revoke', { scenario_id: id, from: current.state, reason });
      return { record: next, previous: current.state };
    });
  }

  async applyRevision(id, revised, { requestId, feedbackCount = 0 } = {}) {
    return this.lock.withKey(id, async () => {
      const current = this.get(id);
      if (current.state !== 'draft') {
        throw conflict('INVALID_REVISION_TARGET', 'Revisions can only be saved into the draft queue');
      }
      const history = Array.isArray(current.record.revision_history) ? current.record.revision_history : [];
      const previousEntry = {
        ts: current.record.revision_at || this.clock().toISOString(),
        status: current.record.revision_status || 'revision_queued',
        request_id: current.record.revision_request_id,
        feedback_count: feedbackCount,
      };
      history.push(previousEntry);
      while (history.length > this.maxRevisionHistory) history.shift();
      const next = {
        ...current.record,
        ...revised,
        id,
        status: 'draft',
        revision_status: 'revision_succeeded',
        revision_at: this.clock().toISOString(),
        revision_request_id: requestId || current.record.revision_request_id,
        revision_history: history,
        feedback_count: feedbackCount,
      };
      delete next._transition;
      atomicWriteJson(current.path, next);
      this.logger?.info('scenario.revision.applied', { scenario_id: id, feedback_count: feedbackCount });
      return { record: next };
    });
  }

  async markRevisionFailed(id, { requestId, errorCode = 'REVISION_FAILED', message = 'LLM revision failed' } = {}) {
    return this.lock.withKey(id, async () => {
      const current = this.get(id);
      if (current.state !== 'draft') {
        throw conflict('INVALID_REVISION_TARGET', 'Revisions can only target the draft queue');
      }
      const next = {
        ...current.record,
        revision_status: 'revision_failed',
        revision_at: this.clock().toISOString(),
        revision_request_id: requestId || current.record.revision_request_id,
        revision_error: { code: errorCode, message },
      };
      delete next._transition;
      atomicWriteJson(current.path, next);
      this.logger?.warn('scenario.revision.failed', { scenario_id: id, code: errorCode });
      return { record: next };
    });
  }

  createRemix(sourceId, overrides = {}) {
    const source = this.get(sourceId);
    if (source.state !== 'published') {
      throw conflict('REMIX_REQUIRES_PUBLISHED', 'Remix is only allowed from published scenarios');
    }
    const newId = this.idGenerator().slice(0, 8);
    const now = this.clock().toISOString();
    const draft = {
      ...source.record,
      id: newId,
      status: 'draft',
      created_at: now,
      approved_at: undefined,
      rejected_at: undefined,
      rendered_at: undefined,
      published_at: undefined,
      published_url: undefined,
      render_revision: undefined,
      feedback: [],
      revision_history: [],
      revision_status: 'none',
      revision_of: source.record.id,
      remix_of: source.record.id,
      remix_created_at: now,
    };
    for (const field of ['image_style', 'style', 'tone', 'layout', 'aspect_ratio', 'seed', 'title']) {
      if (overrides[field] !== undefined) draft[field] = overrides[field];
    }
    delete draft._transition;
    atomicWriteJson(this.scenarioPath('draft', newId), draft, { overwrite: false });
    this.logger?.info('scenario.remix.created', { scenario_id: newId, source_id: source.record.id });
    return { record: draft, state: 'draft', path: this.scenarioPath('draft', newId) };
  }

  moveToLegacyStaging(id) {
    const candidate = this.get(id);
    if (candidate.state !== 'rendered' && candidate.state !== 'approved') {
      throw conflict('LEGACY_TARGET_INVALID', 'Only rendered or approved scenarios have legacy artifacts');
    }
    const stamp = this.clock().toISOString().replace(/[:.]/g, '-');
    const dest = safeResolve(this.legacyRoot, `${id}-${stamp}`);
    fs.mkdirSync(dest, { recursive: false });
    const candidates = [
      safeResolve(this.comicsRoot, `${id}.png`),
      safeResolve(this.comicsRoot, id),
      safeResolve(this.comicsRoot, 'raw', `${id}.png`),
    ];
    const moved = [];
    for (const [index, source] of candidates.entries()) {
      if (!fs.existsSync(source)) continue;
      const target = safeResolve(dest, `${index}-${path.basename(source)}`);
      fs.renameSync(source, target);
      moved.push(target);
    }
    const manifest = { id, archived_at: this.clock().toISOString(), artifacts: moved.map(target => path.relative(this.dataRoot, target)) };
    atomicWriteJson(safeResolve(dest, 'manifest.json'), manifest);
    this.logger?.info('scenario.legacy_staging', { scenario_id: id, artifacts: manifest.artifacts });
    return { manifest, dest };
  }

  cleanupLegacyStaging(retentionMs) {
    if (!fs.existsSync(this.legacyRoot)) return 0;
    const cutoff = this.clock().getTime() - retentionMs;
    let removed = 0;
    for (const entry of fs.readdirSync(this.legacyRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const target = safeResolve(this.legacyRoot, entry.name);
      const stat = fs.statSync(target);
      if (stat.mtimeMs < cutoff) {
        fs.rmSync(target, { recursive: true, force: true });
        removed += 1;
      }
    }
    return removed;
  }

  reconcileTransitions() {
    let recovered = 0;
    for (const state of STATES) {
      for (const file of fs.readdirSync(this.statusDir(state)).filter(name => name.endsWith('.json'))) {
        const id = file.slice(0, -5);
        try {
          const candidate = this._candidate(state, id);
          const needsRevoke = candidate.record.revision_status === 'revision_queued' && state !== 'draft';
          if (candidate.record._transition || candidate.record.status !== state || needsRevoke) {
            if (needsRevoke) {
              const next = {
                ...candidate.record,
                status: 'draft',
                revision_status: 'revision_idle',
              };
              delete next._transition;
              const destination = this.scenarioPath('draft', id);
              if (fs.existsSync(destination)) throw conflict('DESTINATION_EXISTS', 'Draft destination already exists during reconcile');
              atomicWriteJson(destination, next);
              fs.unlinkSync(candidate.path);
            } else {
              this.reconcileOne(candidate);
            }
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
