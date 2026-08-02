import express from 'express';
import fs from 'fs';
import path from 'path';

export function healthRouter({ config, runner, shuttingDown = () => false }) {
  const router = express.Router();
  router.get('/health', (req, res) => {
    res.json({ ok: true, status: 'alive', ts: new Date().toISOString(), request_id: req.id });
  });
  router.get('/ready', (req, res) => {
    const checks = {
      shutting_down: !shuttingDown(),
      data_root: false,
      python: runner.isExecutable(config.pythonBin),
      security: !config.remoteMode || Boolean(config.apiToken && config.allowedOrigins.length),
    };
    try {
      fs.mkdirSync(config.dataRoot, { recursive: true });
      fs.accessSync(config.dataRoot, fs.constants.R_OK | fs.constants.W_OK);
      const probe = path.join(config.dataRoot, `.ready-${process.pid}`);
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
      checks.data_root = true;
    } catch {}
    const ok = Object.values(checks).every(Boolean);
    res.status(ok ? 200 : 503).json({ ok, status: ok ? 'ready' : 'not_ready', checks, request_id: req.id });
  });
  return router;
}
