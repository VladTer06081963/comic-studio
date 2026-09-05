import { conflict, unavailable } from './errors.js';
import { parseJsonResult } from './process_runner.js';

function getRevisionScript() {
  return process.env.REVISION_SCRIPT || 'scripts/revise_scenario.py';
}

export class JobManager {
  constructor({ config, jobStore, runner, logger, onRevisionComplete } = {}) {
    this.config = config;
    this.jobStore = jobStore;
    this.runner = runner;
    this.logger = logger;
    this.onRevisionComplete = onRevisionComplete;
    this.promises = new Map();
    this.accepting = true;
  }

  enqueueRender({ scenarioId, mode, seed, requestId, imageProvider, textProvider }) {
    if (!this.accepting) throw unavailable('SERVER_SHUTTING_DOWN', 'Server is shutting down');
    const active = this.jobStore.activeForScenario(scenarioId);
    if (active) throw conflict('BUSY', 'Another job is already active for this scenario', { job_id: active.id, type: active.type });
    const job = this.jobStore.create({
      type: 'render',
      scenarioId,
      mode,
      requestId,
      seed,
      image_provider: imageProvider || null,
      text_provider: textProvider || null,
    });
    const promise = this._runRender(job).finally(() => this.promises.delete(job.id));
    this.promises.set(job.id, promise);
    return job;
  }

  enqueueRevision({ scenarioId, scenarioPath, feedback, sourceContext, sourceContextPreview, requestId, revisionKind = 'standard' }) {
    if (!this.accepting) throw unavailable('SERVER_SHUTTING_DOWN', 'Server is shutting down');
    const active = this.jobStore.activeForScenario(scenarioId);
    if (active) throw conflict('BUSY', 'Another job is already active for this scenario', { job_id: active.id, type: active.type });
    const job = this.jobStore.create({
      type: 'revision',
      scenarioId,
      mode: 'initial',
      requestId,
      revisionKind,
      sourceContextPreview,
      feedbackCount: Array.isArray(feedback) ? feedback.length : 0,
    });
    const promise = this._runRevision(job, { scenarioPath, feedback, sourceContext, revisionKind })
      .finally(() => this.promises.delete(job.id));
    this.promises.set(job.id, promise);
    return job;
  }

  async _runRender(job) {
    this.jobStore.update(job.id, { status: 'running', started_at: new Date().toISOString() });
    const args = ['scripts/render_approved.py', '--scenario-id', job.scenario_id, '--json-result'];
    if (job.mode === 'rerender') {
      args.push('--rerender', '--staging-dir', `${this.config.dataRoot}/.staging/${job.id}`);
      if (job.seed !== undefined) args.push('--seed', String(job.seed));
    }
    // Local Uncensored Stack (audit 027): пробросить provider override в render_approved.py
    if (job.image_provider) args.push('--image-provider', job.image_provider);
    if (job.text_provider) args.push('--text-provider', job.text_provider);
    try {
      const processResult = await this.runner.run(this.config.pythonBin, args, {
        cwd: this.config.projectRoot,
        timeoutMs: this.config.renderTimeoutMs,
        outputLimit: this.config.processOutputLimit,
        requestId: job.request_id,
        operation: `render:${job.scenario_id}`,
      });
      const result = parseJsonResult(processResult.stdout);
      if (!result.ok) throw new Error(result.error || 'Renderer reported failure');
      this.jobStore.update(job.id, {
        status: 'succeeded',
        finished_at: new Date().toISOString(),
        result: { scenario_id: job.scenario_id, comic_path: result.comic_path, render_revision: result.render_revision },
      });
      this.logger?.info('job.render.succeeded', { request_id: job.request_id, scenario_id: job.scenario_id, job_id: job.id });
    } catch (error) {
      const current = this.jobStore.get(job.id);
      if (current.status === 'interrupted') return;
      this.jobStore.update(job.id, {
        status: error.code === 'PROCESS_INTERRUPTED' ? 'interrupted' : 'failed',
        finished_at: new Date().toISOString(),
        error: { code: error.code || 'RENDER_FAILED', message: error.message || 'Render failed' },
      });
      this.logger?.error('job.render.failed', { request_id: job.request_id, scenario_id: job.scenario_id, job_id: job.id, code: error.code || 'RENDER_FAILED' });
    }
  }

  async _runRevision(job, { scenarioPath, feedback, sourceContext, revisionKind }) {
    this.jobStore.update(job.id, { status: 'running', started_at: new Date().toISOString() });
    const args = [
      getRevisionScript(),
      '--scenario-id', job.scenario_id,
      '--scenario-path', scenarioPath,
      '--json-result',
    ];
    if (Array.isArray(feedback) && feedback.length) {
      args.push('--feedback', JSON.stringify(feedback));
    }
    if (sourceContext) args.push('--source-context', sourceContext);
    try {
      const processResult = await this.runner.run(this.config.pythonBin, args, {
        cwd: this.config.projectRoot,
        timeoutMs: this.config.revisionTimeoutMs,
        outputLimit: this.config.revisionOutputLimit,
        requestId: job.request_id,
        operation: `revision:${job.scenario_id}`,
      });
      const parsed = parseJsonResult(processResult.stdout);
      if (!parsed.ok) throw new Error(parsed.error || 'Revision process reported failure');
      this.jobStore.update(job.id, {
        status: 'succeeded',
        finished_at: new Date().toISOString(),
        result: { scenario_id: job.scenario_id, revision_at: parsed.revision_at, feedback_count: parsed.feedback_count },
      });
      this.logger?.info('job.revision.succeeded', { request_id: job.request_id, scenario_id: job.scenario_id, job_id: job.id, revision_kind: revisionKind });
      if (typeof this.onRevisionComplete === 'function') {
        await this.onRevisionComplete({ job, parsed, success: true });
      }
    } catch (error) {
      const current = this.jobStore.get(job.id);
      if (current.status === 'interrupted') {
        if (typeof this.onRevisionComplete === 'function') {
          await this.onRevisionComplete({ job, error, success: false, interrupted: true });
        }
        return;
      }
      this.jobStore.update(job.id, {
        status: error.code === 'PROCESS_INTERRUPTED' ? 'interrupted' : 'failed',
        finished_at: new Date().toISOString(),
        error: { code: error.code || 'REVISION_FAILED', message: error.message || 'Revision failed' },
      });
      this.logger?.error('job.revision.failed', { request_id: job.request_id, scenario_id: job.scenario_id, job_id: job.id, code: error.code || 'REVISION_FAILED' });
      if (typeof this.onRevisionComplete === 'function') {
        await this.onRevisionComplete({ job, error, success: false });
      }
    }
  }

  stopAccepting() {
    this.accepting = false;
  }

  async shutdown(graceMs) {
    this.stopAccepting();
    const active = [...this.promises.values()];
    if (!active.length) return;
    let timer;
    await Promise.race([
      Promise.allSettled(active),
      new Promise(resolve => { timer = setTimeout(resolve, graceMs); }),
    ]);
    if (timer) clearTimeout(timer);
    if (this.promises.size) {
      this.runner.shutdown();
      for (const id of this.promises.keys()) {
        try {
          this.jobStore.update(id, {
            status: 'interrupted',
            finished_at: new Date().toISOString(),
            error: { code: 'PROCESS_INTERRUPTED', message: 'Server shut down during job' },
          });
        } catch {}
      }
    }
  }
}
