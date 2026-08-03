// web/lib/aipult/runner.js
// Whitelisted subprocess execution for AiPULT cards. Re-validates intent
// (defense-in-depth), enforces timeout, captures stdout/stderr, emits
// structured audit log. **AI never auto-executes** — execution only via
// explicit `POST /api/aipult/execute`.

import fs from 'fs';
import path from 'path';
import { AppError, badRequest } from '../errors.js';
import { ProcessRunner } from '../process_runner.js';
import {
  validateCard,
  validateCommandString,
  ALLOWED_INTENTS,
  sanitizeForLog,
  AipultValidationError,
} from './validator.js';

const PHASE1_EXECUTABLE_INTENTS = new Set(['restyle']); // render/publish deferred

function buildArgs(intent, scenarioId, extra) {
  if (intent === 'restyle') {
    const style = (extra && extra.style) || 'bubble';
    return ['scripts/restyle.py', '--scenario-id', scenarioId, '--style', style];
  }
  throw new AipultValidationError(
    'AIPULT_INTENT_NOT_EXECUTABLE',
    `Intent '${intent}' is not executable in Phase 1 (allowed: ${[...PHASE1_EXECUTABLE_INTENTS].join(', ')})`,
    { intent, allowed_executable: [...PHASE1_EXECUTABLE_INTENTS] },
  );
}

export class AipultRunner {
  /**
   * @param {object} options
   * @param {object} options.config    - Web config (config.pythonBin, config.dataRoot, etc.)
   * @param {object} options.logger    - logger with info/warn/error
   * @param {object} [options.processRunner] - injectable for tests
   */
  constructor({ config, logger, processRunner } = {}) {
    if (!config) throw new Error('AipultRunner requires config');
    if (!logger) throw new Error('AipultRunner requires logger');
    this.config = config;
    this.logger = logger;
    this.processRunner = processRunner || new ProcessRunner({ logger });
  }

  /**
   * Execute a CommandCard. Returns {exitCode, stdout, stderr, durationMs}.
   * Throws AipultValidationError on bad input, AppError on subprocess failure.
   */
  async execute(card, { requestId, timeoutMs } = {}) {
    const started = Date.now();
    validateCard(card);
    const { intent, command, scenario_id: scenarioId } = card;

    if (!PHASE1_EXECUTABLE_INTENTS.has(intent)) {
      throw new AipultValidationError(
        'AIPULT_INTENT_NOT_EXECUTABLE',
        `Intent '${intent}' is advisory-only in Phase 1`,
        { intent, allowed: [...PHASE1_EXECUTABLE_INTENTS] },
      );
    }
    if (!scenarioId || !/^[A-Za-z0-9_-]{4,64}$/.test(scenarioId)) {
      throw badRequest('INVALID_SCENARIO_ID', 'scenario_id is required for execution');
    }

    // Re-validate the command string (defense-in-depth)
    validateCommandString(command);

    const args = buildArgs(intent, scenarioId, { style: card.style });
    const effectiveTimeout = Number.isInteger(timeoutMs)
      ? timeoutMs
      : (this.config.aipultTimeoutMs || 30_000);

    let result;
    try {
      result = await this.processRunner.run(this.config.pythonBin, args, {
        cwd: this.config.projectRoot,
        timeoutMs: effectiveTimeout,
        outputLimit: this.config.aipultOutputLimit || 10 * 1024 * 1024,
        requestId,
        operation: 'aipult.execute',
      });
    } catch (err) {
      const durationMs = Date.now() - started;
      this._audit({
        level: 'WARN',
        event: 'execution.failed',
        requestId,
        card_id: card.card_id,
        intent,
        scenario_id: scenarioId,
        command_executed: sanitizeForLog(command),
        exit_code: err instanceof AppError ? err.details?.exit_code ?? -1 : -1,
        duration_ms: durationMs,
        error: err.code || 'PROCESS_FAILED',
      });
      throw err;
    }

    const durationMs = Date.now() - started;
    this._audit({
      level: 'INFO',
      event: 'execution.completed',
      requestId,
      card_id: card.card_id,
      intent,
      scenario_id: scenarioId,
      command_executed: sanitizeForLog(command),
      exit_code: result.code,
      duration_ms: durationMs,
      stdout_length: result.stdout?.length || 0,
      stderr_length: result.stderr?.length || 0,
    });

    return {
      exitCode: result.code,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      durationMs,
    };
  }

  _audit(entry) {
    try {
      const logDir = path.join(this.config.dataRoot, 'logs');
      fs.mkdirSync(logDir, { recursive: true });
      const date = new Date().toISOString().slice(0, 10);
      const line = JSON.stringify({
        ts: new Date().toISOString(),
        component: 'aipult.runner',
        ...entry,
      });
      fs.appendFileSync(path.join(logDir, `aipult-${date}.log`), `${line}\n`, 'utf8');
      if (entry.level === 'ERROR') this.logger.error('aipult.audit', entry);
      else if (entry.level === 'WARN') this.logger.warn('aipult.audit', entry);
      else this.logger.info('aipult.audit', entry);
    } catch (err) {
      // Never let audit-logging break execution
      this.logger.error('aipult.audit.write_failed', { error: err.message });
    }
  }
}

export { ALLOWED_INTENTS, sanitizeForLog };
