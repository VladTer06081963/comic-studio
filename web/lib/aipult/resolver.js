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

/**
 * Lightweight Levenshtein-based ratio for short strings. Returns 0-100.
 * Source pattern: rapidfuzzy.fuzz.partial_ratio (best-substring alignment).
 * For comic titles (≤ 60 chars) this approximation is sufficient.
 */
function partialRatio(needle, haystack) {
  if (!needle || !haystack) return 0;
  let n = needle.toLowerCase();
  let h = haystack.toLowerCase();
  if (h.includes(n)) return 100;
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
  const titleScore = partialRatio(phrase, String(scenario.title || ''));
  const context = String(scenario.context || '').slice(0, CONTEXT_PREVIEW_CHARS);
  const contextScore = context ? partialRatio(phrase, context) * CONTEXT_WEIGHT : 0;
  if (titleScore >= contextScore) return { score: titleScore, method: 'title_match' };
  return { score: contextScore, method: 'context_match' };
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
export function resolveScenario(phrase, { dataRoot, limit = DEFAULT_LIMIT, recencyStatus = 'rendered', scenarios } = {}) {
  if (typeof phrase !== 'string') throw new TypeError('phrase must be a string');
  const trimmed = phrase.trim();
  if (!trimmed) return [];

  const all = scenarios || loadAllScenarios(dataRoot);

  // 1. Explicit ID short-circuit
  if (ID_RE.test(trimmed)) {
    const found = all.find((s) => s.id === trimmed);
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
