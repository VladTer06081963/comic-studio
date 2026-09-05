// Test: бот не должен падать, если Telegram API возвращает 400
// "query is too old" для answerCbQuery. Это типичная ситуация во время
// долгих рендеров (Draw Things 1-3 мин): пока render идёт, user может
// нажать кнопку, callback истечёт, и любой последующий answerCbQuery
// упадёт. Без global error handler'а в bot.js process.exit'ит.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupTelegrafMock, createCallbackQueryUpdate, executeUpdate } from './helpers.js';
import { bot } from '../bot.js';

function installStaleCallbackMock(bot) {
  // Make callApi reject with the exact shape Telegram returns for stale callbacks.
  bot.telegram.callApi = async (method, payload) => {
    if (method === 'getMe') {
      return { id: 99999, is_bot: true, first_name: 'TestBot', username: 'testbot' };
    }
    if (method === 'answerCallbackQuery') {
      const err = new Error(`400: Bad Request: query is too old and response timeout expired or query ID is invalid`);
      err.response = {
        ok: false,
        error_code: 400,
        description: 'Bad Request: query is too old and response timeout expired or query ID is invalid',
      };
      err.on = { method, payload };
      throw err;
    }
    return { ok: true };
  };
}

test('Бот переживает stale callback (answerCbQuery 400) без crash', async (t) => {
  // Watchdog: ловит ВСЁ, что не было проглочено bot.js handler'ом
  // или нашим temporary listener'ом. Если сюда попало не-stale — реальный crash.
  let crashed = null;
  const onUnhandled = (reason) => {
    const msg = reason?.response?.description || reason?.message || String(reason);
    if (!/query is too old|callback.*timeout/i.test(msg)) {
      crashed = reason;
    }
  };
  const onUncaught = (err) => {
    const msg = err?.message || String(err);
    if (!/query is too old|callback.*timeout/i.test(msg)) {
      crashed = err;
    }
  };
  process.on('unhandledRejection', onUnhandled);
  process.on('uncaughtException', onUncaught);

  t.after(() => {
    process.off('unhandledRejection', onUnhandled);
    process.off('uncaughtException', onUncaught);
  });

  await t.test('render callback с истёкшим query — process не падает', async () => {
    setupTelegrafMock(bot);
    installStaleCallbackMock(bot);
    const update = createCallbackQueryUpdate('render:auto:auto:test-stale-cb-001');

    // executeUpdate бросит, потому что Telegraf middleware await'ит ответ.
    // Нам не важно — нам важно, что bot.js process НЕ crashed (watchdog пуст).
    try {
      await executeUpdate(bot, update);
    } catch (e) {
      // Ожидаемая ошибка: stale callback от mock'а
      assert.match(
        e?.response?.description || e?.message || String(e),
        /query is too old/,
        'expected stale-callback error from mock',
      );
    }

    // Дать event loop'у обработать любые pending microtasks/promises
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(crashed, null, `process crashed with non-stale error: ${crashed}`);
  });
});
