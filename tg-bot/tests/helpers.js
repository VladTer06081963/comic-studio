import path from 'path';
import fs from 'fs';
global.isTestEnv = true;
import { Context } from 'telegraf';
import { CHAT_ID } from '../bot.js';

export function setupTelegrafMock(bot) {
  const calls = [];
  
  // We mock bot.telegram.callApi directly.
  bot.telegram.callApi = async (method, payload, options) => {
    if (method !== 'getMe') {
      calls.push({ method, payload });
    }
    if (method === 'getMe') {
      return { id: 99999, is_bot: true, first_name: 'TestBot', username: 'testbot' };
    }
    if (method === 'sendMessage') {
      return { message_id: 1000 + calls.length, text: payload.text };
    }
    return true;
  };
  
  bot.botInfo = { id: 99999, is_bot: true, first_name: 'TestBot', username: 'testbot' };

  return calls;
}

export async function executeUpdate(bot, update) {
  const ctx = new Context(update, bot.telegram, bot.botInfo);
  const mw = bot.middleware();
  await mw(ctx, async () => {});
  return ctx;
}

export function createMessageUpdate(text) {
  const update = {
    update_id: 1,
    message: {
      message_id: 100,
      from: { id: Number(CHAT_ID) || 123456789, first_name: 'TestUser', is_bot: false },
      chat: { id: Number(CHAT_ID) || 123456789, type: 'private' },
      date: Math.floor(Date.now() / 1000),
      text
    }
  };
  
  if (text.startsWith('/')) {
    const cmdLen = text.split(' ')[0].length;
    update.message.entities = [{ offset: 0, length: cmdLen, type: 'bot_command' }];
  }
  
  return update;
}

export function createCallbackQueryUpdate(data) {
  return {
    update_id: 2,
    callback_query: {
      id: 'cb1',
      from: { id: Number(CHAT_ID) || 123456789, first_name: 'TestUser', is_bot: false },
      message: {
        message_id: 100,
        chat: { id: Number(CHAT_ID) || 123456789, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: 'Dummy message'
      },
      chat_instance: '123',
      data
    }
  };
}

export function writeTestScenario(id, status) {
  const p = path.join(process.cwd(), '..', 'data', 'scenarios', status, `${id}.json`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const sc = {
    id,
    status,
    title: `Test ${id}`,
    panels: [{ n: 1, prompt: 'p', caption: 'c' }]
  };
  fs.writeFileSync(p, JSON.stringify(sc), 'utf-8');
  return p;
}

export function cleanupTestScenario(id) {
  for (const status of ['draft', 'approved', 'rejected', 'rendered', 'published']) {
    const p = path.join(process.cwd(), '..', 'data', 'scenarios', status, `${id}.json`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}
