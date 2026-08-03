// web/lib/aipult/heuristic.js
// Heuristic intent + style parser + card builder.
// Used as PRIMARY path for clear simple commands (e.g. "поменяй стиль у X на Y")
// to avoid the 30s Python LLM subprocess timeout. LLM is only called for
// ambiguous queries that heuristic can't handle.
//
// Trade-off: heuristic handles ~80% of common commands instantly; LLM is
// reserved for ~20% of complex/ambiguous queries (e.g. "увеличь шрифт в
// третьей панели и добавь драмы"). User experience is instant for the
// common case, slight latency for the long tail.

import { randomUUID } from 'crypto';

const uuidv4 = () => randomUUID().replace(/-/g, '');

// === Intent + style keyword maps =============================================

// Order matters: specific multi-word patterns FIRST, generic single-word
// patterns LAST. This prevents "покажи" from matching "view" before more
// specific intents like "покажи список" → list or "покажи статистику" → stats.
const INTENT_PATTERNS = [
  { intent: 'restyle',  patterns: ['поменяй стиль', 'смени стиль', 'новый стиль', 'change style', 'restyle', 'измени стиль', 'стиль на'] },
  { intent: 'render',   patterns: ['отрендери', 'рендер', 'render', 'нарисуй'] },
  { intent: 'revise',   patterns: ['измени', 'поправь', 'правка', 'revise', 'edit', 'отредактируй', 'перепиши'] },
  { intent: 'list',     patterns: ['покажи список', 'покажи все', 'list all', 'перечисли все', 'список всех', 'list', 'список'] },
  { intent: 'stats',    patterns: ['покажи статистику', 'покажи статистика', 'статистика', 'stats', 'сколько'] },
  { intent: 'approve',  patterns: ['утверди', 'одобри', 'approve'] },
  { intent: 'publish',  patterns: ['опубликуй', 'размести', 'publish'] },
  { intent: 'delete',   patterns: ['удали', 'сотри', 'delete', 'убери'] },
  { intent: 'view',     patterns: ['покажи', 'открой', 'посмотреть', 'view', 'show'] },
];

const STYLE_PATTERNS = {
  bubble: ['bubble', 'баббл', 'облачко'],
  star:   ['star', 'звезда'],
  gothic: ['gothic', 'готика', 'готический'],
  boom:   ['boom', 'бум', 'взрыв'],
  memo:   ['memo', 'заметка'],
  bar:    ['bar', 'полоса', 'панель'],
};

const INTENT_TIME_COST = {
  restyle:  ['2-5 сек',   '$0',      true],
  render:   ['1-2 мин',   '~$0.10',  false],
  revise:   ['3-5 сек',   '~$0.01',  true],
  view:     ['<1 сек',    '$0',      true],
  list:     ['<1 сек',    '$0',      true],
  approve:  ['<1 сек',    '$0',      false],
  publish:  ['5-10 сек',  '$0',      false],
  delete:   ['<1 сек',    '$0',      false],
  stats:    ['<1 сек',    '$0',      true],
};

const INTENT_VERB = {
  restyle: 'Сменить стиль',
  render:  'Отрендерить',
  revise:  'Отредактировать',
  view:    'Показать',
  list:    'Список',
  approve: 'Утвердить',
  publish: 'Опубликовать',
  delete:  'Удалить',
  stats:   'Статистика',
};

// === Public API =============================================================

/**
 * Heuristic parser: returns `{intent, style, scenario}` or `{intent: null}`
 * if message is ambiguous and needs LLM.
 */
export function parseHeuristic(message, candidates) {
  if (typeof message !== 'string') return { intent: null };
  const msgLower = message.toLowerCase();

  // Find intent
  let intent = null;
  for (const { intent: i, patterns } of INTENT_PATTERNS) {
    if (patterns.some((p) => msgLower.includes(p))) {
      intent = i;
      break;
    }
  }
  if (!intent) return { intent: null };

  // Find style
  let style = null;
  for (const [s, patterns] of Object.entries(STYLE_PATTERNS)) {
    if (patterns.some((p) => msgLower.includes(p))) {
      style = s;
      break;
    }
  }

  // Pick scenario: first candidate, or null if list/stats (no scenario needed)
  const scenario = (candidates && candidates.length > 0 && intent !== 'list' && intent !== 'stats')
    ? candidates[0]
    : null;

  // For restyle intent, require an EXPLICIT style keyword. Without one,
  // we'd default to "bubble" and silently overwrite the user's custom style
  // (UX trap — user said "поменяй стиль у X" expecting to keep current style).
  // Keep intent='restyle' so the route can detect the case, but set
  // needsStyle=true so it knows the style is missing.
  if (intent === 'restyle' && !style) {
    return { intent: 'restyle', style: null, scenario, needsStyle: true };
  }

  return { intent, style, scenario };
}

/**
 * Build a CommandCard from heuristic result. Pure function, no I/O.
 */
export function buildHeuristicCard({ intent, style, scenario, message }) {
  if (!intent) return null;

  const [estimatedTime, estimatedCost, reversible] = INTENT_TIME_COST[intent] || ['<1 сек', '$0', true];
  const verb = INTENT_VERB[intent] || intent;

  let command;
  if (intent === 'restyle' && scenario) {
    const s = style || 'bubble';
    command = `python3 scripts/restyle.py --scenario-id ${scenario.id} --style ${s}`;
  } else if (intent === 'render' && scenario) {
    command = `python3 scripts/render_approved.py --scenario-id ${scenario.id}`;
  } else if (intent === 'revise' && scenario) {
    const feedback = (message || '').replace(/"/g, '\\"');
    command = `python3 scripts/revise_scenario.py --scenario-id ${scenario.id} --feedback "${feedback}"`;
  } else if (intent === 'view' && scenario) {
    command = `GET /api/scenarios/${scenario.id}`;
  } else if (intent === 'list') {
    command = 'GET /api/scenarios?status=all';
  } else if (intent === 'approve' && scenario) {
    command = `POST /api/scenarios/${scenario.id}/approve`;
  } else if (intent === 'publish') {
    command = 'node scripts/publish_rendered.js';
  } else if (intent === 'delete' && scenario) {
    command = `DELETE /api/scenarios/${scenario.id}`;
  } else if (intent === 'stats') {
    command = 'GET /api/stats';
  } else {
    return null;
  }

  const explanation = scenario
    ? `${verb} «${scenario.title}»${style ? ` (${style})` : ''}`
    : `${verb}`;

  return {
    card_id: uuidv4(),
    intent,
    style,  // critical: include so runner uses correct style (not defaults to bubble)
    command,
    explanation,
    warnings: [],
    estimated_time: estimatedTime,
    estimated_cost: estimatedCost,
    reversible,
    resolved_scenario: scenario ? {
      id: scenario.id,
      title: scenario.title,
      status: scenario.status,
      confidence: scenario.confidence,
      resolution_method: scenario.resolution_method,
    } : null,
    related_artifacts: scenario ? [
      `data/comics/${scenario.id}.png`,
      `data/comics/${scenario.id}.html`,
    ] : [],
  };
}

/**
 * Convenience: try heuristic; return card or null.
 *
 * Default behavior for explicit IDs: if message is just an 8-char hex
 * (no intent keywords) and we have exactly 1 high-confidence candidate,
 * fall back to "view" intent — most likely the user wants to see it.
 *
 * Restyle without style: returns null. The route detects this via
 * `parsed.needsStyle` (set by parseHeuristic) and shows a hint.
 */
export function tryHeuristic(message, candidates) {
  const parsed = parseHeuristic(message, candidates);
  if (parsed.needsStyle) {
    // Restyle intent but no explicit style — don't build a card.
    return null;
  }
  if (!parsed.intent) {
    // No intent keyword found — default to view if explicit ID + 1 candidate
    const isExplicitId = typeof message === 'string' && /^[A-Za-z0-9_-]{4,64}$/.test(message.trim());
    if (isExplicitId && candidates && candidates.length === 1) {
      return buildHeuristicCard({
        intent: 'view',
        style: null,
        scenario: candidates[0],
        message,
      });
    }
    return null;
  }
  // Need scenario for non-list/stats intents
  if (parsed.intent !== 'list' && parsed.intent !== 'stats' && !parsed.scenario) return null;
  return buildHeuristicCard({ ...parsed, message });
}
