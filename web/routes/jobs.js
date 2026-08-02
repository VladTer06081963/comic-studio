import express from 'express';
import { serializeJob } from '../lib/job_store.js';

export function jobsRouter({ jobStore }) {
  const router = express.Router();
  router.get('/', (req, res) => {
    res.json({ items: jobStore.list().map(serializeJob), request_id: req.id });
  });
  router.get('/:id', (req, res) => {
    res.json({ job: serializeJob(jobStore.get(req.params.id)), request_id: req.id });
  });
  return router;
}
