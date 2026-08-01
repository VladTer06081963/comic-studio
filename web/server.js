// web/server.js — Express API + статический хостинг UI
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const VENV_PYTHON = path.join(PROJECT_ROOT, '.venv', 'bin', 'python3');

const app = express();
app.use(cors());
app.use(express.json());

// ── Static serving ─────────────────────────────────────────────────────────────
app.use('/ui', express.static(path.join(PROJECT_ROOT, 'ui')));
app.use('/comics', express.static(path.join(DATA_DIR, 'comics')));
app.use('/scenarios', express.static(path.join(DATA_DIR, 'scenarios')));

// ── Atomic state helper ────────────────────────────────────────────────────────
function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);  // atomic on POSIX
}

function moveScenarioAtomic(src, dst) {
  if (!fs.existsSync(src)) return null;
  const sc = JSON.parse(fs.readFileSync(src, 'utf-8'));
  atomicWrite(dst, sc);
  fs.unlinkSync(src);
  return sc;
}

function validateScenarioExists(id, expectedDir) {
  const p = path.join(DATA_DIR, 'scenarios', expectedDir, `${id}.json`);
  if (!fs.existsSync(p)) return { error: 'Not found', status: 404 };
  return { path: p, data: JSON.parse(fs.readFileSync(p, 'utf-8')) };
}

// ── API: scenario lists ───────────────────────────────────────────────────────
// API: список сценариев
app.get('/api/scenarios', (req, res) => {
  const status = req.query.status || 'all';
  if (status === 'all') {
    const all = [];
    for (const s of ['draft', 'approved', 'rejected', 'rendered', 'published']) {
      const dir = path.join(DATA_DIR, 'scenarios', s);
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
        all.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')));
      }
    }
    return res.json(all);
  }
  const dir = path.join(DATA_DIR, 'scenarios', status);
  if (!fs.existsSync(dir)) return res.json([]);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const scenarios = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')));
  res.json(scenarios);
});

// API: создать сценарий
app.post('/api/scenarios', async (req, res) => {
  const { content, image_style } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });

  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  let cmd = `${VENV_PYTHON} scripts/ingest_and_draft.py --skip-notify --image-style ${image_style || 'comic'} `;
  if (content.startsWith('http://') || content.startsWith('https://')) {
    if (content.includes('youtube.com') || content.includes('youtu.be')) {
      cmd += `--youtube ${JSON.stringify(content)}`;
    } else {
      cmd += `--url ${JSON.stringify(content)}`;
    }
  } else {
    cmd += `--freeform ${JSON.stringify(content)}`;
  }

  try {
    const { stdout } = await execAsync(cmd, { cwd: PROJECT_ROOT, maxBuffer: 10 * 1024 * 1024 });
    const match = stdout.match(/ID:\s*([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      res.json({ ok: true, id: match[1] });
    } else {
      res.json({ ok: true, output: stdout });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: один сценарий
app.get('/api/scenarios/:id', (req, res) => {
  for (const status of ['draft', 'approved', 'rejected', 'rendered', 'published']) {
    const p = path.join(DATA_DIR, 'scenarios', status, `${req.params.id}.json`);
    if (fs.existsSync(p)) return res.json(JSON.parse(fs.readFileSync(p, 'utf-8')));
  }
  res.status(404).json({ error: 'Not found' });
});

// API: approve — draft → approved
app.post('/api/scenarios/:id/approve', (req, res) => {
  const id = req.params.id;
  const draft = path.join(DATA_DIR, 'scenarios', 'draft', `${id}.json`);
  const approved = path.join(DATA_DIR, 'scenarios', 'approved', `${id}.json`);

  // Idempotent: already approved
  if (fs.existsSync(approved)) {
    const sc = JSON.parse(fs.readFileSync(approved, 'utf-8'));
    return res.json({ ok: true, id, status: sc.status, idempotent: true });
  }

  if (!fs.existsSync(draft)) return res.status(404).json({ error: 'Not found' });
  const sc = JSON.parse(fs.readFileSync(draft, 'utf-8'));

  // Only draft → approved is allowed from the API
  if (sc.status !== 'draft') {
    return res.status(409).json({ error: `Cannot approve: status is '${sc.status}'` });
  }

  sc.status = 'approved';
  sc.approved_at = new Date().toISOString();
  atomicWrite(approved, sc);
  fs.unlinkSync(draft);
  res.json({ ok: true, id, status: 'approved' });
});

// API: feedback — добавить правку
app.post('/api/scenarios/:id/feedback', (req, res) => {
  const id = req.params.id;
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text required' });
  }

  // Найти сценарий в любом статусе
  let sc = null;
  let scPath = null;
  for (const status of ['draft', 'approved', 'rejected', 'rendered', 'published']) {
    const p = path.join(DATA_DIR, 'scenarios', status, `${id}.json`);
    if (fs.existsSync(p)) {
      sc = JSON.parse(fs.readFileSync(p, 'utf-8'));
      scPath = p;
      break;
    }
  }

  if (!sc) return res.status(404).json({ error: 'Not found' });

  sc.feedback = sc.feedback || [];
  sc.feedback.push({
    ts: new Date().toISOString(),
    text: text.trim(),
    source: 'web-ui',
  });
  atomicWrite(scPath, sc);

  res.json({
    ok: true,
    id,
    feedback_count: sc.feedback.length,
  });
});

// API: reject — draft → rejected
app.post('/api/scenarios/:id/reject', (req, res) => {
  const id = req.params.id;
  const draft = path.join(DATA_DIR, 'scenarios', 'draft', `${id}.json`);
  const rejected = path.join(DATA_DIR, 'scenarios', 'rejected', `${id}.json`);

  if (!fs.existsSync(draft)) return res.status(404).json({ error: 'Not found' });
  const sc = JSON.parse(fs.readFileSync(draft, 'utf-8'));

  if (sc.status !== 'draft') {
    return res.status(409).json({ error: `Cannot reject: status is '${sc.status}'` });
  }

  sc.status = 'rejected';
  sc.rejected_at = new Date().toISOString();
  atomicWrite(rejected, sc);
  fs.unlinkSync(draft);
  res.json({ ok: true, id, status: 'rejected' });
});

// API: список готовых комиксов
app.get('/api/comics', (req, res) => {
  const dir = path.join(DATA_DIR, 'comics');
  if (!fs.existsSync(dir)) return res.json([]);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.png'));
  res.json(files.map(f => ({
    filename: f,
    url: `/comics/${f}`,
    created: fs.statSync(path.join(dir, f)).mtime,
  })));
});

// Health
app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎨 Comic Studio API → http://localhost:${PORT}`);
  console.log(`   UI: http://localhost:${PORT}/ui/`);
  console.log(`   Comics: http://localhost:${PORT}/comics/`);
});
