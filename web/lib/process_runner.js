import fs from 'fs';
import { execFile } from 'child_process';
import { AppError, unavailable } from './errors.js';

export class ProcessRunner {
  constructor({ logger } = {}) {
    this.logger = logger;
    this.children = new Set();
  }

  isExecutable(executable) {
    try {
      fs.accessSync(executable, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  async run(executable, args, { cwd, timeoutMs, outputLimit, requestId, operation } = {}) {
    if (!this.isExecutable(executable)) throw unavailable('PYTHON_UNAVAILABLE', 'Configured executable is unavailable');
    return new Promise((resolve, reject) => {
      const child = execFile(executable, args, {
        cwd,
        timeout: timeoutMs,
        maxBuffer: outputLimit,
        encoding: 'utf8',
        shell: false,
        windowsHide: true,
      }, (error, stdout = '', stderr = '') => {
        this.children.delete(child);
        if (error) {
          const timedOut = Boolean(error.killed) || error.signal === 'SIGTERM';
          const appError = new AppError(
            timedOut ? 504 : 502,
            timedOut ? 'PROCESS_TIMEOUT' : 'PROCESS_FAILED',
            timedOut ? 'Process exceeded configured timeout' : 'Process exited unsuccessfully',
            { exit_code: Number.isInteger(error.code) ? error.code : null, signal: error.signal || null },
          );
          this.logger?.error('process.failed', {
            request_id: requestId,
            operation,
            code: appError.code,
            exit_code: appError.details.exit_code,
            signal: appError.details.signal,
            stderr_length: stderr.length,
          });
          reject(appError);
          return;
        }
        this.logger?.info('process.succeeded', {
          request_id: requestId,
          operation,
          stdout_length: stdout.length,
          stderr_length: stderr.length,
        });
        resolve({ code: 0, stdout, stderr });
      });
      this.children.add(child);
    });
  }

  shutdown(signal = 'SIGTERM') {
    for (const child of this.children) {
      try { child.kill(signal); } catch {}
    }
  }
}

export function parseJsonResult(stdout) {
  const lines = String(stdout || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).reverse();
  for (const line of lines) {
    try {
      const value = JSON.parse(line);
      if (value && typeof value === 'object') return value;
    } catch {}
  }
  throw new AppError(502, 'INVALID_PROCESS_RESULT', 'Process did not return a machine-readable result');
}
