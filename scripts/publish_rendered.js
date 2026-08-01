// scripts/publish_rendered.js — публикует все rendered комиксы
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const COMICS_DIR = path.join(PROJECT_ROOT, 'data', 'comics');

import { publish as publishToSite } from '../publisher/site.js';
import { publishSocial } from '../publisher/social.js';

function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

async function main() {
  const renderedDir = path.join(PROJECT_ROOT, 'data', 'scenarios', 'rendered');
  if (!fs.existsSync(renderedDir)) {
    console.log('No rendered scenarios');
    return { succeeded: [], failed: [], skipped: [] };
  }
  const files = fs.readdirSync(renderedDir).filter(f => f.endsWith('.json'));
  if (!files.length) {
    console.log('No rendered scenarios');
    return { succeeded: [], failed: [], skipped: [] };
  }

  const succeeded = [];
  const failed = [];
  const skipped = [];

  for (const f of files) {
    const filePath = path.join(renderedDir, f);
    const sc = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const sid = sc.id;

    // Idempotency: already published
    if (sc.status === 'published') {
      console.log(`[${sid}] already published, skipping`);
      skipped.push(sid);
      continue;
    }

    if (!sc.comic_path || !fs.existsSync(sc.comic_path)) {
      console.warn(`[${sid}] no comic file at ${sc.comic_path}, skipping`);
      failed.push({ id: sid, reason: 'missing comic file' });
      continue;
    }

    console.log(`[${sid}] Publishing...`);
    try {
      const siteResult = await publishToSite(sc.comic_path, {
        title: sc.title,
        scenario_id: sid,
      });

      if (siteResult.skipped) {
        console.log(`[${sid}] site publish skipped (unconfigured)`);
      } else {
        sc.published_url = siteResult.url || siteResult;
      }

      // Optional social
      try {
        await publishSocial(sc.comic_path, { title: sc.title });
      } catch (e) {
        console.warn(`[${sid}] social publish failed (non-fatal): ${e.message}`);
      }

      // ── Commit published state ────────────────────────────────────────────
      const publishedDir = path.join(PROJECT_ROOT, 'data', 'scenarios', 'published');
      fs.mkdirSync(publishedDir, { recursive: true });
      const publishedPath = path.join(publishedDir, `${sid}.json`);

      sc.status = 'published';
      sc.published_at = new Date().toISOString();
      atomicWrite(publishedPath, sc);
      fs.unlinkSync(filePath);  // remove from rendered/

      succeeded.push(sid);
      console.log(`[${sid}] ✅ published`);
    } catch (e) {
      console.error(`[${sid}] ❌ ${e.message}`);
      failed.push({ id: sid, reason: e.message });
      // Scenario stays in rendered/ for retry
    }
  }

  return { succeeded, failed, skipped };
}

main().then(r => {
  console.log('\n=== Publication Summary ===');
  console.log(`  ✅ Succeeded: ${r.succeeded.length}`);
  console.log(`  ❌ Failed:    ${r.failed.length}`);
  console.log(`  ⊘ Skipped:   ${r.skipped.length}`);
  process.exit(r.failed.length > 0 ? 1 : 0);
}).catch(e => { console.error(e); process.exit(1); });
