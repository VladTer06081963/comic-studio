// scripts/notify_telegram.js — отправляет сообщение в Telegram
import fetch from 'node:fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID || '1045621572';

const message = process.argv[2] || 'Test notification';

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN not set');
  process.exit(1);
}

const url = `https://api.telegram.org/bot${token}/sendMessage`;
const resp = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' }),
});

const result = await resp.json();
if (!result.ok) {
  console.error('Telegram error:', result);
  process.exit(1);
}
console.log('Sent:', result.result.message_id);