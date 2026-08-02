import express from 'express';
import fs from 'fs';
import path from 'path';
import { scenarioId, safeResolve } from '../lib/validation.js';

export function comicsRouter({ config, store }) {
  const router = express.Router();
  router.get('/', (req, res) => {
    const comicsRoot = safeResolve(config.dataRoot, 'comics');
    if (!fs.existsSync(comicsRoot)) return res.json([]);
    const items = [];
    for (const filename of fs.readdirSync(comicsRoot).filter(name => name.endsWith('.png')).sort()) {
      const id = filename.slice(0, -4);
      try {
        scenarioId(id);
        const candidate = store.find(id);
        if (!candidate || !['rendered', 'published'].includes(candidate.state)) continue;
        const filePath = safeResolve(comicsRoot, filename);
        const stat = fs.statSync(filePath);
        if (!stat.isFile() || stat.size === 0) continue;
        items.push({ scenario_id: id, filename, url: `/comics/${filename}`, created: stat.mtime.toISOString() });
      } catch {}
    }
    res.json(items);
  });
  return router;
}
