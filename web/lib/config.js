import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PROJECT_ROOT = path.resolve(HERE, '..', '..');

function intValue(env, key, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = env[key];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    const err = new Error(`Invalid ${key}: expected integer ${min}..${max}`);
    err.code = 'INVALID_CONFIGURATION';
    throw err;
  }
  return value;
}

export function isLoopbackHost(host) {
  const normalized = String(host || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost';
}

function parseWebPublicUrl(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';
  // Только http(s) без путей/query/fragment — мы строим ссылки вручную
  let url;
  try { url = new URL(trimmed); } catch {
    const err = new Error('Invalid WEB_PUBLIC_URL: expected http(s) URL like https://studio.example.com');
    err.code = 'INVALID_CONFIGURATION';
    throw err;
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    const err = new Error('Invalid WEB_PUBLIC_URL: must use http or https scheme');
    err.code = 'INVALID_CONFIGURATION';
    throw err;
  }
  // trailing slash убираем — ссылки собираем как `${base}/comics/<id>.html`
  return url.origin;
}

function parseOrigins(raw) {
  if (!raw) return [];
  const values = raw.split(',').map(v => v.trim()).filter(Boolean);
  for (const value of values) {
    let url;
    try { url = new URL(value); } catch { url = null; }
    if (!url || !['http:', 'https:'].includes(url.protocol) || url.origin !== value) {
      const err = new Error('Invalid WEB_ALLOWED_ORIGINS: use comma-separated exact http(s) origins');
      err.code = 'INVALID_CONFIGURATION';
      throw err;
    }
  }
  return [...new Set(values)];
}

export function loadConfig(env = process.env, overrides = {}) {
  const projectRoot = path.resolve(overrides.projectRoot || env.PROJECT_ROOT || DEFAULT_PROJECT_ROOT);
  const host = String(overrides.host || env.HOST || '127.0.0.1').trim();
  const port = overrides.port ?? intValue(env, 'PORT', 3000, { min: 1, max: 65535 });
  const dataRoot = path.resolve(overrides.dataRoot || env.DATA_ROOT || path.join(projectRoot, 'data'));
  const pythonBin = path.resolve(overrides.pythonBin || env.PYTHON_BIN || path.join(projectRoot, '.venv', 'bin', 'python3'));
  const allowedOrigins = overrides.allowedOrigins || parseOrigins(env.WEB_ALLOWED_ORIGINS);
  const apiToken = overrides.apiToken ?? env.WEB_API_TOKEN ?? '';
  const remoteMode = !isLoopbackHost(host);

  if (remoteMode && (!apiToken || allowedOrigins.length === 0)) {
    const err = new Error('Remote mode requires WEB_API_TOKEN and WEB_ALLOWED_ORIGINS');
    err.code = 'INVALID_REMOTE_CONFIGURATION';
    throw err;
  }

  return Object.freeze({
    projectRoot,
    uiRoot: path.join(projectRoot, 'ui'),
    host,
    port,
    dataRoot,
    pythonBin,
    allowedOrigins: Object.freeze([...allowedOrigins]),
    apiToken,
    remoteMode,
    // Публичный URL Web UI (используется Telegram-ботом для HTML-ссылок в caption).
    // Default '' — backward-compat: Telegram показывает только PNG-фото, без ссылки.
    // Должен быть валидным http(s) URL с трейлинг-слешем, или пустой строкой.
    webPublicUrl: parseWebPublicUrl(overrides.webPublicUrl ?? env.WEB_PUBLIC_URL),
    bodyLimit: overrides.bodyLimit || env.WEB_BODY_LIMIT || '128kb',
    maxContentChars: overrides.maxContentChars ?? intValue(env, 'WEB_MAX_CONTENT_CHARS', 50_000, { min: 1, max: 1_000_000 }),
    maxFeedbackChars: overrides.maxFeedbackChars ?? intValue(env, 'WEB_MAX_FEEDBACK_CHARS', 5_000, { min: 1, max: 100_000 }),
    minSeed: 0,
    maxSeed: overrides.maxSeed ?? intValue(env, 'WEB_MAX_SEED', 2_147_483_647, { min: 1, max: Number.MAX_SAFE_INTEGER }),
    ingestTimeoutMs: overrides.ingestTimeoutMs ?? intValue(env, 'WEB_INGEST_TIMEOUT_MS', 180_000, { min: 100, max: 3_600_000 }),
    renderTimeoutMs: overrides.renderTimeoutMs ?? intValue(env, 'WEB_RENDER_TIMEOUT_MS', 600_000, { min: 100, max: 7_200_000 }),
    processOutputLimit: overrides.processOutputLimit ?? intValue(env, 'WEB_PROCESS_OUTPUT_LIMIT', 10 * 1024 * 1024, { min: 1024, max: 100 * 1024 * 1024 }),
    jobRetentionMs: overrides.jobRetentionMs ?? intValue(env, 'WEB_JOB_RETENTION_MS', 7 * 24 * 60 * 60 * 1000, { min: 1000 }),
    artifactRetentionMs: overrides.artifactRetentionMs ?? intValue(env, 'WEB_ARTIFACT_RETENTION_MS', 24 * 60 * 60 * 1000, { min: 1000 }),
    legacyRetentionMs: overrides.legacyRetentionMs ?? intValue(env, 'WEB_LEGACY_RETENTION_MS', 7 * 24 * 60 * 60 * 1000, { min: 1000 }),
    revisionTimeoutMs: overrides.revisionTimeoutMs ?? intValue(env, 'WEB_REVISION_TIMEOUT_MS', 180_000, { min: 100, max: 3_600_000 }),
    revisionOutputLimit: overrides.revisionOutputLimit ?? intValue(env, 'WEB_REVISION_OUTPUT_LIMIT', 10 * 1024 * 1024, { min: 1024, max: 100 * 1024 * 1024 }),
    maxRevisionFeedbackCount: overrides.maxRevisionFeedbackCount ?? intValue(env, 'WEB_MAX_REVISION_FEEDBACK_COUNT', 20, { min: 1, max: 200 }),
    maxRevisionHistory: overrides.maxRevisionHistory ?? intValue(env, 'WEB_MAX_REVISION_HISTORY', 10, { min: 1, max: 50 }),
    shutdownGraceMs: overrides.shutdownGraceMs ?? intValue(env, 'WEB_SHUTDOWN_GRACE_MS', 15_000, { min: 100, max: 300_000 }),
  });
}
