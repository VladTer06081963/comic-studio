// publisher/site.js — публикация на сайт (POST multipart)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

const SITE_API_URL = process.env.SITE_API_URL;
const SITE_API_KEY = process.env.SITE_API_KEY;

export async function publish(comicPath, meta = {}) {
  if (!SITE_API_URL) {
    console.warn('SITE_API_URL not set, skipping site publish');
    return { skipped: true };
  }

  // Конвертируем PNG в base64 для JSON API или используем multipart
  const FormData = (await import('node:fetch')).default; // node 18+
  const fileBuffer = fs.readFileSync(comicPath);

  // Простейшая публикация: POST JSON с base64 (адаптируйте под свой API)
  const payload = {
    title: meta.title || 'Untitled',
    image_base64: fileBuffer.toString('base64'),
    meta,
  };

  const resp = await fetch(SITE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(SITE_API_KEY ? { 'Authorization': `Bearer ${SITE_API_KEY}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Site publish failed ${resp.status}: ${text}`);
  }

  const result = await resp.json();
  console.log(`✅ Published to site: ${result.url || 'ok'}`);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const comicPath = process.argv[2];
  if (!comicPath) {
    console.error('Usage: node publisher/site.js <comic.png>');
    process.exit(1);
  }
  publish(comicPath).catch(e => { console.error(e); process.exit(1); });
}