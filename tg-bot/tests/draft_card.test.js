import test from 'node:test';
import assert from 'node:assert/strict';
import { bot, userState, CHAT_ID } from '../bot.js';
import { setupTelegrafMock, createMessageUpdate, writeTestScenario, cleanupTestScenario, executeUpdate } from './helpers.js';

const originalFetch = global.fetch;
let tgCalls;
const UID = Number(CHAT_ID) || 123456789;
const TEST_ID = 'test-draft-card-001';

global.fetch = async () => ({ ok: true, json: async () => ({}) });

test('Telegram Bot - draft card has prominent approve button', async (t) => {
  tgCalls = setupTelegrafMock(bot);

  t.beforeEach(() => {
    tgCalls.length = 0;
    userState.clear();
    writeTestScenario(TEST_ID, 'draft');
  });

  t.afterEach(() => {
    cleanupTestScenario(TEST_ID);
  });

  await t.test('/view <id> on draft shows ✅ as separate row + hint text', async () => {
    const update = createMessageUpdate(`/view ${TEST_ID}`);
    await executeUpdate(bot, update);

    // Find the view reply
    const viewReplies = tgCalls.filter(c =>
      c.method === 'sendMessage' && /СЦЕНАРИЙ КОМИКСА/.test(c.payload.text)
    );
    assert.ok(viewReplies.length >= 1, 'view should send the card');
    const card = viewReplies[0];
    const markup = card.payload.reply_markup;

    // Hint text present
    assert.match(card.payload.text, /Следующий шаг/);
    assert.match(card.payload.text, /✅ Утвердить/);
    assert.match(card.payload.text, /Без утверждения кнопки рендера/);

    // ✅ Утвердить должен быть ОТДЕЛЬНОЙ строкой (не вместе с ✏️)
    const buttons = markup.inline_keyboard;
    const approveRow = buttons.find(row =>
      row.some(b => b.callback_data && b.callback_data.startsWith('approve:'))
    );
    const editRow = buttons.find(row =>
      row.some(b => b.callback_data && b.callback_data.startsWith('edit:'))
    );
    assert.ok(approveRow, 'approve row должен существовать');
    assert.ok(editRow, 'edit row должен существовать');
    assert.notEqual(
      JSON.stringify(approveRow),
      JSON.stringify(editRow),
      '✅ Утвердить должен быть в отдельной строке, не рядом с ✏️',
    );
  });

  await t.test('approved card mentions render buttons in hint', async () => {
    const APPROVED_ID = 'test-draft-card-approved-001';
    writeTestScenario(APPROVED_ID, 'approved');
    const update = createMessageUpdate(`/view ${APPROVED_ID}`);
    await executeUpdate(bot, update);

    try {
      const viewReplies = tgCalls.filter(c =>
        c.method === 'sendMessage' && /СЦЕНАРИЙ КОМИКСА/.test(c.payload.text)
      );
      const card = viewReplies[0];
      assert.match(card.payload.text, /Утверждён/);
      assert.match(card.payload.text, /Local stack/);
      assert.match(card.payload.text, /MiniMax cloud/);
    } finally {
      cleanupTestScenario(APPROVED_ID);
    }
  });
});

test('Restore globals', () => {
  global.fetch = originalFetch;
});
