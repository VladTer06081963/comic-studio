import express from 'express';
import { asyncRoute, conflict } from '../lib/errors.js';
import * as validate from '../lib/validation.js';
import { parseJsonResult } from '../lib/process_runner.js';
import { serializeScenario } from '../lib/scenario_store.js';
import { serializeJob } from '../lib/job_store.js';

export function scenariosRouter({ config, store, lifecycle, runner, jobManager }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const selected = validate.status(String(req.query.status || 'all'), { allowAll: true });
    const { items, invalidCount } = store.list(selected);
    res.json({ items: items.map(item => serializeScenario(item)), invalid_count: invalidCount, request_id: req.id });
  });

  router.post('/', asyncRoute(async (req, res) => {
    const body = req.body || {};
    const content = validate.boundedText(body.content, { field: 'content', max: config.maxContentChars, code: 'INVALID_CONTENT' });
    const imageStyle = validate.imageStyle(body.image_style || 'comic');
    const captionStyle = validate.captionStyle(body.caption_style || 'bubble');
    const source = validate.classifyContent(content);
    const args = [
      'scripts/ingest_and_draft.py', '--skip-notify', '--json-result',
      '--image-style', imageStyle, '--style', captionStyle,
      source.flag, source.value,
    ];
    const processResult = await runner.run(config.pythonBin, args, {
      cwd: config.projectRoot,
      timeoutMs: config.ingestTimeoutMs,
      outputLimit: config.processOutputLimit,
      requestId: req.id,
      operation: 'scenario.create',
    });
    const result = parseJsonResult(processResult.stdout);
    if (!result.ok || !result.id) throw new Error('Draft process returned an unsuccessful result');
    const id = validate.scenarioId(result.id);
    const candidate = store.get(id);
    if (candidate.state !== 'draft') throw conflict('INVALID_DRAFT_RESULT', 'Created scenario is not in draft state');
    res.status(201).json({ ok: true, id, status: 'draft', request_id: req.id });
  }));

  router.get('/:id', (req, res) => {
    const id = validate.scenarioId(req.params.id);
    const candidate = store.get(id);
    res.json({ ...serializeScenario(candidate.record, { detail: true }), request_id: req.id });
  });

  router.post('/:id/approve', asyncRoute(async (req, res) => {
    const id = validate.scenarioId(req.params.id);
    const result = await lifecycle.approve(id);
    res.json({ ok: true, id, status: 'approved', idempotent: result.idempotent, request_id: req.id });
  }));

  router.post('/:id/reject', asyncRoute(async (req, res) => {
    const id = validate.scenarioId(req.params.id);
    const result = await lifecycle.reject(id);
    res.json({ ok: true, id, status: 'rejected', idempotent: result.idempotent, request_id: req.id });
  }));

  router.post('/:id/render', asyncRoute(async (req, res) => {
    const id = validate.scenarioId(req.params.id);
    const mode = validate.renderMode(req.body?.mode || 'initial');
    const candidate = lifecycle.renderPolicy(id, mode);
    let renderSeed = candidate.record.seed;
    if (req.body?.seed !== undefined) {
      renderSeed = validate.seed(req.body.seed, { min: config.minSeed, max: config.maxSeed });
      if (candidate.state === 'approved') await lifecycle.setSeed(id, renderSeed);
    }
    const job = jobManager.enqueueRender({ scenarioId: id, mode, seed: renderSeed, requestId: req.id });
    res.status(202).json({ ok: true, job: serializeJob(job), request_id: req.id });
  }));

  router.post('/:id/seed', asyncRoute(async (req, res) => {
    const id = validate.scenarioId(req.params.id);
    const value = validate.seed(req.body?.seed, { min: config.minSeed, max: config.maxSeed });
    const result = await lifecycle.setSeed(id, value);
    res.json({ ok: true, id, seed: result.record.seed, request_id: req.id });
  }));

  router.post('/:id/feedback', asyncRoute(async (req, res) => {
    const id = validate.scenarioId(req.params.id);
    const text = validate.boundedText(req.body?.text, { field: 'feedback', max: config.maxFeedbackChars, code: 'INVALID_FEEDBACK' });
    const result = await lifecycle.recordFeedback(id, text);
    res.json({
      ok: true,
      id,
      status: 'feedback_recorded',
      feedback_count: result.record.feedback.length,
      request_id: req.id,
    });
  }));

  router.delete('/:id', asyncRoute(async (req, res) => {
    const id = validate.scenarioId(req.params.id);
    if (req.query.confirm !== 'true') throw conflict('DELETE_CONFIRMATION_REQUIRED', 'Explicit delete confirmation is required');
    const artifacts = await store.deleteMutable(id);
    res.json({ ok: true, id, artifacts, request_id: req.id });
  }));

  return router;
}
