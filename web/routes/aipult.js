// web/routes/aipult.js
// Express router for AiPULT chat endpoints.
//   POST /api/aipult/resolve   → {candidates: [...]}
//   POST /api/aipult/chat      → {card: CommandCard} | {error, candidates}
//   POST /api/aipult/execute   → {ok, exit_code, stdout, stderr, duration_ms}
//   GET  /api/aipult/list      → {items: [...]}

import express from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { asyncRoute, badRequest, AppError } from '../lib/errors.js';
import * as validate from '../lib/validation.js';
import { resolveScenario, listRecent } from '../lib/aipult/resolver.js';
import { validateCard, validateCommandString, validateScenarioId } from '../lib/aipult/validator.js';

const execFileAsync = promisify(execFile);

const MAX_HISTORY = 20;
const MAX_PHRASE_CHARS = 500;
const MAX_MESSAGE_CHARS = 1000;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function callPythonRouteCommand({ message, candidates, history, config }) {
  // Spawn python helper that calls route_command() and emits JSON to stdout.
  // This keeps COMMAND_COOKBOOK single-source in Python.
  const args = [
    '-c',
    [
      'import json, sys',
      'from py.lib.aipult_client import route_command, AipultRouterError',
      'payload = json.load(sys.stdin)',
      'try:',
      '    card = route_command(payload["message"], payload["candidates"], payload.get("history"))',
      '    print(json.dumps({"ok": True, "card": card}, ensure_ascii=False))',
      'except AipultRouterError as e:',
      '    print(json.dumps({"ok": False, "error_code": type(e).__name__, "error": str(e)}, ensure_ascii=False))',
      'except Exception as e:',
      '    print(json.dumps({"ok": False, "error_code": "UNEXPECTED", "error": str(e)}, ensure_ascii=False))',
    ].join('\n'),
  ];
  const stdin = JSON.stringify({ message, candidates, history });
  const { stdout, stderr } = await execFileAsync(config.pythonBin, args, {
    cwd: config.projectRoot,
    timeout: config.aipultTimeoutMs || 30_000,
    maxBuffer: config.aipultOutputLimit || 10 * 1024 * 1024,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (stderr) process.stderr.write(`[aipult python stderr] ${stderr}\n`);
  const lines = String(stdout || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1];
  return JSON.parse(last);
}

export function aipultRouter({ config, store, logger, aipultRunner }) {
  const router = express.Router();

  // ── POST /api/aipult/resolve ────────────────────────────────────────────────
  router.post('/resolve', (req, res) => {
    const body = req.body || {};
    const phrase = validate.boundedText(body.phrase, {
      field: 'phrase', max: MAX_PHRASE_CHARS, code: 'INVALID_PHRASE',
    });
    const candidates = resolveScenario(phrase, { dataRoot: config.dataRoot });
    res.json({ candidates, request_id: req.id });
  });

  // ── GET /api/aipult/list ────────────────────────────────────────────────────
  router.get('/list', (req, res) => {
    const statusRaw = String(req.query.status || 'all');
    const status = statusRaw === 'all' ? 'all' : validate.status(statusRaw, { allowAll: true });
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
    const items = listRecent(status, { dataRoot: config.dataRoot, limit });
    res.json({ items, request_id: req.id });
  });

  // ── POST /api/aipult/chat ───────────────────────────────────────────────────
  router.post('/chat', asyncRoute(async (req, res) => {
    const body = req.body || {};
    if (!isPlainObject(body)) throw badRequest('INVALID_BODY', 'body must be a JSON object');

    const message = validate.boundedText(body.message, {
      field: 'message', max: MAX_MESSAGE_CHARS, code: 'INVALID_MESSAGE',
    });
    const history = Array.isArray(body.history) ? body.history : [];
    if (history.length > MAX_HISTORY) {
      throw badRequest('INVALID_HISTORY', `history exceeds ${MAX_HISTORY} entries`);
    }
    for (const entry of history) {
      if (!isPlainObject(entry) || typeof entry.role !== 'string' || typeof entry.content !== 'string') {
        throw badRequest('INVALID_HISTORY', 'history entries must be {role, content}');
      }
    }

    // Step 1: resolve candidates
    const candidates = resolveScenario(message, { dataRoot: config.dataRoot });

    if (candidates.length === 0) {
      logger.info('aipult.chat.no_candidates', { request_id: req.id, message_preview: message.slice(0, 100) });
      return res.json({
        card: null,
        candidates: [],
        message: 'No matching scenarios found. Use /api/aipult/list to browse.',
        request_id: req.id,
      });
    }

    if (candidates.length >= 2 && candidates[0].ambiguity) {
      logger.info('aipult.chat.disambiguation', { request_id: req.id, candidate_count: candidates.length });
      return res.json({
        card: null,
        candidates,
        disambiguation: true,
        message: 'Multiple matching scenarios. Pick one.',
        request_id: req.id,
      });
    }

    // Step 2: ask LLM
    try {
      const result = await callPythonRouteCommand({
        message, candidates, history, config,
      });

      if (!result.ok) {
        logger.warn('aipult.chat.router_error', {
          request_id: req.id, error_code: result.error_code, error: result.error,
        });
        if (result.error_code === 'AipultLlmUnavailable') {
          throw new AppError(503, 'LLM_UNAVAILABLE', result.error || 'LLM unavailable');
        }
        if (result.error_code === 'AipultInvalidResponse') {
          throw new AppError(502, 'AIPULT_INVALID_LLM_RESPONSE', result.error);
        }
        if (result.error_code === 'AipultForbiddenIntent') {
          throw new AppError(502, 'AIPULT_FORBIDDEN_INTENT', result.error);
        }
        if (result.error_code === 'AipultScenarioNotFound') {
          throw new AppError(502, 'AIPULT_SCENARIO_NOT_FOUND', result.error);
        }
        throw new AppError(502, 'AIPULT_ROUTER_ERROR', result.error || 'Unknown router error');
      }

      // Defense-in-depth: re-validate card server-side
      try {
        validateCard(result.card);
      } catch (err) {
        logger.warn('aipult.chat.card_rejected', {
          request_id: req.id, error_code: err.code, error: err.message,
        });
        throw err;
      }

      logger.info('aipult.chat.succeeded', {
        request_id: req.id, card_id: result.card.card_id, intent: result.card.intent,
      });

      res.json({ card: result.card, request_id: req.id });
    } catch (err) {
      if (err.code === 'AIPULT_TIMEOUT' || (err.signal === 'SIGTERM' && err.killed)) {
        throw new AppError(504, 'AIPULT_TIMEOUT', 'Python router exceeded timeout');
      }
      throw err;
    }
  }));

  // ── POST /api/aipult/execute ────────────────────────────────────────────────
  router.post('/execute', asyncRoute(async (req, res) => {
    const body = req.body || {};
    if (!isPlainObject(body)) throw badRequest('INVALID_BODY', 'body must be a JSON object');
    const cardId = validate.boundedText(body.card_id, { field: 'card_id', max: 128, code: 'INVALID_CARD_ID' });

    if (typeof body.command === 'string' && body.command.length > 0) {
      validateCommandString(body.command); // re-validate client-supplied command
    }

    // Phase 1: build a minimal card from body (we don't persist cards yet)
    if (body.scenario_id !== undefined) {
      validateScenarioId(body.scenario_id);
    }
    if (body.intent !== undefined) {
      // Will be re-validated by AipultRunner.execute
    }

    const card = {
      card_id: cardId,
      intent: body.intent || 'restyle',
      command: body.command || '',
      scenario_id: body.scenario_id,
      style: body.style,
    };

    const result = await aipultRunner.execute(card, { requestId: req.id });
    res.json({
      ok: true,
      exit_code: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      duration_ms: result.durationMs,
      card_id: cardId,
      request_id: req.id,
    });
  }));

  return router;
}
