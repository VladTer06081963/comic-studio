// web/lib/aipult/validator.js
// Whitelist + regex validation for AiPULT cards. Pure functions, no I/O.
//
// BROWSER-SAFE: this file has no Node-specific imports. It can be served
// statically to the browser (e.g. via /web/lib/aipult/ route in app.js)
// and imported by both Node server code and browser-side UI code.

export const ALLOWED_INTENTS = Object.freeze([
  'restyle', 'render', 'revise', 'view', 'list',
  'approve', 'publish', 'delete', 'stats',
]);

export const FORBIDDEN_PATTERNS = Object.freeze([
  { name: 'rm-rf-root', re: /rm\s+-rf\s+\//i },
  { name: 'command-substitution', re: /\$\(.+\)/ },
  { name: 'pipe-to-shell', re: /\|\s*(?:sh|bash)\b/ },
  { name: 'secret-leak', re: /\b(?:api[_-]?key|token|secret)\s*[:=]\s*\S+/i },
  { name: 'dotenv-access', re: /\.env\b/ },
  { name: 'parent-traversal', re: /(?<![A-Za-z0-9_])\.\.(?:\/|\\)/ },
]);

// === ID regex (inlined — same as web/lib/validation.js#ID_RE) ================

const ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

function checkScenarioId(value) {
  if (typeof value !== 'string' || !ID_RE.test(value)) {
    const err = new Error(`Invalid scenario ID: ${value}`);
    err.code = 'INVALID_SCENARIO_ID';
    err.status = 400;
    throw err;
  }
  return value;
}

// === Custom errors (browser-safe) ============================================
//
// These are intentionally NOT extending `web/lib/errors.js#AppError` because
// that file imports `randomUUID` from 'crypto' (Node-only). Instead, we use
// a local class with the same shape (status, code, message, details).
//
// `web/lib/errors.js#errorMiddleware` recognizes errors with `code` + `status`
// via duck-typing, so these work seamlessly on both server and client.

export class AipultValidationError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'AipultValidationError';
    this.code = code;
    this.status = 400;
    this.details = details;
  }
}

export const AipultForbiddenIntent = (intent) =>
  new AipultValidationError('AIPULT_FORBIDDEN_INTENT', `Intent is not allowed: ${intent}`, { intent });

export const AipultForbiddenCommand = (patternName) =>
  new AipultValidationError('AIPULT_FORBIDDEN_COMMAND', `Command matches forbidden pattern: ${patternName}`, { pattern: patternName });

export const AipultInvalidScenarioId = (id) =>
  new AipultValidationError('INVALID_SCENARIO_ID', `Invalid scenario ID: ${id}`, { id });

// === Validators ==============================================================

export function validateIntent(intent) {
  if (!ALLOWED_INTENTS.includes(intent)) {
    throw AipultForbiddenIntent(String(intent));
  }
  return intent;
}

export function validateScenarioId(id) {
  try {
    return checkScenarioId(String(id));
  } catch (err) {
    if (err.code === 'INVALID_SCENARIO_ID') {
      throw AipultInvalidScenarioId(id);
    }
    throw err;
  }
}

export function validateCommandString(command) {
  if (typeof command !== 'string' || !command.trim()) {
    throw new AipultValidationError('AIPULT_INVALID_COMMAND', 'command must be a non-empty string');
  }
  if (command.length > 2000) {
    throw new AipultValidationError('AIPULT_COMMAND_TOO_LONG', 'command exceeds 2000 characters');
  }
  for (const { name, re } of FORBIDDEN_PATTERNS) {
    if (re.test(command)) {
      throw AipultForbiddenCommand(name);
    }
  }
  return command;
}

/**
 * Validate a full CommandCard object. Defense-in-depth: also called by
 * `runner.execute()` before subprocess spawn.
 */
export function validateCard(card) {
  if (!card || typeof card !== 'object') {
    throw new AipultValidationError('AIPULT_INVALID_CARD', 'card must be an object');
  }
  validateIntent(card.intent);
  if (typeof card.command !== 'string') {
    throw new AipultValidationError('AIPULT_INVALID_CARD', 'card.command must be a string');
  }
  validateCommandString(card.command);
  if (card.scenario_id !== undefined && card.scenario_id !== null) {
    validateScenarioId(card.scenario_id);
  }
  return card;
}

/**
 * Sanitize a command string for safe audit-log inclusion. Replaces secret-like
 * substrings with `<redacted>`. Used by runner.js before writing to
 * data/logs/aipult-*.log.
 */
export function sanitizeForLog(command) {
  if (typeof command !== 'string') return '';
  return command
    .replace(/(\b(?:api[_-]?key|token|secret)\s*[:=]\s*)\S+/gi, '$1<redacted>')
    .slice(0, 2000);
}
