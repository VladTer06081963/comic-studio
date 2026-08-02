// tg-bot/bot.js — Telegram-бот для управления и утверждения сценариев Comic Studio
import { Telegraf, Markup } from 'telegraf';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const VENV_PYTHON = path.join(PROJECT_ROOT, '.venv', 'bin', 'python3');  // Python from venv
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const SCENARIOS_DIR = path.join(DATA_DIR, 'scenarios');
const COMICS_DIR = path.join(DATA_DIR, 'comics');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '1045621572';

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN not set in .env');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// User state tracking for multi-step flows (e.g. prompt creation or edit feedback)
const userState = new Map();

// ── Authorization ────────────────────────────────────────────────────────────
function assertAuthorized(ctx) {
  const chatId = String(ctx.chat?.id ?? ctx.message?.chat?.id ?? '');
  if (chatId !== CHAT_ID) {
    ctx.reply('⛔ <b>Доступ ограничен.</b> Вы не авторизованы для использования этого бота.', { parse_mode: 'HTML' }).catch(() => {});
    return false;
  }
  return true;
}

// ── Helper Utilities ──────────────────────────────────────────────────────────
const STATUS_BADGES = {
  draft: '🟢 Черновик',
  approved: '🔵 Утверждён',
  rendered: '🎨 Отрендерен',
  published: '🚀 Опубликован',
  rejected: '🔴 Отклонён',
};

function findScenario(id) {
  for (const status of ['draft', 'approved', 'rendered', 'published', 'rejected']) {
    const p = path.join(SCENARIOS_DIR, status, `${id}.json`);
    if (fs.existsSync(p)) {
      try {
        const scenario = JSON.parse(fs.readFileSync(p, 'utf-8'));
        return { scenario, status, path: p };
      } catch (e) {
        console.error(`Error reading ${p}:`, e);
      }
    }
  }
  return null;
}

function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

function moveScenario(id, fromStatus, toStatus) {
  const from = path.join(SCENARIOS_DIR, fromStatus, `${id}.json`);
  const toDir = path.join(SCENARIOS_DIR, toStatus);
  if (!fs.existsSync(toDir)) fs.mkdirSync(toDir, { recursive: true });
  const to = path.join(toDir, `${id}.json`);

  if (!fs.existsSync(from)) {
    // Check if already in target status
    if (fs.existsSync(to)) {
      const existing = JSON.parse(fs.readFileSync(to, 'utf-8'));
      if (existing.status === toStatus) return existing;
    }
    return false;
  }

  const sc = JSON.parse(fs.readFileSync(from, 'utf-8'));
  sc.status = toStatus;
  sc[`${toStatus}_at`] = new Date().toISOString();
  atomicWrite(to, sc);
  fs.unlinkSync(from);
  return sc;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatScenarioCard(sc, status) {
  const badge = STATUS_BADGES[status] || status;
  const panels = (sc.panels || [])
    .map(p => {
      let line = `  <b>${p.n}.</b> <i>"${escapeHtml(p.caption)}"</i>`;
      if (p.prompt) {
        const preview = p.prompt.length > 60 ? p.prompt.substring(0, 57) + '...' : p.prompt;
        line += `\n      🎨 <span class="tg-spoiler"><code>${escapeHtml(preview)}</code></span>`;
      }
      return line;
    })
    .join('\n');

  let sourceStr = escapeHtml(sc.source || 'свободный ввод');
  if (sc.source_url) {
    sourceStr = `<a href="${escapeHtml(sc.source_url)}">${sourceStr}</a>`;
  }

  let text = `<b>🎨 СЦЕНАРИЙ КОМИКСА</b>\n`;
  text += `<b>«${escapeHtml(sc.title || 'Без названия')}»</b>\n\n`;
  text += `🏷 <b>Статус:</b> ${badge}\n`;
  text += `🆔 <b>ID:</b> <code>${escapeHtml(sc.id)}</code>\n`;
  text += `🎭 <b>Тон:</b> <code>${escapeHtml(sc.tone || 'epic')}</code> | 🖌 <b>Стиль:</b> <code>${escapeHtml(sc.style || 'star')}</code> | 📐 <b>Сетка:</b> <code>${escapeHtml(sc.layout || 'comic')}</code>\n`;
  if (sc.seed !== undefined) text += `🎲 <b>Seed:</b> <code>${sc.seed}</code>\n`;
  text += `\n📖 <b>Панели (${(sc.panels || []).length}):</b>\n${panels}\n\n`;
  text += `🌐 <b>Источник:</b> ${sourceStr}\n`;
  if (sc.created_at) {
    const dt = new Date(sc.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    text += `📅 <b>Создан:</b> ${dt}\n`;
  }
  if (sc.published_url) {
    text += `🔗 <b>Ссылка:</b> <a href="${escapeHtml(sc.published_url)}">Сайт</a>\n`;
  }
  if (sc.feedback && sc.feedback.length > 0) {
    const lastFb = sc.feedback[sc.feedback.length - 1];
    text += `\n💬 <b>Правка:</b> <i>${escapeHtml(lastFb.text)}</i>\n`;
  }

  return text;
}

function getScenarioButtons(sc, status) {
  const buttons = [];
  if (status === 'draft') {
    buttons.push([
      Markup.button.callback('✅ Утвердить', `approve:${sc.id}`),
      Markup.button.callback('✏️ Редактировать', `edit:${sc.id}`),
    ]);
    buttons.push([Markup.button.callback('❌ Отклонить', `reject:${sc.id}`)]);
  } else if (status === 'approved') {
    buttons.push([
      Markup.button.callback('🎨 Запустить рендер', `render:${sc.id}`),
      Markup.button.callback('🔄 Revision', `revise:${sc.id}`),
    ]);
  } else if (status === 'rendered') {
    buttons.push([
      Markup.button.callback('🚀 Опубликовать', `publish:${sc.id}`),
      Markup.button.callback('🎨 Повторить рендер', `render:${sc.id}`),
      Markup.button.callback('🔄 Revision', `revise:${sc.id}`),
    ]);
  } else if (status === 'published') {
    buttons.push([
      Markup.button.callback('🎨 Remix', `remix:${sc.id}`)
    ]);
  }
  buttons.push([Markup.button.callback('🗑 Удалить', `confirm_delete:${sc.id}`)]);
  return Markup.inlineKeyboard(buttons);
}

function getMainMenu() {
  return Markup.keyboard([
    ['📋 Черновики', '✨ Создать комикс'],
    ['📂 Все сценарии', '📊 Статистика'],
    ['ℹ️ Помощь']
  ]).resize();
}

const IMAGE_STYLE_BUTTONS = [
  [Markup.button.callback('🎬 Cartoon', 'style_cartoon')],
  [Markup.button.callback('🎌 Anime', 'style_anime')],
  [Markup.button.callback('📚 Comic', 'style_comic')],
  [Markup.button.callback('📷 Realistic', 'style_realistic')],
  [Markup.button.callback('🎨 Watercolor', 'style_watercolor')],
];

const IMAGE_STYLE_EMOJI = {
  cartoon: '🎬',
  anime: '🎌',
  comic: '📚',
  realistic: '📷',
  watercolor: '🎨',
};

const CAPTION_STYLE_BUTTONS = [
  [Markup.button.callback('💬 Bubble', 'caption_bubble')],
  [Markup.button.callback('⭐ Star', 'caption_star')],
  [Markup.button.callback('🏰 Gothic', 'caption_gothic')],
  [Markup.button.callback('💥 Boom', 'caption_boom')],
  [Markup.button.callback('📝 Memo', 'caption_memo')],
  [Markup.button.callback('📊 Bar', 'caption_bar')],
];

const CAPTION_STYLE_EMOJI = {
  bubble: '💬',
  star: '⭐',
  gothic: '🏰',
  boom: '💥',
  memo: '📝',
  bar: '📊',
};

async function sendScenarioView(ctx, sc, status) {
  const cardText = formatScenarioCard(sc, status);
  const keyboard = getScenarioButtons(sc, status);

  // Check if rendered comic PNG exists
  const comicPath = sc.comic_path || path.join(COMICS_DIR, `${sc.id}.png`);
  if ((status === 'rendered' || status === 'published') && fs.existsSync(comicPath)) {
    try {
      await ctx.replyWithPhoto({ source: comicPath }, {
        caption: cardText,
        parse_mode: 'HTML',
        ...keyboard
      });
      return;
    } catch (e) {
      console.warn(`Failed to send photo for ${sc.id}:`, e.message);
    }
  }

  await ctx.reply(cardText, {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...keyboard
  });
}

// ── Command Handlers ──────────────────────────────────────────────────────────

// /start
bot.command('start', async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const welcome = 
    `<b>🤖 Comic Studio Bot</b>\n\n` +
    `Я помогаю создавать, утверждать, рендерить и публиковать серийные комиксы с помощью MiniMax AI.\n\n` +
    `<b>Быстрый старт:</b>\n` +
    `1. Нажми <b>✨ Создать комикс</b> в меню\n` +
    `2. Опиши идею или отправь ссылку\n` +
    `3. Нажми ✅ — бот сам нарисует комикс\n\n` +
    `<b>Источники:</b>\n` +
    `• Текст → свободная идея\n` +
    `• URL → статья из интернета\n` +
    `• YouTube → видео с субтитрами\n\n` +
    `Используй <b>/help</b> для списка всех команд.`;
  await ctx.reply(welcome, { parse_mode: 'HTML', ...getMainMenu() });
});

// /help
bot.command('help', async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const helpText =
    `<b>🤖 Comic Studio Bot — Справка</b>\n\n` +
    `<b>🎨 Создание комикса:</b>\n` +
    `• <code>/create текст или URL</code> — создать сценарий\n` +
    `• Просто отправь ссылку на статью или YouTube — бот сам поймёт\n` +
    `• Просто отправь текст — станет идеей для комикса\n\n` +
    `<b>🎨 Стили изображений:</b>\n` +
    `При создании комикса бот спросит:\n` +
    `🎬 Cartoon — мультяшный, яркие цвета\n` +
    `🎌 Anime — аниме, японская анимация\n` +
    `📚 Comic — комикс (по умолчанию)\n` +
    `📷 Realistic — фотореализм, 8K\n` +
    `🎨 Watercolor — акварель\n\n` +
    `<b>📋 Управление сценариями:</b>\n` +
    `• <code>/pending</code> — 🟢 черновики на утверждение\n` +
    `• <code>/approved</code> — 🔵 готовы к рендеру\n` +
    `• <code>/rendered</code> — 🎨 отрендеренные\n` +
    `• <code>/published</code> — 🚀 опубликованные\n` +
    `• <code>/rejected</code> — 🔴 отклонённые\n` +
    `• <code>/all</code> — 📂 все сценарии\n` +
    `• <code>/view ID</code> — открыть сценарий по ID\n` +
    `• Отправь ID — откроется карточка сценария\n\n` +
    `<b>✏️ Редактирование сценария:</b>\n` +
    `• <b>Кнопка ✏️ Редактировать</b> — открывает меню с опциями (фидбек, смена seed, повторный рендер)\n` +
    `• <b>Через команду:</b> <code>/edit ID текст</code>\n` +
    `• <b>Несколько правок</b> — сохраняются как история (создают remix)\n` +
    `\n<b>Примеры правок:</b>\n` +
    `• <code>Убрать панель 2</code>\n` +
    `• <code>Сделать более смешным</code>\n` +
    `• <code>Изменить концовку</code>\n\n` +
    `<b>🚀 Управление контентом:</b>\n` +
    `• Кнопка <b>✅ Утвердить</b> — одобрить черновик (перевести в approved)\n` +
    `• Кнопка <b>🎨 Рендер</b> — запустить генерацию картинок (для approved сценариев)\n` +
    `• Кнопка <b>🚀 Публикация</b> — отправить готовый комикс на сайт\n` +
    `• Кнопка <b>❌ Отклонить</b> — убрать из очереди (в rejected)\n` +
    `• Кнопка <b>🗑 Удалить</b> — полное удаление сценария (с подтверждением)\n\n` +
    `<b>📊 Информация:</b>\n` +
    `• <code>/stats</code> — статистика по статусам\n` +
    `• Меню внизу — быстрый доступ к спискам\n\n` +
    `<b>💡 Подсказки:</b>\n` +
    `• Нажми <b>✨ Создать комикс</b> в меню — и просто опиши идею\n` +
    `• Подписи в комиксах — <b>только на русском языке</b>\n` +
    `• Правки сохраняются как история — можно дополнять`;
  await ctx.reply(helpText, { parse_mode: 'HTML', ...getMainMenu() });
});

// /pending
bot.command('pending', async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  await listScenariosByStatus(ctx, 'draft', '🟢 Черновики на утверждении');
});

// /approved
bot.command('approved', async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  await listScenariosByStatus(ctx, 'approved', '🔵 Утверждённые сценарии (готовы к рендеру)');
});

// /rendered
bot.command('rendered', async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  await listScenariosByStatus(ctx, 'rendered', '🎨 Отрендеренные комиксы');
});

// /published
bot.command('published', async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  await listScenariosByStatus(ctx, 'published', '🚀 Опубликованные комиксы');
});

// /rejected
bot.command('rejected', async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  await listScenariosByStatus(ctx, 'rejected', '🔴 Отклонённые сценарии');
});

async function listAllScenarios(ctx) {
  let total = 0;
  let text = `<b>📂 Все сценарии в системе:</b>\n\n`;

  for (const status of ['draft', 'approved', 'rendered', 'published', 'rejected']) {
    const dir = path.join(SCENARIOS_DIR, status);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    if (!files.length) continue;

    const badge = STATUS_BADGES[status] || status;
    text += `<b>${badge} (${files.length}):</b>\n`;
    for (const f of files) {
      total++;
      try {
        const sc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
        text += `• <code>${sc.id}</code> — <b>${escapeHtml(sc.title || 'Без названия')}</b>\n`;
      } catch (e) {
        text += `• <code>${f.replace('.json', '')}</code>\n`;
      }
    }
    text += `\n`;
  }

  if (total === 0) {
    return ctx.reply('📭 Сценарии пока отсутствуют.');
  }

  text += `<i>Отправьте ID сценария боту для просмотра и управления.</i>`;
  await ctx.reply(text, { parse_mode: 'HTML', ...getMainMenu() });
}

// /all
bot.command('all', async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  await listAllScenarios(ctx);
});

async function listScenariosByStatus(ctx, status, header) {
  const dir = path.join(SCENARIOS_DIR, status);
  if (!fs.existsSync(dir)) return ctx.reply(`📭 ${header}: список пуст.`);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  if (!files.length) return ctx.reply(`📭 ${header}: список пуст.`);

  let text = `<b>${header}:</b>\n\n`;
  const buttons = [];

  files.forEach(f => {
    try {
      const sc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
      text += `• <code>${sc.id}</code> — <b>${escapeHtml(sc.title || 'Без названия')}</b>\n`;
      buttons.push([Markup.button.callback(`🔍 View ${sc.id}`, `view:${sc.id}`)]);
    } catch (e) {
      text += `• <code>${f.replace('.json', '')}</code>\n`;
    }
  });

  text += `\n<i>Нажмите на кнопку ниже или отправьте ID сценария:</i>`;
  await ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

// /stats
bot.command('stats', async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const counts = { draft: 0, approved: 0, rendered: 0, published: 0, rejected: 0 };
  let total = 0;

  for (const s of Object.keys(counts)) {
    const dir = path.join(SCENARIOS_DIR, s);
    if (fs.existsSync(dir)) {
      const count = fs.readdirSync(dir).filter(f => f.endsWith('.json')).length;
      counts[s] = count;
      total += count;
    }
  }

  let text = `<b>📊 Статистика Comic Studio:</b>\n\n`;
  text += `🟢 <b>Черновики:</b> ${counts.draft}\n`;
  text += `🔵 <b>Утверждённые:</b> ${counts.approved}\n`;
  text += `🎨 <b>Отрендеренные:</b> ${counts.rendered}\n`;
  text += `🚀 <b>Опубликованные:</b> ${counts.published}\n`;
  text += `🔴 <b>Отклонённые:</b> ${counts.rejected}\n`;
  text += `------------------------\n`;
  text += `📦 <b>Всего сценариев:</b> ${total}\n\n`;

  // Check env health
  const hasMinimax = !!process.env.MINIMAX_API_KEY;
  const hasNotion = !!process.env.NOTION_API_KEY;
  text += `<b>⚙️ Интеграции:</b>\n`;
  text += `• MiniMax AI: ${hasMinimax ? '✅ Подключен' : '⚠️ Отсутствует MINIMAX_API_KEY'}\n`;
  text += `• Notion Mirror: ${hasNotion ? '✅ Подключен' : '⚪️ Не настроен'}\n`;

  await ctx.reply(text, { parse_mode: 'HTML', ...getMainMenu() });
});

// /view <id>
bot.command('view', async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const args = ctx.message.text.trim().split(/\s+/);
  const id = args[1];
  if (!id) return ctx.reply('Использование: <code>/view &lt;ID&gt;</code>', { parse_mode: 'HTML' });

  const found = findScenario(id);
  if (!found) return ctx.reply(`❌ Сценарий <code>${escapeHtml(id)}</code> не найден.`, { parse_mode: 'HTML' });
  await sendScenarioView(ctx, found.scenario, found.status);
});

// /create <source>
bot.command('create', async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const input = ctx.message.text.replace(/^\/create\s*/, '').trim();
  if (!input) {
    userState.set(ctx.from.id, { action: 'awaiting_create_input', image_style: 'comic' });
    await ctx.reply('✨ <b>Создание комикса:</b>\n\nОтправьте ссылку на статью (URL), YouTube-видео или опишите идею в свободной форме.', { parse_mode: 'HTML' });
    await ctx.reply('🎨 <b>Выберите стиль изображений:</b>\n\n(можешь выбрать сейчас или пропустить — по умолчанию 📚 Comic)', {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(IMAGE_STYLE_BUTTONS)
    });
    return;
  }
  // Если есть input, сначала спросить про стиль
  userState.set(ctx.from.id, { action: 'awaiting_create_input', image_style: 'comic', pending_input: input });
  await ctx.reply('🎨 <b>Выберите стиль изображений:</b>\n\n(можешь выбрать сейчас или пропустить — по умолчанию 📚 Comic)', {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(IMAGE_STYLE_BUTTONS)
  });
});

// /edit <id> <feedback>
bot.command('edit', async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const parts = ctx.message.text.trim().split(/\s+/);
  const id = parts[1];
  const feedback = parts.slice(2).join(' ');
  if (!id || !feedback) return ctx.reply('Использование: <code>/edit &lt;scenario-id&gt; &lt;текст правки&gt;</code>', { parse_mode: 'HTML' });

  const found = findScenario(id);
  if (!found) return ctx.reply(`❌ Сценарий <code>${escapeHtml(id)}</code> не найден.`, { parse_mode: 'HTML' });

  const sc = found.scenario;
  sc.feedback = sc.feedback || [];
  sc.feedback.push({ ts: new Date().toISOString(), text: feedback });
  atomicWrite(found.path, sc);
  await ctx.reply(`📝 Правка сохранена для <code>${escapeHtml(id)}</code>!`, { parse_mode: 'HTML' });
});

// ── Ingest & Generation Pipeline Helper ────────────────────────────────────────
async function processCreateComic(ctx, input) {
  const statusMsg = await ctx.reply(`⏳ <b>Генерация сценария...</b>\nАнализирую источник и генерирую кадры с MiniMax LLM...`, { parse_mode: 'HTML' });

  // Get styles from state (defaults)
  const state = userState.get(ctx.from.id);
  const imageStyle = (typeof state === 'object' && state.image_style) ? state.image_style : 'comic';
  const captionStyle = (typeof state === 'object' && state.caption_style) ? state.caption_style : 'bubble';

  let cmd = `${VENV_PYTHON} scripts/ingest_and_draft.py --skip-notify --image-style ${imageStyle} --style ${captionStyle} `;
  if (input.startsWith('http://') || input.startsWith('https://')) {
    if (input.includes('youtube.com') || input.includes('youtu.be')) {
      cmd += `--youtube ${JSON.stringify(input)}`;
    } else {
      cmd += `--url ${JSON.stringify(input)}`;
    }
  } else {
    cmd += `--freeform ${JSON.stringify(input)}`;
  }

  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd: PROJECT_ROOT, maxBuffer: 10 * 1024 * 1024 });
    
    // Extract ID from stdout
    const match = stdout.match(/ID:\s*([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      const id = match[1];
      const found = findScenario(id);
      if (found) {
        try { await ctx.deleteMessage(statusMsg.message_id); } catch(e) {}
        await ctx.reply(`🎉 <b>Сценарий успешно создан!</b>`, { parse_mode: 'HTML' });
        await sendScenarioView(ctx, found.scenario, found.status);
        return;
      }
    }
    await ctx.reply(`✅ Сценарий создан! Посмотрите список: /pending`, { parse_mode: 'HTML' });
  } catch (err) {
    console.error('Create error:', err);
    await ctx.reply(`❌ <b>Ошибка генерации сценария:</b>\n<code>${escapeHtml(err.stderr || err.message)}</code>`, { parse_mode: 'HTML' });
  }
}

// ── Inline Actions ────────────────────────────────────────────────────────────

// Image style selection
bot.action(/^style_(cartoon|anime|comic|realistic|watercolor)$/, async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const style = ctx.match[1];
  const state = userState.get(ctx.from.id);

  // Save style to state, preserving any pending_input
  if (state === 'awaiting_create_input' || (typeof state === 'object' && state.action === 'awaiting_create_input')) {
    const pendingInput = (typeof state === 'object') ? state.pending_input : null;
    userState.set(ctx.from.id, { action: 'awaiting_create_input', image_style: style, pending_input: pendingInput });
    
    // Если был pending_input, пропускаем caption style и сразу создаём
    if (pendingInput) {
      ctx.answerCbQuery(`✅ Стиль: ${IMAGE_STYLE_EMOJI[style]} ${style}`);
      await ctx.reply(`✅ Стиль: <b>${IMAGE_STYLE_EMOJI[style]} ${style}</b>. Генерирую комикс...`, { parse_mode: 'HTML' });
      return processCreateComic(ctx, pendingInput);
    }
  }

  ctx.answerCbQuery(`✅ Стиль: ${IMAGE_STYLE_EMOJI[style]} ${style}`);
  await ctx.reply(`✅ Стиль картинок: <b>${IMAGE_STYLE_EMOJI[style]} ${style}</b>\n\n💬 Теперь выбери стиль подписей:`, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(CAPTION_STYLE_BUTTONS)
  });
});

// Caption style selection
bot.action(/^caption_(bubble|star|gothic|boom|memo|bar)$/, async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const captionStyle = ctx.match[1];
  const state = userState.get(ctx.from.id);

  if (state && typeof state === 'object' && state.action === 'awaiting_create_input') {
    // Update state with caption style
    userState.set(ctx.from.id, {
      ...state,
      caption_style: captionStyle,
    });

    ctx.answerCbQuery(`✅ Подпись: ${CAPTION_STYLE_EMOJI[captionStyle]} ${captionStyle}`);
    await ctx.reply(`✅ Подпись: <b>${CAPTION_STYLE_EMOJI[captionStyle]} ${captionStyle}</b>\n\nТеперь отправьте контент для комикса (URL, YouTube или текст).`, { parse_mode: 'HTML' });
  } else {
    ctx.answerCbQuery('⚠️ Сначала выбери стиль картинок');
  }
});

bot.action(/^view:(.+)$/, async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const id = ctx.match[1];
  const found = findScenario(id);
  if (!found) return ctx.answerCbQuery('Сценарий не найден');
  ctx.answerCbQuery();
  await sendScenarioView(ctx, found.scenario, found.status);
});

bot.action(/^confirm_delete:(.+)$/, async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const id = ctx.match[1];
  const found = findScenario(id);
  if (!found) return ctx.answerCbQuery('Сценарий не найден');

  ctx.answerCbQuery('⚠️ Подтверждение');

  const confirmKeyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Да, удалить', `delete:${id}`),
      Markup.button.callback('❌ Отмена', `cancel_delete:${id}`),
    ],
  ]);

  try {
    await ctx.editMessageReplyMarkup(confirmKeyboard);
  } catch (e) {
    await ctx.reply(`⚠️ <b>Точно удалить сценарий <code>${escapeHtml(id)}</code>?</b>`, {
      parse_mode: 'HTML',
      ...confirmKeyboard
    });
  }
});

bot.action(/^delete:(.+)$/, async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const id = ctx.match[1];
  const found = findScenario(id);
  if (!found) return ctx.answerCbQuery('Сценарий не найден');

  ctx.answerCbQuery('🗑 Удаляю...');

  try {
    const url = process.env.WEB_API_URL || 'http://127.0.0.1:3000';
    const resp = await fetch(`${url}/api/scenarios/${id}`, { method: 'DELETE' });
    const data = await resp.json();

    if (data.ok) {
      await ctx.editMessageText(`🗑 <b>Сценарий <code>${escapeHtml(id)}</code> удалён.</b>`, { parse_mode: 'HTML' });
    } else {
      await ctx.answerCbQuery(`❌ Ошибка: ${data.error}`);
    }
  } catch (err) {
    await ctx.reply(`❌ <b>Ошибка удаления:</b>\n<code>${escapeHtml(err.message)}</code>`, { parse_mode: 'HTML' });
  }
});

bot.action(/^cancel_delete:(.+)$/, async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const id = ctx.match[1];
  const found = findScenario(id);
  ctx.answerCbQuery('Отменено');

  if (found) {
    await sendScenarioView(ctx, found.scenario, found.status);
  } else {
    await ctx.reply(`❌ Сценарий не найден.`, { parse_mode: 'HTML' });
  }
});

bot.action(/^approve:(.+)$/, async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const id = ctx.match[1];
  const sc = moveScenario(id, 'draft', 'approved');
  if (!sc) return ctx.answerCbQuery('Ошибка обновления');
  ctx.answerCbQuery('✅ Сценарий утверждён!');

  const cardText = formatScenarioCard(sc, 'approved');
  const keyboard = getScenarioButtons(sc, 'approved');
  try {
    await ctx.editMessageText(`✅ <b>Сценарий утверждён!</b>\n\n` + cardText, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...keyboard
    });
  } catch (e) {
    await ctx.reply(`✅ <b>Сценарий ${id} утверждён!</b>`, { parse_mode: 'HTML', ...keyboard });
  }
});

bot.action(/^reject:(.+)$/, async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const id = ctx.match[1];
  const sc = moveScenario(id, 'draft', 'rejected');
  if (!sc) return ctx.answerCbQuery('Ошибка обновления');
  ctx.answerCbQuery('❌ Сценарий отклонён');

  try {
    await ctx.editMessageText(`❌ <b>Сценарий «${escapeHtml(sc.title)}» отклонён.</b>`, { parse_mode: 'HTML' });
  } catch (e) {
    await ctx.reply(`❌ <b>Сценарий ${id} отклонён.</b>`, { parse_mode: 'HTML' });
  }
});

bot.action(/^edit:(.+)$/, async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const id = ctx.match[1];
  const found = findScenario(id);
  if (!found) return ctx.answerCbQuery('Сценарий не найден');

  ctx.answerCbQuery('✏️ Редактирование');

  // Показать карточку с inline-кнопками
  const editKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💬 Общий фидбек', `edit_feedback:${id}`)],
    [Markup.button.callback('🎲 Изменить seed', `edit_seed:${id}`)],
    [Markup.button.callback('🔄 Перерендерить', `edit_rerender:${id}`)],
    [Markup.button.callback('❌ Отмена', `edit_cancel:${id}`)],
  ]);

  try {
    await ctx.editMessageText(`✏️ <b>Редактирование сценария <code>${escapeHtml(id)}</code></b>\n\nВыбери действие:`, {
      parse_mode: 'HTML',
      ...editKeyboard
    });
  } catch (e) {
    await ctx.reply(`✏️ <b>Редактирование сценария <code>${escapeHtml(id)}</code></b>\n\nВыбери действие:`, {
      parse_mode: 'HTML',
      ...editKeyboard
    });
  }
});

// Sub-actions for edit card
bot.action(/^edit_feedback:(.+)$/, async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const id = ctx.match[1];
  userState.set(ctx.from.id, { action: 'awaiting_revise_feedback', scenarioId: id });
  ctx.answerCbQuery('Жду текст');
  await ctx.reply(`🔄 Отправьте текст revision для сценария <code>${escapeHtml(id)}</code>:\n\n<i>(просто напиши в чат — будет отправлен в LLM)</i>`, { parse_mode: 'HTML' });
});

bot.action(/^revise:(.+)$/, async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const id = ctx.match[1];
  const found = findScenario(id);
  if (!found) return ctx.answerCbQuery('Сценарий не найден');
  if (!['approved', 'rendered'].includes(found.status)) {
    return ctx.answerCbQuery('Revision только для approved/rendered');
  }
  ctx.answerCbQuery('🔄 Revision');
  userState.set(ctx.from.id, { action: 'awaiting_revise_feedback', scenarioId: id });
  await ctx.reply(`🔄 Отправьте текст revision для <code>${escapeHtml(id)}</code>:\n\nПосле завершения потребуется повторный approval.`, { parse_mode: 'HTML' });
});

bot.action(/^remix:(.+)$/, async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const id = ctx.match[1];
  const found = findScenario(id);
  if (!found) return ctx.answerCbQuery('Сценарий не найден');
  if (found.status !== 'published') {
    return ctx.answerCbQuery('Remix только из published');
  }
  try {
    const response = await fetch(`${process.env.WEB_API_URL || 'http://127.0.0.1:3000'}/api/scenarios/${id}/remix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await response.json();
    if (response.ok) {
      const msg = `🎨 <b>Remix создан.</b>\n\nID: <code>${escapeHtml(data.id)}</code>\nSource: <code>${escapeHtml(id)}</code>`;
      const kb = { inline_keyboard: [[Markup.button.callback('👀 Посмотреть remix', `view:${data.id}`)]] };
      try {
        await ctx.editMessageText(msg, { parse_mode: 'HTML', reply_markup: kb });
      } catch (e) {
        await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb });
      }
    } else {
      await ctx.answerCbQuery(`❌ ${data?.error?.code || 'remix failed'}`);
    }
  } catch (error) {
    await ctx.reply(`❌ <b>Ошибка remix:</b> <code>${escapeHtml(error.message)}</code>`, { parse_mode: 'HTML' });
  }
});

bot.action(/^edit_seed:(.+)$/, async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const id = ctx.match[1];
  userState.set(ctx.from.id, { action: 'awaiting_seed', scenarioId: id });
  ctx.answerCbQuery('Жду seed');
  await ctx.reply(`🎲 Отправьте новое значение seed (число) или /random для случайного:`, { parse_mode: 'HTML' });
});

bot.action(/^edit_rerender:(.+)$/, async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const id = ctx.match[1];
  const found = findScenario(id);
  if (!found) return ctx.answerCbQuery('Сценарий не найден');
  ctx.answerCbQuery('🎨 Перерендер...');

  // Show seed choice
  const seedKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🎲 Случайный seed', `rerender_random:${id}`)],
    [Markup.button.callback('🔢 Свой seed', `edit_seed:${id}`)],
    [Markup.button.callback('❌ Отмена', `edit:${id}`)],
  ]);

  await ctx.reply(`🔄 <b>Перерендер сценария <code>${escapeHtml(id)}</code></b>\n\nТекущий seed: <code>${found.scenario.seed || 'не задан'}</code>\n\nВыбери:`, {
    parse_mode: 'HTML',
    ...seedKeyboard
  });
});

bot.action(/^rerender_random:(.+)$/, async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const id = ctx.match[1];
  const newSeed = Math.floor(Math.random() * 1000000);

  // Update seed
  const found = findScenario(id);
  if (found) {
    found.scenario.seed = newSeed;
    atomicWrite(found.path, found.scenario);
  }

  ctx.answerCbQuery(`🎲 Seed: ${newSeed}`);

  // Trigger render
  await ctx.reply(`🎲 Новый seed: <code>${newSeed}</code>\n🎨 Запускаю рендер...`, { parse_mode: 'HTML' });

  let cmd = `${VENV_PYTHON} scripts/render_approved.py --scenario-id ${id}`;
  if (found && found.status === 'rendered') {
    cmd += ` --rerender --staging-dir data/.staging/bot_seed_${id}_${Date.now()}`;
  } else if (!found || found.status !== 'approved') {
    return ctx.reply(`❌ <b>Нельзя отрендерить сценарий в статусе <code>${found ? found.status : 'unknown'}</code>.</b>`, { parse_mode: 'HTML' });
  }

  execAsync(cmd, { cwd: PROJECT_ROOT, maxBuffer: 10 * 1024 * 1024 })
    .then(() => {
      const updated = findScenario(id);
      if (updated) {
        ctx.reply(`🎉 <b>Перерендер завершён! (seed=${newSeed})</b>`, { parse_mode: 'HTML' });
        return sendScenarioView(ctx, updated.scenario, updated.status);
      }
    })
    .catch(err => {
      ctx.reply(`❌ <b>Ошибка рендера:</b>\n<code>${escapeHtml(err.stderr || err.message)}</code>`, { parse_mode: 'HTML' });
    });
});

bot.action(/^edit_cancel:(.+)$/, async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const id = ctx.match[1];
  const found = findScenario(id);
  ctx.answerCbQuery('Отменено');
  if (found) {
    await sendScenarioView(ctx, found.scenario, found.status);
  }
});

bot.action(/^render:(.+)$/, async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const id = ctx.match[1];
  const found = findScenario(id);
  if (!found) return ctx.answerCbQuery('Сценарий не найден');

  if (!['approved', 'rendered'].includes(found.status)) {
    return ctx.answerCbQuery('❌ Сценарий должен быть в статусе approved или rendered', { show_alert: true });
  }

  ctx.answerCbQuery('🎨 Запускаю рендер...');
  const progressMsg = await ctx.reply(`🎨 <b>Запущен рендер комикса <code>${id}</code>...</b>\n\n⏳ Генерируем изображения панелей через MiniMax AI и собираем итоговый стрип. Это может занять около 1-2 минут.`, { parse_mode: 'HTML' });

  let cmd = `${VENV_PYTHON} scripts/render_approved.py --scenario-id ${id}`;
  if (found.status === 'rendered') {
    cmd += ` --rerender --staging-dir data/.staging/bot_render_${id}_${Date.now()}`;
  }
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd: PROJECT_ROOT, maxBuffer: 10 * 1024 * 1024 });
    try { await ctx.deleteMessage(progressMsg.message_id); } catch(e) {}

    const updated = findScenario(id);
    if (updated) {
      await ctx.reply(`🎉 <b>Рендеринг завершён!</b>`, { parse_mode: 'HTML' });
      await sendScenarioView(ctx, updated.scenario, updated.status);
    } else {
      await ctx.reply(`✅ Комикс <code>${id}</code> успешно отрендерен!`, { parse_mode: 'HTML' });
    }
  } catch (err) {
    console.error('Render error:', err);
    try { await ctx.deleteMessage(progressMsg.message_id); } catch(e) {}
    await ctx.reply(`❌ <b>Ошибка рендеринга:</b>\n<code>${escapeHtml(err.stderr || err.message)}</code>`, { parse_mode: 'HTML' });
  }
});

bot.action(/^publish:(.+)$/, async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const id = ctx.match[1];
  const found = findScenario(id);
  if (!found) return ctx.answerCbQuery('Сценарий не найден');

  if (found.status !== 'rendered') {
    return ctx.answerCbQuery('❌ Сценарий должен быть отрендерен (rendered) для публикации', { show_alert: true });
  }

  ctx.answerCbQuery('🚀 Публикую...');
  const progressMsg = await ctx.reply(`🚀 <b>Публикация комикса <code>${id}</code>...</b>`, { parse_mode: 'HTML' });

  const cmd = `node --env-file=.env scripts/publish_rendered.js`;
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd: PROJECT_ROOT, maxBuffer: 10 * 1024 * 1024 });
    try { await ctx.deleteMessage(progressMsg.message_id); } catch(e) {}

    const updated = findScenario(id);
    if (updated) {
      await ctx.reply(`🎉 <b>Комикс успешно опубликован!</b>`, { parse_mode: 'HTML' });
      await sendScenarioView(ctx, updated.scenario, updated.status);
    } else {
      await ctx.reply(`✅ Комикс <code>${id}</code> опубликован!`, { parse_mode: 'HTML' });
    }
  } catch (err) {
    console.error('Publish error:', err);
    try { await ctx.deleteMessage(progressMsg.message_id); } catch(e) {}
    await ctx.reply(`❌ <b>Ошибка публикации:</b>\n<code>${escapeHtml(err.stderr || err.message)}</code>`, { parse_mode: 'HTML' });
  }
});

// ── Text & Keyboard Input Handler ─────────────────────────────────────────────
bot.on('text', async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const text = ctx.message.text.trim();

  // ── Menu keyboard buttons (must be first to prevent wrong matches) ────────
  if (text === '📋 Черновики') {
    return listScenariosByStatus(ctx, 'draft', '🟢 Черновики на утверждении');
  }
  if (text === '✨ Создать комикс') {
    userState.set(ctx.from.id, { action: 'awaiting_create_input', image_style: 'comic' });
    await ctx.reply('✨ <b>Создание комикса:</b>\n\nОтправьте ссылку на статью (URL), YouTube или опишите идею комикса в свободной форме.', { parse_mode: 'HTML' });
    return ctx.reply('🎨 <b>Выберите стиль изображений:</b>\n\n(можешь выбрать сейчас или пропустить — по умолчанию 📚 Comic)', {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(IMAGE_STYLE_BUTTONS)
    });
  }
  if (text === '📂 Все сценарии') {
    return listAllScenarios(ctx);
  }
  if (text === '📊 Статистика') {
    const counts = { draft: 0, approved: 0, rendered: 0, published: 0, rejected: 0 };
    let total = 0;
    for (const s of Object.keys(counts)) {
      const dir = path.join(SCENARIOS_DIR, s);
      if (fs.existsSync(dir)) {
        const count = fs.readdirSync(dir).filter(f => f.endsWith('.json')).length;
        counts[s] = count;
        total += count;
      }
    }
    let statsStr = `<b>📊 Статистика Comic Studio:</b>\n\n`;
    statsStr += `🟢 <b>Черновики:</b> ${counts.draft}\n`;
    statsStr += `🔵 <b>Утверждённые:</b> ${counts.approved}\n`;
    statsStr += `🎨 <b>Отрендеренные:</b> ${counts.rendered}\n`;
    statsStr += `🚀 <b>Опубликованные:</b> ${counts.published}\n`;
    statsStr += `🔴 <b>Отклонённые:</b> ${counts.rejected}\n`;
    statsStr += `------------------------\n`;
    statsStr += `📦 <b>Всего сценариев:</b> ${total}\n`;
    return ctx.reply(statsStr, { parse_mode: 'HTML', ...getMainMenu() });
  }
  if (text === 'ℹ️ Помощь') {
    // Show help directly instead of echoing /help
    const helpText =
      `<b>🤖 Comic Studio Bot — Справка</b>\n\n` +
      `<b>🎨 Создание комикса:</b>\n` +
      `• <code>/create текст или URL</code> — создать сценарий\n` +
      `• Просто отправь ссылку на статью или YouTube\n` +
      `• Просто отправь текст — станет идеей для комикса\n\n` +
      `<b>🎨 Стили изображений:</b>\n` +
      `При создании бот спросит:\n` +
      `🎬 Cartoon — мультяшный, яркие цвета\n` +
      `🎌 Anime — аниме, японская анимация\n` +
      `📚 Comic — комикс (по умолчанию)\n` +
      `📷 Realistic — фотореализм, 8K\n` +
      `🎨 Watercolor — акварель\n\n` +
      `<b>📋 Управление сценариями:</b>\n` +
      `• <code>/pending</code> — 🟢 черновики на утверждение\n` +
      `• <code>/approved</code> — 🔵 готовы к рендеру\n` +
      `• <code>/rendered</code> — 🎨 отрендеренные\n` +
      `• <code>/published</code> — 🚀 опубликованные\n` +
      `• <code>/rejected</code> — 🔴 отклонённые\n` +
      `• <code>/all</code> — 📂 все сценарии\n` +
      `• Отправь ID — откроется карточка сценария\n\n` +
      `<b>✏️ Редактирование сценария:</b>\n` +
      `• Кнопка ✏️ Редактировать — меню правок (фидбек, смена seed, рендер)\n` +
      `• <code>/edit ID текст правки</code>\n` +
      `• Несколько правок сохраняются как история (ремиксы)\n` +
      `\n<b>Примеры правок:</b>\n` +
      `• <code>Убрать панель 2</code>\n` +
      `• <code>Сделать более смешным</code>\n` +
      `• <code>Изменить концовку</code>\n\n` +
      `<b>🚀 Контент:</b>\n` +
      `• Кнопка <b>✅ Утвердить</b> — одобрить черновик (статус approved)\n` +
      `• Кнопка <b>🎨 Рендер</b> — запустить генерацию картинок\n` +
      `• Кнопка <b>🚀 Публикация</b> — отправить на сайт\n` +
      `• Кнопка <b>❌ Отклонить</b> — убрать из очереди\n` +
      `• Кнопка <b>🗑 Удалить</b> — полное удаление сценария\n\n` +
      `<b>📊 Информация:</b>\n` +
      `• <code>/stats</code> — статистика\n` +
      `• Меню внизу — быстрый доступ\n\n` +
      `<b>💡 Подсказки:</b>\n` +
      `• Нажми <b>✨ Создать комикс</b> и опиши идею!\n` +
      `• Подписи в комиксах — <b>только на русском языке</b>\n` +
      `• Правки сохраняются как история`;
    return ctx.reply(helpText, { parse_mode: 'HTML', ...getMainMenu() });
  }

  // ── State: awaiting input from previous step ──────────────────────────────
  const state = userState.get(ctx.from.id);
  if (state === 'awaiting_create_input' || (typeof state === 'object' && state.action === 'awaiting_create_input')) {
    userState.delete(ctx.from.id);
    return processCreateComic(ctx, text);
  }
  if (state && typeof state === 'object' && state.action === 'awaiting_revise_feedback') {
    userState.delete(ctx.from.id);
    const id = state.scenarioId;
    try {
      const response = await fetch(`${process.env.WEB_API_URL || 'http://127.0.0.1:3000'}/api/scenarios/${id}/revise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: [{ text, source: 'tg-bot' }] }),
      });
      const data = await response.json();
      if (response.ok) {
        const jobId = data.job?.id;
        const progressMsg = await ctx.reply(`🔄 <b>Запущена ИИ-редакция сценария.</b>\nОжидаем завершения (обычно 15-30 сек) ⏳`, { parse_mode: 'HTML' });
        
        const pollJob = async () => {
          if (global.isTestEnv) return;
          for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 3000));
            try {
              const jRes = await fetch(`${process.env.WEB_API_URL || 'http://127.0.0.1:3000'}/api/jobs/${jobId}`);
              if (jRes.ok) {
                const jData = await jRes.json();
                const status = jData.job?.status;
                if (status === 'succeeded') {
                  try { await ctx.deleteMessage(progressMsg.message_id); } catch(e) {}
                  await ctx.reply(`✅ <b>Редакция сценария завершена!</b>`, { parse_mode: 'HTML' });
                  const updated = findScenario(id);
                  if (updated) return sendScenarioView(ctx, updated.scenario, updated.status);
                  return;
                } else if (status === 'failed' || status === 'interrupted') {
                  try { await ctx.deleteMessage(progressMsg.message_id); } catch(e) {}
                  await ctx.reply(`❌ <b>Ошибка редакции:</b> ${escapeHtml(jData.job?.error?.message || 'unknown')}`, { parse_mode: 'HTML' });
                  return;
                }
              }
            } catch (e) {}
          }
          await ctx.reply(`⚠️ Время ожидания вышло. Проверьте результат позже через /view ${id}`);
        };
        pollJob();
        return;
      }
      return ctx.reply(`❌ <b>Revision не выполнен:</b> <code>${escapeHtml(data?.error?.code || 'unknown')}</code>`, { parse_mode: 'HTML' });
    } catch (error) {
      return ctx.reply(`❌ <b>Ошибка revision:</b> <code>${escapeHtml(error.message)}</code>`, { parse_mode: 'HTML' });
    }
  }

  if (state && typeof state === 'object' && state.action === 'awaiting_seed') {
    userState.delete(ctx.from.id);
    const id = state.scenarioId;
    let newSeed;
    if (text === '/random') {
      newSeed = Math.floor(Math.random() * 1000000);
    } else {
      newSeed = parseInt(text);
      if (isNaN(newSeed)) {
        return ctx.reply('❌ Некорректный seed. Введи число или /random', { parse_mode: 'HTML' });
      }
    }
    const found = findScenario(id);
    if (found) {
      found.scenario.seed = newSeed;
      atomicWrite(found.path, found.scenario);
      return ctx.reply(`🎲 Seed обновлён: <code>${newSeed}</code>\nИспользуй 🔄 Перерендерить для применения.`, { parse_mode: 'HTML' });
    }
  }

  // ── Direct scenario ID lookup ────────────────────────────────────────────
  if (/^[a-zA-Z0-9_-]{4,12}$/.test(text)) {
    const found = findScenario(text);
    if (found) {
      return sendScenarioView(ctx, found.scenario, found.status);
    }
  }

  // ── URL input: create comic from article/YouTube link ─────────────────────
  if (text.startsWith('http://') || text.startsWith('https://')) {
    return processCreateComic(ctx, text);
  }

  // ── Unknown text: suggest creation ───────────────────────────────────────
  return ctx.reply(
    `<b>Я не понял.</b>\n\n` +
    `Нажми <b>✨ Создать комикс</b> в меню или напиши /create и опиши идею.`,
    { parse_mode: 'HTML', ...getMainMenu() }
  );
});

// Export bot and userState for testing
export { bot, userState, CHAT_ID };

// Launch Bot
if (import.meta.url === `file://${process.argv[1]}`) {
  const commands = [
    { command: 'start', description: 'Запустить бота и показать главное меню' },
    { command: 'create', description: 'Создать новый комикс (передайте идею или URL)' },
    { command: 'pending', description: 'Черновики на утверждение (draft)' },
    { command: 'approved', description: 'Готовы к рендеру (approved)' },
    { command: 'rendered', description: 'Отрендеренные (готовы к публикации)' },
    { command: 'published', description: 'Опубликованные комиксы' },
    { command: 'rejected', description: 'Отклоненные сценарии' },
    { command: 'all', description: 'Все сценарии' },
    { command: 'stats', description: 'Статистика по базе' },
    { command: 'help', description: 'Справка и список команд' },
    { command: 'view', description: 'Посмотреть сценарий по ID' },
    { command: 'edit', description: 'Редактировать сценарий по ID' }
  ];

  bot.telegram.setMyCommands(commands).catch(err => {
    console.error('Не удалось установить меню команд Telegram:', err);
  });

  bot.launch().then(() => {
    console.log(`🤖 Telegram bot запущен в обновлённом режиме. Chat ID: ${CHAT_ID}`);
  }).catch(err => {
    console.error('Failed to launch bot:', err);
  });

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}