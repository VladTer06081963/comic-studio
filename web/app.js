import express from 'express';
import fs from 'fs';
import path from 'path';
import { accessControlMiddleware } from './lib/access_control.js';
import { errorMiddleware, notFoundMiddleware, requestIdMiddleware, unavailable } from './lib/errors.js';
import { requestLoggingMiddleware } from './lib/logger.js';
import { safeResolve, scenarioId } from './lib/validation.js';
import { scenariosRouter } from './routes/scenarios.js';
import { jobsRouter } from './routes/jobs.js';
import { comicsRouter } from './routes/comics.js';
import { healthRouter } from './routes/health.js';

export function createApp(runtime, { idGenerator } = {}) {
  const { config, logger, store, lifecycle, runner, jobStore, jobManager } = runtime;
  const app = express();
  app.disable('x-powered-by');
  app.use(requestIdMiddleware(idGenerator));
  app.use(requestLoggingMiddleware(logger));
  app.use(accessControlMiddleware(config));
  app.use((req, _res, next) => {
    if (runtime.isShuttingDown?.() && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next(unavailable('SERVER_SHUTTING_DOWN', 'Server is shutting down'));
    }
    next();
  });
  app.use(express.json({ limit: config.bodyLimit }));

  app.use('/ui', express.static(config.uiRoot, { fallthrough: true, index: 'index.html' }));
  app.get('/comics/:filename', (req, res, next) => {
    try {
      const match = /^([A-Za-z0-9_-]{4,64})\.png$/.exec(req.params.filename);
      if (!match) return next();
      const id = scenarioId(match[1]);
      const candidate = store.find(id);
      if (!candidate || !['rendered', 'published'].includes(candidate.state)) return next();
      const filePath = safeResolve(config.dataRoot, 'comics', `${id}.png`);
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return next();
      res.sendFile(path.resolve(filePath));
    } catch (error) { next(error); }
  });

  app.use('/api/scenarios', scenariosRouter({ config, store, lifecycle, runner, jobManager }));
  app.use('/api/jobs', jobsRouter({ jobStore }));
  app.use('/api/comics', comicsRouter({ config, store }));
  app.use('/api', healthRouter({ config, runner, shuttingDown: runtime.isShuttingDown }));

  app.use(notFoundMiddleware);
  app.use(errorMiddleware(logger));
  return app;
}
