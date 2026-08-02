/**
 * Static-serving routes for HTML-comic artifacts.
 *
 * Provides:
 *   GET /comics/:id.html           → data/comics/<id>.html   (text/html)
 *   GET /comics/:id/fonts/:name    → data/comics/<id>/fonts/<name> (font/woff2)
 *
 * Spec: `web-comic-rendering` → Requirements: HTML endpoint, Static font serving,
 *                                  Filesystem safety.
 *
 * Безопасность:
 *   - safeResolve против path traversal (`../`, encoded separators, absolute paths)
 *   - `scenarioId` валидация для `<id>` (regex ^[A-Za-z0-9_-]{4,64}$)
 *   - Имя font-файла ограничено safe-набором (woff2 only, no path components)
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import { asyncRoute, notFound, badRequest } from './errors.js';
import { scenarioId, safeResolve } from './validation.js';

const FONT_RE = /^[A-Za-z0-9_-]{1,64}\.woff2$/;

/**
 * Create router that exposes HTML comic + font static routes.
 *
 * Mounted in app.js (not inside /api) — public-facing comic viewer URLs.
 *
 * @param {{config: object}} options
 * @returns {express.Router}
 */
export function htmlStaticRouter({ config }) {
  const router = express.Router({ mergeParams: true });

  // ── GET /comics/:id.html ──────────────────────────────────────────────────
  router.get('/comics/:filename', asyncRoute(async (req, res, next) => {
    // Проверяем что filename заканчивается на `.html`; PNG-handler в app.js берёт
    // только `.png`. Любой другой суффикс → next() для notFound middleware.
    const filename = req.params.filename || '';
    if (!filename.endsWith('.html') || filename === '.html') return next();
    const idStr = filename.slice(0, -5);
    // `scenarioId` бросает badRequest('INVALID_SCENARIO_ID', ...) для невалидных ID
    // (короткие, спец-символы и т.п.). Это даёт 400, как требует спека.
    let id;
    try {
      id = scenarioId(idStr);
    } catch (err) {
      return next(err);
    }
    const filePath = safeResolve(config.dataRoot, 'comics', `${id}.html`);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return next(notFound('HTML_NOT_GENERATED', 'Comic HTML has not been generated yet'));
    }
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=60');
    return res.sendFile(path.resolve(filePath));
  }));

  // ── GET /comics/:id/panels/:name ───────────────────────────────────────────
  // Панели лежат в `data/comics/<id>/panel_N.png` (поддиректория рядом с <id>.html).
  // HTML ссылается на `./<id>/panel_*.png` — этот endpoint отдаёт файлы.
  const PANEL_RE = /^panel_[1-9][0-9]?\.png$/;
  router.get('/comics/:id/panels/:name', asyncRoute(async (req, res, next) => {
    let id;
    try {
      id = scenarioId(req.params.id);
    } catch (err) {
      return next(err);
    }
    const name = req.params.name;
    if (!PANEL_RE.test(name)) {
      return next(badRequest('INVALID_PANEL_NAME', 'Panel file name must match panel_[1-9][0-9]?.png'));
    }
    let filePath;
    try {
      filePath = safeResolve(config.dataRoot, 'comics', id, name);
    } catch (err) {
      return next(err);
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return next(notFound('PANEL_NOT_FOUND', `Panel file ${name} not found`));
    }
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600, immutable');
    return res.sendFile(path.resolve(filePath));
  }));

  // ── GET /comics/:id/fonts/:name ────────────────────────────────────────────
  router.get('/comics/:id/fonts/:name', asyncRoute(async (req, res, next) => {
    let id;
    try {
      id = scenarioId(req.params.id);
    } catch (err) {
      return next(err);
    }
    const name = req.params.name;
    if (!FONT_RE.test(name)) {
      return next(badRequest('INVALID_FONT_NAME', 'Font file name must match [A-Za-z0-9_-]{1,64}.woff2'));
    }
    let filePath;
    try {
      filePath = safeResolve(config.dataRoot, 'comics', id, 'fonts', name);
    } catch (err) {
      return next(err);
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return next(notFound('FONT_NOT_FOUND', `Font file ${name} not found`));
    }
    res.set('Content-Type', 'font/woff2');
    res.set('Cache-Control', 'public, max-age=3600, immutable');
    return res.sendFile(path.resolve(filePath));
  }));

  return router;
}