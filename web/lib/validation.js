import path from 'path';
import { badRequest } from './errors.js';

export const STATES = Object.freeze(['draft', 'approved', 'rejected', 'rendered', 'published']);
export const IMAGE_STYLES = Object.freeze(['cartoon', 'anime', 'comic', 'realistic', 'watercolor']);
export const CAPTION_STYLES = Object.freeze(['bubble', 'star', 'gothic', 'boom', 'memo', 'bar']);
export const RENDER_MODES = Object.freeze(['initial', 'rerender']);
const ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

export function scenarioId(value) {
  if (typeof value !== 'string' || !ID_RE.test(value)) throw badRequest('INVALID_SCENARIO_ID', 'Invalid scenario ID');
  return value;
}

export function status(value, { allowAll = false } = {}) {
  const allowed = allowAll ? [...STATES, 'all'] : STATES;
  if (typeof value !== 'string' || !allowed.includes(value)) throw badRequest('INVALID_STATUS', 'Invalid scenario status');
  return value;
}

export function boundedText(value, { field, max, code }) {
  if (typeof value !== 'string' || !value.trim()) throw badRequest(code, `${field} must be a non-empty string`);
  const clean = value.trim();
  if (clean.length > max) throw badRequest(code, `${field} exceeds ${max} characters`);
  return clean;
}

export function imageStyle(value = 'comic') {
  if (!IMAGE_STYLES.includes(value)) throw badRequest('INVALID_IMAGE_STYLE', 'Unsupported image style');
  return value;
}

export function captionStyle(value = 'bubble') {
  if (!CAPTION_STYLES.includes(value)) throw badRequest('INVALID_CAPTION_STYLE', 'Unsupported caption style');
  return value;
}

export function seed(value, { min = 0, max = 2_147_483_647 } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) throw badRequest('INVALID_SEED', `seed must be an integer ${min}..${max}`);
  return value;
}

export function renderMode(value = 'initial') {
  if (!RENDER_MODES.includes(value)) throw badRequest('INVALID_RENDER_MODE', 'render mode must be initial or rerender');
  return value;
}

export function safeResolve(root, ...segments) {
  const base = path.resolve(root);
  const resolved = path.resolve(base, ...segments);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    throw badRequest('INVALID_PATH', 'Resolved path escapes configured root');
  }
  return resolved;
}

export function classifyContent(content) {
  if (/^https?:\/\//i.test(content)) {
    return /(?:youtube\.com|youtu\.be)/i.test(content)
      ? { flag: '--youtube', value: content }
      : { flag: '--url', value: content };
  }
  return { flag: '--freeform', value: content };
}
