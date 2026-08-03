// web/lib/aipult/resolver.js
// Node-side fuzzy scenario resolver. Mirrors `py/lib/scenario_resolver.py`
// semantics so the chat endpoint can do a fast pre-filter without spawning
// Python. Pure JS, no external deps. Reads `data/scenarios/{state}/*.json`
// directly.

import fs from 'fs';
import path from 'path';
import { safeResolve, STATES } from '../validation.js';

const ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
const RECENCY_TOKENS = ['последний', 'последняя', 'последнее', 'последнего', 'latest', 'last'];
const TITLE_FLOOR = 60;
const CONTEXT_WEIGHT = 0.7;
const AMBIGUITY_GAP = 10;
const CONTEXT_PREVIEW_CHARS = 200;
const DEFAULT_LIMIT = 5;

// Stop words dropped for natural-language queries so
// "поменяй стиль у Роза и Яша на star" → tokens "роза яша star" → matches "Роза и Яша".
const STOP_WORDS = new Set([
  // Russian
  'у', 'на', 'и', 'в', 'с', 'по', 'для', 'это', 'что', 'как', 'а', 'но', 'или', 'же', 'бы', 'ли', 'не', 'ни', 'то',
  'он', 'она', 'они', 'мы', 'вы', 'я', 'ты', 'мне', 'тебе', 'ему', 'ей', 'нам', 'вам', 'их', 'его', 'ее',
  'из', 'от', 'до', 'за', 'над', 'под', 'при', 'без', 'через', 'между',
  'тот', 'этот', 'такой', 'какой', 'весь', 'все', 'всё', 'кто', 'где', 'когда', 'чтобы', 'потому', 'если', 'только', 'уже', 'ещё', 'еще', 'так',
  'там', 'тут', 'здесь', 'очень', 'просто', 'сейчас', 'можно',
  // English
  'the', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'for', 'by', 'with', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your', 'his', 'its', 'our', 'their',
  'this', 'that', 'these', 'those',
  // Common UI/intent verbs (don't help matching)
  'поменяй', 'сделай', 'измени', 'удали', 'добавь', 'убери', 'создай', 'покажи', 'найди', 'запусти', 'открой', 'закрой',
  'сделать', 'поменять', 'изменить', 'узнать', 'посмотреть', 'рендери', 'нарисуй',
  'стиль', 'стиле', 'стиля', 'комикс', 'комикса', 'комиксы', 'комиксе', 'цвет', 'цвета', 'картинку', 'картинки', 'файл', 'файла',
  'make', 'change', 'show', 'find', 'delete', 'create', 'render', 'open', 'style', 'color', 'image', 'file',
]);

function extractKeywords(phrase) {
  const tokens = String(phrase).toLowerCase().match(/[а-яёa-z0-9]+/g) || [];
  return tokens.filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

/**
 * Lightweight Levenshtein-based ratio for short strings. Returns 0-100.
 * Source pattern: rapidfuzzy.fuzz.partial_ratio (best-substring alignment).
 * For comic titles (≤ 60 chars) this approximation is sufficient.
 */
function partialRatio(needle, haystack) {
  if (!needle || !haystack) return 0;
  let n = needle.toLowerCase();
  let h = haystack.toLowerCase();
  // Substring match only for needles ≥3 chars (avoid "to"→"story", "a"→"a dog")
  if (n.length >= 3 && h.includes(n)) return 100;
  if (n.length > h.length) {
    const tmp = n; n = h; h = tmp; // ensure n is shorter
  }
  // Token set ratio approximation: word overlap / total unique words
  const nWords = new Set(n.split(/\s+/).filter(Boolean));
  const hWords = new Set(h.split(/\s+/).filter(Boolean));
  if (nWords.size === 0) return 0;
  let intersection = 0;
  for (const w of nWords) if (hWords.has(w)) intersection += 1;
  const union = new Set([...nWords, ...hWords]).size;
  return union === 0 ? 0 : Math.round((intersection / union) * 100);
}

function parseTs(value) {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

function loadAllScenarios(dataRoot) {
  const root = safeResolve(dataRoot, 'scenarios');
  const out = [];
  for (const state of STATES) {
    const dir = path.join(root, state);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json'));
    for (const file of files) {
      const full = path.join(dir, file);
      let rec;
      try {
        rec = JSON.parse(fs.readFileSync(full, 'utf8'));
      } catch (err) {
        continue; // skip malformed
      }
      if (!rec || typeof rec !== 'object' || !rec.id || !rec.title) continue;
      rec.status = rec.status || state;
      out.push(rec);
    }
  }
  return out;
}

function scoreCandidate(phrase, scenario) {
  // Best-of-tokens matching: пробует whole phrase, каждый keyword, каждую
  // bigram против title и context. Берёт MAX. Использует extractKeywords
  // чтобы drop stop words ("the", "и", "поменяй") — иначе они дают
  // ложные substring match в любой title.
  const title = String(scenario.title || '');
  const context = String(scenario.context || '').slice(0, CONTEXT_PREVIEW_CHARS);
  const titleScore = bestScore(phrase, title);
  const contextScore = context ? bestScore(phrase, context) * CONTEXT_WEIGHT : 0;
  if (titleScore >= contextScore) return { score: titleScore, method: 'title_match' };
  return { score: contextScore, method: 'context_match' };
}

function bestScore(needle, haystack) {
  if (!haystack || !needle) return 0;
  // Filter to keywords (drop stop words + 1-char tokens) to avoid false
  // substring matches like "the"→"The Mysterious Glitch" or "to"→"story".
  const tokens = extractKeywords(needle);
  let best = tokens.length > 0 ? partialRatio(needle, haystack) : 0;
  for (const tok of tokens) {
    const s = partialRatio(tok, haystack);
    if (s > best) best = s;
  }
  for (let i = 0; i < tokens.length - 1; i++) {
    const bigram = `${tokens[i]} ${tokens[i + 1]}`;
    const s = partialRatio(bigram, haystack);
    if (s > best) best = s;
  }
  return best;
}

function isRecencyPhrase(phrase) {
  const p = phrase.toLowerCase();
  return RECENCY_TOKENS.some((token) => p.includes(token));
}

/**
 * Resolve a scenario by phrase. Returns at most `limit` candidates sorted by
 * (confidence desc, created_at desc).
 *
 * @param {string} phrase - user phrase ("кот", "последний rendered", "8eaa57cc")
 * @param {object} options
 * @param {string} options.dataRoot - absolute path to data/ root
 * @param {number} [options.limit=5]
 * @param {string} [options.recencyStatus='rendered']
 * @param {Array}  [options.scenarios] - preloaded scenarios (for tests)
 * @returns {Array<{id, title, status, confidence, resolution_method, created_at, ambiguity?}>}
 */
export { extractKeywords, bestScore };

export function resolveScenario(phrase, { dataRoot, limit = DEFAULT_LIMIT, recencyStatus = 'rendered', scenarios } = {}) {
  if (typeof phrase !== 'string') throw new TypeError('phrase must be a string');
  const trimmed = phrase.trim();
  if (!trimmed) return [];

  const all = scenarios || loadAllScenarios(dataRoot);

  // 1. Explicit ID short-circuit (also matches when ID is embedded in phrase,
  //    e.g. "покажи сценарий 8eaa57cc" or "view 8eaa57cc please")
  const idMatch = trimmed.match(/\b[A-Za-z0-9_-]{4,64}\b/g);
  if (idMatch) {
    for (const candidate of idMatch) {
      if (ID_RE.test(candidate)) {
        const found = all.find((s) => s.id === candidate);
        if (found) {
          return [{
            id: found.id,
            title: found.title,
            status: found.status,
            confidence: 1.0,
            resolution_method: 'explicit_id',
            created_at: found.created_at || '',
          }];
        }
      }
    }
  }

  // 2. Fuzzy match
  const scored = [];
  for (const sc of all) {
    const { score, method } = scoreCandidate(trimmed, sc);
    if (score >= TITLE_FLOOR) {
      scored.push({ score, method, scenario: sc });
    }
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return parseTs(b.scenario.created_at) - parseTs(a.scenario.created_at);
  });
  const top = scored.slice(0, limit);

  // 3. Recency fallback
  if (top.length === 0 && isRecencyPhrase(trimmed)) {
    const matching = all.filter((s) => s.status === recencyStatus);
    const pool = matching.length > 0 ? matching : all.filter((s) => s.status === 'published');
    if (pool.length === 0) return [];
    pool.sort((a, b) => parseTs(b.created_at) - parseTs(a.created_at));
    const latest = pool[0];
    return [{
      id: latest.id,
      title: latest.title,
      status: latest.status,
      confidence: 0.5,
      resolution_method: 'recency',
      created_at: latest.created_at || '',
    }];
  }

  if (top.length === 0) return [];

  // 4. Build candidates + disambiguation
  const candidates = top.map(({ score, method, scenario }) => ({
    id: scenario.id,
    title: scenario.title,
    status: scenario.status,
    confidence: Math.round(score) / 100,
    resolution_method: method,
    created_at: scenario.created_at || '',
  }));

  if (candidates.length >= 2) {
    const a = candidates[0].confidence * 100;
    const b = candidates[1].confidence * 100;
    if (Math.abs(a - b) < AMBIGUITY_GAP) {
      candidates[0].ambiguity = true;
      candidates[1].ambiguity = true;
    }
  }

  return candidates;
}

/**
 * List recent scenarios (for "discovery" / list command).
 */
export function listRecent(status = 'rendered', { dataRoot, limit = 10 } = {}) {
  const all = loadAllScenarios(dataRoot);
  const matching = status === 'all' ? all : all.filter((s) => s.status === status);
  matching.sort((a, b) => parseTs(b.created_at) - parseTs(a.created_at));
  return matching.slice(0, Math.min(limit, 50)).map((s) => ({
    id: s.id,
    title: s.title,
    status: s.status,
    created_at: s.created_at || '',
  }));
}
