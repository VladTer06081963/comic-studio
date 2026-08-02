import test from 'node:test';
import assert from 'node:assert/strict';
import { bot, userState, CHAT_ID } from '../bot.js';
import { setupTelegrafMock, createMessageUpdate, createCallbackQueryUpdate, writeTestScenario, cleanupTestScenario, executeUpdate } from './helpers.js';

// Mock global fetch for API calls
const originalFetch = global.fetch;
let fetchCalls = [];
global.fetch = async (url, options) => {
  fetchCalls.push({ url, options });
  if (url.includes('/revise')) {
    return { ok: true, json: async () => ({ ok: true, id: 'new-remix-id' }) };
  }
  return { ok: true, json: async () => ({}) };
};

let tgCalls = setupTelegrafMock(bot);
const UID = Number(CHAT_ID) || 123456789;

test('Telegram Bot - Scenario Modification', async (t) => {
  const TEST_ID = 'test-rev-123';
  
  t.beforeEach(() => {
    fetchCalls = [];
    tgCalls.length = 0;
    userState.clear();
    writeTestScenario(TEST_ID, 'draft');
  });

  t.afterEach(() => {
    cleanupTestScenario(TEST_ID);
  });

  await t.test('/edit command sends feedback directly', async () => {
    const update = createMessageUpdate(`/edit ${TEST_ID} Make it more cyberpunk`);
    await executeUpdate(bot, update);

    const replies = tgCalls.filter(c => c.method === 'sendMessage');
    assert.equal(replies.length, 1);
    assert.match(replies[0].payload.text, /Правка сохранена/);
  });

  await t.test('action edit:ID opens edit keyboard', async () => {
    const update = createCallbackQueryUpdate(`edit:${TEST_ID}`);
    await executeUpdate(bot, update);

    const edits = tgCalls.filter(c => c.method === 'editMessageText');
    assert.equal(edits.length, 1);
    assert.match(edits[0].payload.text, /Редактирование сценария/);
    
    const markup = edits[0].payload.reply_markup;
    assert.ok(markup.inline_keyboard.flat().some(b => b.callback_data === `edit_feedback:${TEST_ID}`));
  });

  await t.test('action edit_feedback:ID sets awaiting_revise_feedback state', async () => {
    const update = createCallbackQueryUpdate(`edit_feedback:${TEST_ID}`);
    await executeUpdate(bot, update);

    const answers = tgCalls.filter(c => c.method === 'answerCallbackQuery' || c.method === 'answerCbQuery');
    assert.equal(answers.length, 1);
    
    const state = userState.get(UID);
    assert.ok(state);
    assert.equal(state.action, 'awaiting_revise_feedback');
    assert.equal(state.scenarioId, TEST_ID);
  });

  await t.test('text message in awaiting_revise_feedback triggers revise', async () => {
    userState.set(UID, { action: 'awaiting_revise_feedback', scenarioId: TEST_ID });

    const update = createMessageUpdate('Add more neon lights');
    await executeUpdate(bot, update);

    assert.equal(userState.has(UID), false, 'State should be cleared after processing');
    assert.equal(fetchCalls.length, 1);
    assert.match(fetchCalls[0].url, new RegExp(`/api/scenarios/${TEST_ID}/revise`));
    
    const body = JSON.parse(fetchCalls[0].options.body);
    assert.equal(body.feedback[0].text, 'Add more neon lights');
  });

});

test('Restore globals', () => {
  global.fetch = originalFetch;
});
