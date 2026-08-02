import { conflict, unavailable } from './errors.js';
import { parseJsonResult } from './process_runner.js';

export class JobManager {
  constructor({ config, jobStore, runner, logger } = {}) {
    this.config = config;
    this.jobStore = jobStore;
    this.runner = runner;
    this.logger = logger;
    this.promises = new Map();
    this.accepting = true;
  }

  enqueueRender({ scenarioId, mode, seed, requestId }) {
    if (!this.accepting) throw unavailable('SERVER_SHUTTING_DOWN', 'Server is shutting down');
    const active = this.jobStore.activeForScenario(scenarioId);
    if (active) throw conflict('RENDER_ALREADY_RUNNING', 'A render job is already active', { job_id: active.id });
    const job = this.jobStore.create({ type: 'render', scenarioId, mode, requestId, seed });
    const promise = this._runRender(job).finally(() => this.promises.delete(job.id));
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
