import fs from 'fs';
import path from 'path';

const SENSITIVE_KEYS = /token|authorization|secret|api[_-]?key|content|context/i;

function sanitize(value, { dataRoot, projectRoot }, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    let out = value;
    for (const root of [dataRoot, projectRoot].filter(Boolean)) out = out.split(root).join('<local-path>');
    if (/bearer\s+/i.test(out)) out = out.replace(/bearer\s+\S+/ig, 'Bearer <redacted>');
    return out.length > 1000 ? `${out.slice(0, 1000)}…` : out;
  }
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '<circular>';
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => sanitize(item, { dataRoot, projectRoot }, seen));
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_KEYS.test(key) ? '<redacted>' : sanitize(item, { dataRoot, projectRoot }, seen);
  }
  return result;
}

export function createLogger({ dataRoot, projectRoot, clock = () => new Date(), stdout = console } = {}) {
  const logDir = path.join(dataRoot, 'logs');
  fs.mkdirSync(logDir, { recursive: true });

  function emit(level, component, fields = {}) {
    const now = clock();
    const entry = {
      ts: now.toISOString(),
      level,
      component,
      ...sanitize(fields, { dataRoot, projectRoot }),
    };
    const line = JSON.stringify(entry);
    const sink = level === 'error' ? (stdout.error || stdout.log) : (stdout.log || (() => {}));
    sink.call(stdout, line);
    fs.appendFileSync(path.join(logDir, `${entry.ts.slice(0, 10)}.log`), `${line}\n`, 'utf8');
    return entry;
  }

  return {
    info: (component, fields) => emit('INFO', component, fields),
    warn: (component, fields) => emit('WARN', component, fields),
    error: (component, fields) => emit('ERROR', component, fields),
  };
}

export function requestLoggingMiddleware(logger, clock = () => new Date()) {
  return (req, res, next) => {
    const started = clock().getTime();
    res.on('finish', () => {
      const scenarioMatch = req.originalUrl?.match(/\/api\/scenarios\/([A-Za-z0-9_-]{4,64})(?:\/|\?|$)/);
      logger.info('web.request', {
        request_id: req.id,
        scenario_id: req.params?.id || scenarioMatch?.[1],
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: Math.max(0, clock().getTime() - started),
      });
    });
    next();
  };
}
