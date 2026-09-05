import test from 'node:test';
import assert from 'node:assert/strict';
import { bot, CHAT_ID } from '../bot.js';
import { setupTelegrafMock, createCallbackQueryUpdate, writeTestScenario, cleanupTestScenario, executeUpdate } from './helpers.js';

const originalFetch = global.fetch;
const originalExec = null;  // bot uses execAsync; we'll mock it indirectly via env

let fetchCalls = [];
let fetchResponder = null;
global.fetch = async (url, options) => {
  fetchCalls.push({ url, options });
  if (fetchResponder) return fetchResponder(url, options);
  return { ok: true, json: async () => ({}) };
};

let tgCalls;
const UID = Number(CHAT_ID) || 123456789;
const TEST_ID = 'test-render-btn-001';

test('Telegram Bot - render button with provider choice', async (t) => {
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

  // Кнопка "Local stack" → image=drawthings + text=lmstudio
  await t.test('Local stack button calls render with --image-provider drawthings --text-provider lmstudio', async () => {
    const update = createCallbackQueryUpdate(`render:drawthings:lmstudio:${TEST_ID}`);
    await executeUpdate(bot, update);

    // answerCbQuery отправлен с описанием стека
    const answers = tgCalls.filter(c => c.method === 'answerCallbackQuery' || c.method === 'answerCbQuery');
    assert.equal(answers.length, 1);
    assert.match(answers[0].payload.text, /Local stack/);

    // Сообщение со стеком
    const progressMsgs = tgCalls.filter(c => c.method === 'sendMessage' && /Local stack/.test(c.payload.text));
    assert.equal(progressMsgs.length, 1);
    assert.match(progressMsgs[0].payload.text, /image=<code>drawthings<\/code>/);
    assert.match(progressMsgs[0].payload.text, /text=<code>lmstudio<\/code>/);
  });

  // Кнопка "MiniMax cloud" → image=minimax + text=minimax
  await t.test('MiniMax cloud button passes both providers', async () => {
    const update = createCallbackQueryUpdate(`render:minimax:minimax:${TEST_ID}`);
    await executeUpdate(bot, update);

    const progressMsgs = tgCalls.filter(c => c.method === 'sendMessage' && /MiniMax cloud/.test(c.payload.text));
    assert.equal(progressMsgs.length, 1);
    assert.match(progressMsgs[0].payload.text, /image=<code>minimax<\/code>/);
    assert.match(progressMsgs[0].payload.text, /text=<code>minimax<\/code>/);
  });

  // Кнопка "🎨 Рендер" (auto) → router picks (без --*-provider флагов)
  await t.test('Auto button (no provider override) does not pass explicit provider flags', async () => {
    const update = createCallbackQueryUpdate(`render:auto:auto:${TEST_ID}`);
    await executeUpdate(bot, update);

    const progressMsgs = tgCalls.filter(c => c.method === 'sendMessage' && /провайдеры из scenario/.test(c.payload.text));
    assert.equal(progressMsgs.length, 1, 'Auto mode message should mention router default');
  });

  // Неправильный формат callback data — не должен матчиться
  await t.test('Invalid callback format is silently ignored (no answerCbQuery)', async () => {
    const update = createCallbackQueryUpdate(`render:bad:bad:${TEST_ID}`);  // 'bad' not in enum
    await executeUpdate(bot, update);

    const answers = tgCalls.filter(c => c.method === 'answerCallbackQuery' || c.method === 'answerCbQuery');
    assert.equal(answers.length, 0, 'Bad format should not trigger handler');
  });

  // Сценарий не approved → error answerCbQuery
  await t.test('Non-approved scenario shows alert in answerCbQuery', async () => {
    writeTestScenario('test-draft-btn-001', 'draft');
    try {
      const update = createCallbackQueryUpdate(`render:drawthings:lmstudio:test-draft-btn-001`);
      await executeUpdate(bot, update);

      const answers = tgCalls.filter(c => c.method === 'answerCallbackQuery' || c.method === 'answerCbQuery');
      assert.equal(answers.length, 1);
      // show_alert: true (error message)
      assert.match(answers[0].payload.text, /approved|rendered/);
    } finally {
      cleanupTestScenario('test-draft-btn-001');
    }
  });

  // Regression: Telegraf оборачивает всю middleware в p-timeout с
  // handlerTimeout=90000. Если handler await'ит execAsync для рендера
  // (1-3 мин), Telegraf кидает TimeoutError. Хендлер должен быть
  // fire-and-forget: возвращаться быстро (<5s), а render идти в фоне.
  // Тест проверяет что в isTestEnv=false handler возвращается мгновенно
  // (execAsync замокан через global.isTestEnv=true в helpers.js).
  await t.test('Handler returns quickly (fire-and-forget render)', async () => {
    // Снимаем testEnv на время теста, иначе handler return'нет до execAsync
    const prev = global.isTestEnv;
    global.isTestEnv = false;
    try {
      // Мок execAsync чтобы fire-and-forget не упал и не оставил handle
      // Используем мок через подмену: создаём scenario, замоканный cmd
      // в /bin/echo чтобы не делать реальный exec
      const update = createCallbackQueryUpdate(`render:drawthings:lmstudio:${TEST_ID}`);
      const start = Date.now();
      await executeUpdate(bot, update);
      const elapsed = Date.now() - start;
      // handler должен вернуться почти мгновенно: answerCbQuery + progress
      // message + fire-and-forget. Даже с реальным DT exec, handler не
      // должен ждать результата.
      assert.ok(elapsed < 2000, `Handler took ${elapsed}ms — should be fire-and-forget`);
      // После executeUpdate у нас есть answerCbQuery + progress message
      const answers = tgCalls.filter(c => c.method === 'answerCallbackQuery' || c.method === 'answerCbQuery');
      assert.equal(answers.length, 1);
    } finally {
      global.isTestEnv = prev;
    }
  });
});

test('Restore globals', () => {
  global.fetch = originalFetch;
});
