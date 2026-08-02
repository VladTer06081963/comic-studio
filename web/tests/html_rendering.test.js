/**
 * Tests for HTML comic rendering endpoints (spec `web-comic-rendering`).
 *
 * Покрывает:
 *   - GET /comics/<id>.html → 200 text/html, 404 HTML_NOT_GENERATED, 400 INVALID_SCENARIO_ID
 *   - GET /comics/<id>/fonts/<name>.woff2 → 200 font/woff2, 404 FONT_NOT_FOUND
 *   - Path traversal rejection (../ в font name)
 *   - Backward-compat: PNG endpoint остался работать
 *   - Static под tree dataRoot
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { makeTestRuntime, listen, jsonFetch } from './helpers.js';

function writeHtml(dataRoot, id, content = '<!doctype html><html lang="ru"><head><meta charset="UTF-8"><style>/* inline css */</style></head><body>Test</body></html>') {
  const dir = path.join(dataRoot, 'comics');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.html`), content, 'utf8');
  return content;
}

function writeFont(dataRoot, id, name = 'Bangers.woff2', content = Buffer.from('woff2-test-bytes')) {
  const fontsDir = path.join(dataRoot, 'comics', id, 'fonts');
  fs.mkdirSync(fontsDir, { recursive: true });
  fs.writeFileSync(path.join(fontsDir, name), content);
  return { fontsDir, content };
}

async function rawFetch(url, options) {
  // fetch, но без парсинга JSON — нужно для проверки content-type
  const response = await fetch(url, options);
  return response;
}

test('GET /comics/<id>.html returns 200 text/html when file exists', async () => {
  const ctx = makeTestRuntime();
  writeHtml(ctx.project.dataRoot, 'html-0001');
  const server = await listen(ctx.app);
  try {
    const response = await rawFetch(`${server.baseUrl}/comics/html-0001.html`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
    const body = await response.text();
    assert.match(body, /<!doctype html>/i);
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('GET /comics/<id>.html returns 404 HTML_NOT_GENERATED when file missing', async () => {
  const ctx = makeTestRuntime();
  // Mark scenario as rendered so the store.find check would pass, but no HTML written
  const dir = path.join(ctx.project.dataRoot, 'scenarios', 'rendered');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'html-0002.json'), JSON.stringify({ id: 'html-0002', status: 'rendered' }));
  const server = await listen(ctx.app);
  try {
    const result = await jsonFetch(`${server.baseUrl}/comics/html-0002.html`);
    assert.equal(result.response.status, 404);
    assert.match(result.body.error.code, /HTML_NOT_GENERATED|NOT_FOUND/);
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('GET /comics/<id>.html with invalid id returns 400 INVALID_SCENARIO_ID', async () => {
  const ctx = makeTestRuntime();
  const server = await listen(ctx.app);
  try {
    const response = await rawFetch(`${server.baseUrl}/comics/ab.html`);
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, 'INVALID_SCENARIO_ID');
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('GET /comics/<id>.png still works (backward-compat)', async () => {
  const ctx = makeTestRuntime();
  const dir = path.join(ctx.project.dataRoot, 'scenarios', 'rendered');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'png-0001.json'), JSON.stringify({ id: 'png-0001', status: 'rendered' }));
  // PNG file (just a fake binary)
  const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  fs.writeFileSync(path.join(ctx.project.dataRoot, 'comics', 'png-0001.png'), pngHeader);
  const server = await listen(ctx.app);
  try {
    const response = await rawFetch(`${server.baseUrl}/comics/png-0001.png`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('GET /comics/<id>/fonts/Bangers.woff2 returns 200 font/woff2', async () => {
  const ctx = makeTestRuntime();
  writeHtml(ctx.project.dataRoot, 'font-0001');
  writeFont(ctx.project.dataRoot, 'font-0001', 'Bangers.woff2', Buffer.from('woff2-mock'));
  const server = await listen(ctx.app);
  try {
    const response = await rawFetch(`${server.baseUrl}/comics/font-0001/fonts/Bangers.woff2`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'font/woff2');
    const body = Buffer.from(await response.arrayBuffer());
    assert.equal(body.toString(), 'woff2-mock');
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('GET /comics/<id>/fonts/Nonexistent.woff2 returns 404 FONT_NOT_FOUND', async () => {
  const ctx = makeTestRuntime();
  writeHtml(ctx.project.dataRoot, 'font-0002');
  // No font file written
  const server = await listen(ctx.app);
  try {
    const result = await jsonFetch(`${server.baseUrl}/comics/font-0002/fonts/Nonexistent.woff2`);
    assert.equal(result.response.status, 404);
    assert.equal(result.body.error.code, 'FONT_NOT_FOUND');
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('GET /comics/<id>/fonts/../../etc/passwd rejects path traversal', async () => {
  const ctx = makeTestRuntime();
  writeHtml(ctx.project.dataRoot, 'font-0003');
  const server = await listen(ctx.app);
  try {
    // Express не делает decode по умолчанию — %2e%2e не пройдёт как '..'.
    // Проверяем оба варианта.
    const cases = [
      '/comics/font-0003/fonts/..%2F..%2Fetc%2Fpasswd.woff2',
      '/comics/font-0003/fonts/..%2f..%2fetc%2fpasswd.woff2',
      '/comics/font-0003/fonts/..\\..\\etc\\passwd.woff2',
    ];
    for (const urlPath of cases) {
      const response = await rawFetch(`${server.baseUrl}${urlPath}`);
      // Should NOT be 200 — must reject
      assert.notEqual(response.status, 200, `unexpected 200 for ${urlPath}`);
      assert.ok(response.status === 400 || response.status === 404, `unexpected ${response.status} for ${urlPath}`);
    }
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('GET /comics/<id>/fonts/<name> rejects invalid font names', async () => {
  const ctx = makeTestRuntime();
  writeHtml(ctx.project.dataRoot, 'font-0004');
  const server = await listen(ctx.app);
  try {
    const cases = [
      '/comics/font-0004/fonts/notfound.txt',   // wrong extension
      '/comics/font-0004/fonts/.%2Fhidden.woff2',  // encoded slash
      '/comics/font-0004/fonts/' + 'a'.repeat(100) + '.woff2', // too long
    ];
    for (const urlPath of cases) {
      const result = await jsonFetch(`${server.baseUrl}${urlPath}`);
      assert.ok([400, 404].includes(result.response.status), `unexpected ${result.response.status} for ${urlPath}`);
    }
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('HTML body has inline CSS (no external stylesheet link)', async () => {
  const ctx = makeTestRuntime();
  writeHtml(ctx.project.dataRoot, 'html-style');
  const server = await listen(ctx.app);
  try {
    const response = await rawFetch(`${server.baseUrl}/comics/html-style.html`);
    const body = await response.text();
    assert.equal(response.status, 200);
    // Should NOT have external <link rel="stylesheet">
    assert.equal(/<link[^>]+rel=["']stylesheet["']/.test(body), false, 'HTML should inline CSS');
    // Should contain <style> block
    assert.match(body, /<style>/);
  } finally { await server.close(); ctx.project.cleanup(); }
});

test('HTML body uses relative paths for fonts and panels', async () => {
  const ctx = makeTestRuntime();
  // Create a more representative HTML with relative paths
  const html = `<!doctype html>
<html><head><style>
@font-face { src: url('./fonts/Bangers.woff2') format('woff2'); }
</style></head><body>
<img src="./panel_1.png" alt="panel 1">
</body></html>`;
  writeHtml(ctx.project.dataRoot, 'html-rel', html);
  const server = await listen(ctx.app);
  try {
    const response = await rawFetch(`${server.baseUrl}/comics/html-rel.html`);
    const body = await response.text();
    assert.match(body, /\.\/fonts\/Bangers\.woff2/);
    assert.match(body, /src="\.\/panel_1\.png"/);
  } finally { await server.close(); ctx.project.cleanup(); }
});