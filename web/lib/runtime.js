import fs from 'fs';
import path from 'path';
import { createLogger } from './logger.js';
import { ScenarioStore } from './scenario_store.js';
import { LifecycleService } from './lifecycle.js';
import { ProcessRunner } from './process_runner.js';
import { JobStore } from './job_store.js';
import { JobManager } from './job_manager.js';
import { safeResolve } from './validation.js';

export function createRuntime(config, overrides = {}) {
  const logger = overrides.logger || createLogger({ dataRoot: config.dataRoot, projectRoot: config.projectRoot });
  const store = overrides.store || new ScenarioStore({ dataRoot: config.dataRoot, logger });
  const lifecycle = overrides.lifecycle || new LifecycleService({ store, minSeed: config.minSeed, maxSeed: config.maxSeed });
  const runner = overrides.runner || new ProcessRunner({ logger });
  const jobStore = overrides.jobStore || new JobStore({ dataRoot: config.dataRoot, logger });
  const jobManager = overrides.jobManager || new JobManager({ config, jobStore, runner, logger });
  let stopping = false;

  function cleanupArtifacts() {
    const cutoff = Date.now() - config.artifactRetentionMs;
    for (const name of ['.staging']) {
      const root = safeResolve(config.dataRoot, name);
      fs.mkdirSync(root, { recursive: true });
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const target = safeResolve(root, entry.name);
        try {
          if (fs.statSync(target).mtimeMs < cutoff) fs.rmSync(target, { recursive: true, force: true });
        } catch {}
      }
    }
    return jobStore.cleanup(config.jobRetentionMs);
  }

  const recoveredTransitions = store.reconcileTransitions();
  const recoveredTrash = store.recoverTrash();
  const interruptedJobs = jobStore.markInterrupted();
  const removedJobs = cleanupArtifacts();
  logger.info('web.runtime.initialized', { recovered_transitions: recoveredTransitions, recovered_trash: recoveredTrash, interrupted_jobs: interruptedJobs, removed_jobs: removedJobs });

  return {
    config, logger, store, lifecycle, runner, jobStore, jobManager,
    isShuttingDown: () => stopping,
    cleanupArtifacts,
    async shutdown() {
      stopping = true;
      await jobManager.shutdown(config.shutdownGraceMs);
    },
  };
}
