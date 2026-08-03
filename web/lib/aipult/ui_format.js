// web/lib/aipult/ui_format.js
// Pure formatting helpers for AiPULT UI. NO DOM, NO I/O, NO side effects.
// Importable from both Node (tests) and browser (via <script type="module">).

// === Intent & status maps ====================================================

export const INTENT_LABELS = Object.freeze({
  restyle:  { icon: '🎨', label: 'Restyle', verb: 'Сменить стиль' },
  render:   { icon: '🖼',  label: 'Render',  verb: 'Отрендерить' },
  revise:   { icon: '✏️', label: 'Revise',  verb: 'Отредактировать' },
  view:     { icon: '👁',  label: 'View',    verb: 'Показать' },
  list:     { icon: '📋', label: 'List',    verb: 'Список' },
  approve:  { icon: '✅', label: 'Approve', verb: 'Утвердить' },
  publish:  { icon: '📤', label: 'Publish', verb: 'Опубликовать' },
  delete:   { icon: '🗑', label: 'Delete',  verb: 'Удалить' },
  stats:    { icon: '📊', label: 'Stats',   verb: 'Статистика' },
});

export const STATUS_LABELS = Object.freeze({
  draft:     { icon: '📝', label: 'Draft',     color: '#8a8a92' },
  approved:  { icon: '✅', label: 'Approved',  color: '#5b9dd9' },
  rejected:  { icon: '❌', label: 'Rejected',  color: '#ef476f' },
  rendered:  { icon: '🎬', label: 'Rendered',  color: '#ff6b35' },
  published: { icon: '🌐', label: 'Published', color: '#06d6a0' },
});

// === Sanitization ============================================================

const HTML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escape user/LLM-supplied strings before innerHTML assignment.
 * CRITICAL: every dynamic string rendered via innerHTML MUST go through this.
 */
export function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text).replace(/[&<>"']/g, (ch) => HTML_ESCAPE[ch]);
}

/**
 * Truncate text to max characters, appending '…' if truncated.
 * `max=0` returns empty string. `max<0` returns text unchanged.
 */
export function truncate(text, max) {
  if (text === null || text === undefined) return '';
  const s = String(text);
  if (max < 0) return s;
  if (max === 0) return '';
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

// === Formatters ==============================================================

export function formatIntent(intent) {
  const entry = INTENT_LABELS[intent];
  if (!entry) return { icon: '❓', label: String(intent || 'Unknown'), verb: 'Выполнить' };
  return entry;
}

export function formatStatus(status) {
  const entry = STATUS_LABELS[status];
  if (!entry) return { icon: '❔', label: String(status || 'Unknown'), color: '#8a8a92' };
  return entry;
}

export function formatCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return { idLine: '', title: '', status: '', confidencePct: 0, method: '', ambiguity: false };
  }
  const conf = typeof candidate.confidence === 'number'
    ? Math.round(candidate.confidence * 100)
    : 0;
  const status = formatStatus(candidate.status);
  return {
    idLine: `ID: ${candidate.id || ''}`,
    title: candidate.title || '',
    status: `${status.icon} ${status.label}`,
    confidencePct: conf,
    method: candidate.resolution_method || '',
    ambiguity: Boolean(candidate.ambiguity),
  };
}

/**
 * Format a CommandCard for display. Returns a plain object with all
 * pre-computed fields ready for the UI to render (no HTML, no DOM).
 */
export function formatCard(card) {
  if (!card || typeof card !== 'object') {
    return {
      title: '', subtitle: '', intentLabel: '', intentIcon: '',
      command: '', time: '', cost: '', reversible: false,
      warnings: [], artifacts: [], scenarioLine: '', commandLines: [],
    };
  }
  const intent = formatIntent(card.intent);
  const scenario = card.resolved_scenario || null;
  const status = scenario ? formatStatus(scenario.status) : null;
  const title = scenario?.title || intent.label;
  const subtitle = scenario
    ? `${intent.icon} ${intent.label}${status ? ` · ${status.icon} ${status.label}` : ''}`
    : `${intent.icon} ${intent.label}`;
  const scenarioLine = scenario
    ? `ID: ${scenario.id}${status ? ` · ${status.icon} ${status.label}` : ''}`
    : '';
  const command = String(card.command || '');
  return {
    title,
    subtitle,
    intentLabel: intent.label,
    intentIcon: intent.icon,
    command,
    time: String(card.estimated_time || ''),
    cost: String(card.estimated_cost || ''),
    reversible: Boolean(card.reversible),
    warnings: Array.isArray(card.warnings) ? card.warnings.map(String) : [],
    artifacts: Array.isArray(card.related_artifacts) ? card.related_artifacts.map(String) : [],
    scenarioLine,
    commandLines: command.split(/\s+/).filter(Boolean),
  };
}

// === Time / size / duration ===================================================

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export function formatDuration(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1000) return `${Math.round(n)} мс`;
  const sec = n / 1000;
  if (sec < 60) return `${sec.toFixed(sec < 10 ? 1 : 0)} сек`;
  const min = sec / 60;
  if (min < 60) return `${min.toFixed(min < 10 ? 1 : 0)} мин`;
  const hr = min / 60;
  return `${hr.toFixed(hr < 10 ? 1 : 0)} ч`;
}

export function formatBytes(n) {
  const value = Number(n);
  if (!Number.isFinite(value) || value < 0) return '0 B';
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * Format ISO timestamp as relative time in Russian.
 *   <60s → 'только что'
 *   <60min → 'X мин назад'
 *   <24h → 'X ч назад'
 *   <30d → 'X дн назад'
 *   otherwise → 'DD MMM, HH:MM' (e.g. '15 янв, 14:30')
 */
const RU_MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function formatTimestamp(iso, now = Date.now()) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diff = now - t;
  if (diff < 60 * 1000) return 'только что';
  if (diff < MS_PER_HOUR) return `${Math.floor(diff / MS_PER_MINUTE)} мин назад`;
  if (diff < MS_PER_DAY) return `${Math.floor(diff / MS_PER_HOUR)} ч назад`;
  if (diff < 30 * MS_PER_DAY) return `${Math.floor(diff / MS_PER_DAY)} дн назад`;
  const d = new Date(t);
  return `${d.getUTCDate()} ${RU_MONTHS[d.getUTCMonth()]}, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

// === All exports (also for tree-shaking) =====================================

export const FORMATS = Object.freeze({
  INTENT_LABELS,
  STATUS_LABELS,
});
