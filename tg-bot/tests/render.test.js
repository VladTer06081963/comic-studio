import test from 'node:test';
import assert from 'node:assert/strict';
import { bot, CHAT_ID } from '../bot.js';
import { setupTelegrafMock, createMessageUpdate, executeUpdate, writeTestScenario, cleanupTestScenario } from './helpers.js';

const originalFetch = global.fetch;
let fetchCalls = [];
let fetchResponder = null; // (url, options) => Promise<{ok, json}>

global.fetch = async (url, options) => {
  fetchCalls.push({ url, options });
  if (fetchResponder) {
    return fetchResponder(url, options);
  }
  return { ok: true, json: async () => ({}) };
};

let tgCalls;
const UID = Number(CHAT_ID) || 123456789;
const TEST_ID = 'test-render-001';

test('Telegram Bot - /render command', async (t) => {
  tgCalls = setupTelegrafMock(bot);

  t.beforeEach(() => {
    fetchCalls = [];
    fetchResponder = null;
    tgCalls.length = 0;
    writeTestScenario(TEST_ID, 'approved');
  });

  t.afterEach(() => {
    cleanupTestScenario(TEST_ID);
  });

  await t.test('no args: shows usage help', async () => {
    const update = createMessageUpdate('/render');
    await executeUpdate(bot, update);

    const replies = tgCalls.filter(c => c.method === 'sendMessage');
    assert.ok(replies.length >= 1, 'Should send at least one message');
    assert.match(replies[0].payload.text, /\/render/);
    assert.match(replies[0].payload.text, /drawthings/);
    assert.match(replies[0].payload.text, /lmstudio/);
    // Should NOT call API
    assert.equal(fetchCalls.length, 0);
  });

  await t.test('invalid image_provider: error message, no API call', async () => {
    const update = createMessageUpdate(`/render ${TEST_ID} openai`);
    await executeUpdate(bot, update);

    const replies = tgCalls.filter(c => c.method === 'sendMessage');
    assert.ok(replies.length >= 1);
    assert.match(replies[0].payload.text, /image_provider/);
    assert.match(replies[0].payload.text, /openai/);
    assert.equal(fetchCalls.length, 0, 'Should not call API on validation error');
  });

  await t.test('invalid text_provider: error message, no API call', async () => {
    const update = createMessageUpdate(`/render ${TEST_ID} drawthings gpt4`);
    await executeUpdate(bot, update);

    const replies = tgCalls.filter(c => c.method === 'sendMessage');
    assert.ok(replies.length >= 1);
    assert.match(replies[0].payload.text, /text_provider/);
    assert.equal(fetchCalls.length, 0);
  });

  await t.test('scenario not found: error, no API call', async () => {
    const update = createMessageUpdate('/render nonexistent000');
    await executeUpdate(bot, update);

    const replies = tgCalls.filter(c => c.method === 'sendMessage');
    assert.ok(replies.length >= 1);
    assert.match(replies[0].payload.text, /не найден/);
    assert.equal(fetchCalls.length, 0);
  });

  await t.test('scenario not approved: error, no API call', async () => {
    writeTestScenario('test-draft-001', 'draft');
    try {
      const update = createMessageUpdate('/render test-draft-001');
      await executeUpdate(bot, update);

      const replies = tgCalls.filter(c => c.method === 'sendMessage');
      assert.ok(replies.length >= 1);
      assert.match(replies[0].payload.text, /approved/);
      assert.match(replies[0].payload.text, /draft/);
      assert.equal(fetchCalls.length, 0);
    } finally {
      cleanupTestScenario('test-draft-001');
    }
  });

  await t.test('approved scenario, default providers: API called without body overrides', async () => {
    fetchResponder = async (url) => ({
      ok: true,
      json: async () => ({ ok: true, job: { id: 'job-abc-123' } }),
    });

    const update = createMessageUpdate(`/render ${TEST_ID}`);
    await executeUpdate(bot, update);

    // 1. Progress message отправлен
    const progressMsgs = tgCalls.filter(c =>
      c.method === 'sendMessage' && /Render started/.test(c.payload.text)
    );
    assert.equal(progressMsgs.length, 1);

    // 2. API вызван
    assert.equal(fetchCalls.length, 1);
    assert.match(fetchCalls[0].url, new RegExp(`/api/scenarios/${TEST_ID}/render$`));
    assert.equal(fetchCalls[0].options.method, 'POST');

    // 3. Body без overrides (default провайдеры)
    const body = JSON.parse(fetchCalls[0].options.body);
    assert.deepEqual(body, {});
  });

  await t.test('approved scenario, drawthings override: API called with image_provider', async () => {
    fetchResponder = async () => ({
      ok: true, json: async () => ({ ok: true, job: { id: 'job-dt' } }),
    });

    const update = createMessageUpdate(`/render ${TEST_ID} drawthings`);
    await executeUpdate(bot, update);

    assert.equal(fetchCalls.length, 1);
    const body = JSON.parse(fetchCalls[0].options.body);
    assert.equal(body.image_provider, 'drawthings');
    assert.equal(body.text_provider, undefined);

    // Progress message упоминает override
    const progressMsgs = tgCalls.filter(c =>
      c.method === 'sendMessage' && /Render started/.test(c.payload.text)
    );
    assert.match(progressMsgs[0].payload.text, /Override/);
    assert.match(progressMsgs[0].payload.text, /drawthings/);
  });

  await t.test('approved scenario, both providers override', async () => {
    fetchResponder = async () => ({
      ok: true, json: async () => ({ ok: true, job: { id: 'job-both' } }),
    });

    const update = createMessageUpdate(`/render ${TEST_ID} drawthings lmstudio`);
    await executeUpdate(bot, update);

    assert.equal(fetchCalls.length, 1);
    const body = JSON.parse(fetchCalls[0].options.body);
    assert.equal(body.image_provider, 'drawthings');
    assert.equal(body.text_provider, 'lmstudio');
  });

  await t.test('BUSY error from API: friendly message', async () => {
    fetchResponder = async () => ({
      ok: false,
      status: 409,
      json: async () => ({
        ok: false,
        error: { code: 'BUSY', message: 'Another job is already active' },
      }),
    });

    const update = createMessageUpdate(`/render ${TEST_ID}`);
    await executeUpdate(bot, update);

    const replies = tgCalls.filter(c => c.method === 'sendMessage');
    const busyMsg = replies.find(c => /BUSY|уже выполняется/.test(c.payload.text));
    assert.ok(busyMsg, 'Should send BUSY message');
    assert.match(busyMsg.payload.text, /уже выполняется/);
  });

  await t.test('generic API error: shows code and message', async () => {
    fetchResponder = async () => ({
      ok: false,
      status: 500,
      json: async () => ({
        ok: false,
        error: { code: 'INTERNAL', message: 'render_approved crashed' },
      }),
    });

    const update = createMessageUpdate(`/render ${TEST_ID}`);
    await executeUpdate(bot, update);

    const replies = tgCalls.filter(c => c.method === 'sendMessage');
    const errMsg = replies.find(c => /INTERNAL/.test(c.payload.text));
    assert.ok(errMsg, 'Should send error message with code');
    assert.match(errMsg.payload.text, /render_approved crashed/);
  });

  await t.test('fetch throws (network error): handled gracefully', async () => {
    fetchResponder = async () => {
      throw new Error('ECONNREFUSED');
    };

    const update = createMessageUpdate(`/render ${TEST_ID}`);
    await executeUpdate(bot, update);

    const replies = tgCalls.filter(c => c.method === 'sendMessage');
    const errMsg = replies.find(c => /ECONNREFUSED/.test(c.payload.text));
    assert.ok(errMsg, 'Should send network error message');
  });
});

test('Restore globals', () => {
  global.fetch = originalFetch;
});
