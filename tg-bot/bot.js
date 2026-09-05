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
// Optional: публичный URL Web UI для HTML-ссылок в Telegram-сообщениях
// (см. spec `web-comic-rendering-pipeline` → Telegram caption). Default '' —
// backward-compat: Telegram-бот работает как раньше (только фото, без ссылки).
const WEB_PUBLIC_URL = String(process.env.WEB_PUBLIC_URL || '').trim().replace(/\/+$/, '');
const WEB_API_URL = String(process.env.WEB_API_URL || 'http://127.0.0.1:3000').trim().replace(/\/+$/, '');
const HELP_WEB_URL = WEB_PUBLIC_URL || WEB_API_URL;

// mcode CLI path (для /mcode команды). Override через env MCODE_BIN.
const MCODE_BIN = process.env.MCODE_BIN || '/Users/vladteresena/.minimax-code/bin/mcode';
// Рабочая директория mcode exec — обычно корень comic-studio.
const MCODE_CWD = process.env.MCODE_CWD || PROJECT_ROOT;
// Default timeout для /mcode: 10 минут.
const MCODE_TIMEOUT_MS = Number(process.env.MCODE_TIMEOUT_MS || 10 * 60 * 1000);

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

// ── Image provider ────────────────────────────────────────────────────────────
// Единственный image-провайдер — MiniMax через py/render/minimax_client.py.
// Provider switcher и data/.provider удалены в фиксации 026 (см.
// summary/audit/026_remove-draw-things-orchestrator.md). Draw Things не
// входит в demo-ветку.

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

// Split string into chunks of at most `size` chars, breaking at line
// boundaries where possible to keep Markdown / code blocks readable in
// Telegram. Telegram limit is 4096 chars per message; we use 3800 for safety.
function chunkString(text, size = 3800) {
  const s = String(text || '');
  if (s.length <= size) return [s];
  const chunks = [];
  let remaining = s;
  while (remaining.length > size) {
    let cut = remaining.lastIndexOf('\n', size);
    if (cut < size / 2) cut = size; // no good newline, hard cut
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\n/, '');
  }
  if (remaining) chunks.push(remaining);
  return chunks;
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
      Markup.button.callback('🎨 Рендер', `render:auto:auto:${sc.id}`),
      Markup.button.callback('🔄 Revision', `revise:${sc.id}`),
    ]);
    buttons.push([
      Markup.button.callback('🟧 Local stack (DT+Magnum)', `render:drawthings:lmstudio:${sc.id}`),
      Markup.button.callback('☁️ MiniMax cloud', `render:minimax:minimax:${sc.id}`),
    ]);
  } else if (status === 'rendered') {
    buttons.push([
      Markup.button.callback('🚀 Опубликовать', `publish:${sc.id}`),
      Markup.button.callback('🔄 Revision', `revise:${sc.id}`),
    ]);
    buttons.push([
      Markup.button.callback('🟧 Повторить (Local)', `render:drawthings:lmstudio:${sc.id}`),
      Markup.button.callback('☁️ Повторить (MiniMax)', `render:minimax:minimax:${sc.id}`),
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
      // Если задан WEB_PUBLIC_URL — добавляем HTML-ссылку и inline-кнопку (variant B).
      // Без WEB_PUBLIC_URL — backward-compat: caption и кнопки как раньше.
      const photoOpts = { caption: cardText, parse_mode: 'HTML', ...keyboard };
      if (WEB_PUBLIC_URL) {
        const htmlUrl = `${WEB_PUBLIC_URL}/comics/${sc.id}.html`;
        photoOpts.caption = `${cardText}\n\n🔗 <a href="${escapeHtml(htmlUrl)}">HTML-версия</a>`;
        const htmlButton = Markup.button.url('🔗 Открыть HTML', htmlUrl);
        // Append HTML-кнопку к существующим inline-кнопкам
        const existing = keyboard.reply_markup?.inline_keyboard || [];
        photoOpts.reply_markup = { inline_keyboard: [...existing, [htmlButton]] };
      }
      await ctx.replyWithPhoto({ source: comicPath }, photoOpts);
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
    `• Правки сохраняются как история — можно дополнять\n\n` +
    `<b>🎨 Restyle (быстрая смена стиля баблов):</b>\n` +
    `• <code>/restyle ID bubble|star|gothic|boom|memo|bar</code>\n` +
    `• Меняет ТОЛЬКО стиль баблов (CSS/Pillow-overlay), панели НЕ перегенерируются\n` +
    `• Занимает 2-5 сек, 0 вызовов MiniMax, статус сценария не меняется\n` +
    `• Доступно для <code>rendered</code> и <code>published</code>\n\n` +
    `<b>🎨 Render (с выбором провайдера):</b>\n` +
    `• В карточке сценария (<code>/view &lt;ID&gt;</code>) три inline-кнопки:\n` +
    `  • 🎨 <b>Рендер</b> — провайдеры из scenario.json / router (auto)\n` +
    `  • 🟧 <b>Local stack</b> — Draw Things + Magnum (uncensored)\n` +
    `  • ☁️ <b>MiniMax cloud</b> — облако, цензура\n` +
    `• Или через команду: <code>/render &lt;ID&gt; [image] [text]</code>\n` +
    `  • <code>/render &lt;ID&gt; drawthings lmstudio</code> = то же что кнопка Local stack\n` +
    `• Image providers: <code>minimax</code> | <code>drawthings</code>. Text: <code>minimax</code> | <code>lmstudio</code>\n` +
    `• Требует persisted <code>approved</code> (CLAUDE.md rule 1). Async, до 3 минут polling.\n\n` +
    `<b>📁 HTML комикс и его редактирование:</b>\n` +
    `• Артефакты: <code>data/comics/&lt;ID&gt;.html</code> + <code>data/comics/&lt;ID&gt;/{panel_*.png,layout.json,fonts/}</code>\n` +
    `• Открыть: <code>open data/comics/&lt;ID&gt;.html</code> или Web UI <code>${HELP_WEB_URL}/comics/&lt;ID&gt;.html</code>\n` +
    `• HTML self-contained: inline-CSS, относительные пути <code>./&lt;ID&gt;/fonts/</code> и <code>./&lt;ID&gt;/panel_*.png</code>\n` +
    `• <b>Ручная правка текста:</b> открой .html в редакторе, найди <code>&lt;p&gt;...&lt;/p&gt;</code> внутри баблов — меняй текст\n` +
    `• <b>Смена класса бабла:</b> найди <code>class="bubble bubble--bubble ..."</code>, замени <code>bubble</code> на <code>gothic|star|boom|memo|bar</code>\n` +
    `• <b>Смена позиции:</b> второй класс — <code>bubble--top-right|top-left|bottom-right|bottom-left</code>\n` +
    `• ⚠️ Ручные правки перезаписываются при <b>rerender</b>. Используй <code>/restyle</code> для стиля (сохраняет панели)`;
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

// /restyle <id> <style> — change bubble style (bubble|star|gothic|boom|memo|bar)
// без вызова MiniMax. Быстро и дёшево, регенерирует PNG+HTML используя существующие панели.
const VALID_RESTYLE_STYLES = ['bubble', 'star', 'gothic', 'boom', 'memo', 'bar'];
bot.command('restyle', async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const parts = ctx.message.text.trim().split(/\s+/);
  const id = parts[1];
  const style = parts[2];
  if (!id || !style) {
    return ctx.reply(
      'Использование: <code>/restyle &lt;ID&gt; &lt;style&gt;</code>\n\n' +
      'Стили: <code>bubble</code>, <code>star</code>, <code>gothic</code>, <code>boom</code>, <code>memo</code>, <code>bar</code>\n\n' +
      'Меняет только стиль баблов, панели НЕ перегенерируются.',
      { parse_mode: 'HTML' }
    );
  }
  if (!VALID_RESTYLE_STYLES.includes(style)) {
    return ctx.reply(
      `❌ Неизвестный стиль: <code>${escapeHtml(style)}</code>\n\nДопустимые: ${VALID_RESTYLE_STYLES.map(s => `<code>${s}</code>`).join(', ')}`,
      { parse_mode: 'HTML' }
    );
  }

  const found = findScenario(id);
  if (!found) return ctx.reply(`❌ Сценарий <code>${escapeHtml(id)}</code> не найден.`, { parse_mode: 'HTML' });
  if (!['rendered', 'published'].includes(found.status)) {
    return ctx.reply(
      `❌ Сценарий в статусе <code>${found.status}</code>. /restyle работает только для <code>rendered</code> или <code>published</code>.`,
      { parse_mode: 'HTML' }
    );
  }

  const oldStyle = found.scenario.style || 'bubble';
  if (oldStyle === style) {
    return ctx.reply(`ℹ️ Стиль уже <code>${escapeHtml(style)}</code>.`, { parse_mode: 'HTML' });
  }

  const progressMsg = await ctx.reply(
    `🎨 <b>Restyle <code>${escapeHtml(id)}</code>: ${escapeHtml(oldStyle)} → ${escapeHtml(style)}</b>\n\n` +
    `⏳ Регенерирую PNG+HTML+layout.json (без вызова MiniMax)...`,
    { parse_mode: 'HTML' }
  );

  try {
    const cmd = `${VENV_PYTHON} scripts/restyle.py --scenario-id ${id} --style ${style}`;
    await execAsync(cmd, { cwd: PROJECT_ROOT, maxBuffer: 10 * 1024 * 1024 });
    try { await ctx.deleteMessage(progressMsg.message_id); } catch (e) {}
    const htmlUrl = `${HELP_WEB_URL}/comics/${id}.html`;
    await ctx.reply(
      `🎉 <b>Restyle завершён!</b>\n\n` +
      `<code>${escapeHtml(oldStyle)}</code> → <code>${escapeHtml(style)}</code>\n\n` +
      `🔗 <a href="${escapeHtml(htmlUrl)}">Открыть HTML</a>`,
      { parse_mode: 'HTML', disable_web_page_preview: true }
    );
  } catch (err) {
    try { await ctx.deleteMessage(progressMsg.message_id); } catch (e) {}
    await ctx.reply(`❌ <b>Ошибка restyle:</b>\n<code>${escapeHtml(err.stderr || err.message)}</code>`, { parse_mode: 'HTML' });
  }
});

// ── /mcode: forward task to mcode CLI (filesystem + bash workflow) ───────────
//
// Запускает mcode exec в PROJECT_ROOT и возвращает результат в Telegram.
// Это **основной путь** для freeform-задач по comic-studio: mcode работает
// через файлы и bash, не через MCP-тулы (см. AGENTS.md → "mcode exec vs TUI").
//
// Примеры:
//   /mcode list draft scenarios
//   /mcode show me what's in data/scenarios/draft/
//   /mcode approve scenario abc12345
//   /mcode render scenario abc12345
//   /mcode create a new scenario: stalker meeting stranger at campfire
//   /mcode explain the lifecycle in this project
//
// ENV:
//   MCODE_BIN        — путь к бинарю mcode (default: /Users/vladteresena/.minimax-code/bin/mcode)
//   MCODE_CWD        — рабочая директория (default: PROJECT_ROOT)
//   MCODE_TIMEOUT_MS — таймаут в мс (default: 600000 = 10 min)
bot.command('mcode', async (ctx) => {
  if (!assertAuthorized(ctx)) return;

  const text = ctx.message.text || '';
  const task = text.replace(/^\/mcode(@\w+)?\s*/, '').trim();
  if (!task) {
    return ctx.reply(
      '🤖 <b>/mcode</b> — задача для mcode CLI\n\n' +
      'Использование: <code>/mcode &lt;задача&gt;</code>\n\n' +
      '<b>Примеры:</b>\n' +
      '• <code>/mcode list draft scenarios</code>\n' +
      '• <code>/mcode show me published comics</code>\n' +
      '• <code>/mcode approve scenario abc12345</code>\n' +
      '• <code>/mcode render scenario abc12345</code>\n' +
      '• <code>/mcode create a scenario: stalker at campfire</code>\n' +
      '• <code>/mcode explain the lifecycle of scenarios</code>\n\n' +
      'mcode работает через файлы и bash в <code>PROJECT_ROOT</code>, ' +
      'без MCP-тулов (см. AGENTS.md → "mcode exec vs TUI").',
      { parse_mode: 'HTML' }
    );
  }

  const statusMsg = await ctx.reply(
    `🤖 <b>mcode exec</b>\n\n` +
    `📋 <code>${escapeHtml(task)}</code>\n\n` +
    `⏳ Запускаю (cwd: <code>${escapeHtml(MCODE_CWD)}</code>, таймаут: ${Math.round(MCODE_TIMEOUT_MS / 60000)} мин)...`,
    { parse_mode: 'HTML' }
  );

  const startedAt = Date.now();
  try {
    // Безопасная подстановка: --cwd как отдельный argv, task — quoted shell-аргумент.
    // execAsync использует shell, поэтому task в одинарных кавычках; внутри task
    // экранируем одинарные кавычки.
    const safeTask = task.replace(/'/g, `'\\''`);
    const cmd = `${JSON.stringify(MCODE_BIN)} exec --cwd ${JSON.stringify(MCODE_CWD)} --permission smart '${safeTask}'`;
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: PROJECT_ROOT,
      maxBuffer: 50 * 1024 * 1024,
      timeout: MCODE_TIMEOUT_MS,
    });

    const result = (stdout || stderr || '(нет вывода)').trim();
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    const header = `✅ <b>Готово</b> за <code>${elapsed}s</code>\n\n`;

    // Удаляем status-сообщение, шлём результат чанками.
    try { await ctx.deleteMessage(statusMsg.message_id); } catch (e) {}

    const chunks = chunkString(result, 3800);
    for (let i = 0; i < chunks.length; i++) {
      const sep = chunks.length > 1 ? ` <i>(${i + 1}/${chunks.length})</i>\n\n` : '\n\n';
      await ctx.reply(header + sep + `<pre>${escapeHtml(chunks[i])}</pre>`, { parse_mode: 'HTML' });
    }
  } catch (e) {
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    const errMsg = String(e.stderr || e.stdout || e.message || e).slice(0, 3800);
    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, null,
        `❌ <b>Ошибка mcode exec</b> (за <code>${elapsed}s</code>):\n\n` +
        `<pre>${escapeHtml(errMsg)}</pre>`,
        { parse_mode: 'HTML' }
      );
    } catch (ee) {
      await ctx.reply(
        `❌ <b>Ошибка mcode exec</b> (за <code>${elapsed}s</code>):\n\n` +
        `<pre>${escapeHtml(errMsg)}</pre>`,
        { parse_mode: 'HTML' }
      );
    }
  }
});

// ── /mcp и /mcp_list: прямой доступ к comic-studio MCP из бота ───────────────
//
// Эти команды дают **полную** функциональность MCP-тулов (10 штук) без LLM
// в горячем пути. Дополняют /mcode: /mcp — для типизированных операций
// (быстро, идемпотентно, без рассуждений), /mcode — для задач, требующих
// LLM-рассуждений.
//
// Зачем отдельная команда вместо встраивания в /mcode:
// - mcode exec не подгружает MCP-тулы в свой runtime (см. AGENTS.md).
// - Прямой вызов — детерминированный, без модели, без догадок.
// - Можно использовать в скриптах: /mcp resolve_intent '{"phrase":"ssh"}'
//
// Использование:
//   /mcp_list                                  — список всех MCP-тулов
//   /mcp <tool>                                — вызов с пустыми аргументами
//   /mcp <tool> {"key": "value", ...}          — вызов с JSON-аргументами
//
// Примеры:
//   /mcp list_scenarios
//   /mcp list_scenarios {"status": "draft"}
//   /mcp get_scenario {"id": "abc12345"}
//   /mcp approve_scenario {"id": "abc12345"}
//   /mcp render_comic {"id": "abc12345", "mode": "initial"}
import {
  createMcpClient,
  listTools as listMcpTools,
  callTool as mcpCallTool,
  formatMcpResult,
  closeMcpClient,
} from './mcp-client.js';

bot.command('mcp_list', async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const statusMsg = await ctx.reply('🔌 <b>Подключаюсь к comic-studio MCP...</b>', { parse_mode: 'HTML' });

  let handle;
  try {
    handle = await createMcpClient();
    const tools = await listMcpTools(handle);
    const lines = tools.map((t) => {
      const params = t.inputSchema?.properties
        ? Object.keys(t.inputSchema.properties).map((k) => {
            const required = (t.inputSchema.required || []).includes(k);
            return `${k}${required ? '*' : ''}`;
          }).join(', ')
        : '—';
      return `<b>${escapeHtml(t.name)}</b>(<i>${escapeHtml(params)}</i>)\n  ${escapeHtml(t.description.substring(0, 200))}`;
    });
    const block = `🔌 <b>MCP — comic-studio (${tools.length} тулов)</b>\n\n${lines.join('\n\n')}`;
    await ctx.telegram.editMessageText(
      ctx.chat.id, statusMsg.message_id, null,
      block,
      { parse_mode: 'HTML' }
    );
  } catch (e) {
    await ctx.telegram.editMessageText(
      ctx.chat.id, statusMsg.message_id, null,
      `❌ MCP error: <pre>${escapeHtml(String(e.message || e).slice(0, 3800))}</pre>`,
      { parse_mode: 'HTML' }
    );
  } finally {
    await closeMcpClient(handle);
  }
});

bot.command('mcp', async (ctx) => {
  if (!assertAuthorized(ctx)) return;

  const text = ctx.message.text || '';
  const body = text.replace(/^\/mcp(@\w+)?\s*/, '').trim();

  if (!body) {
    return ctx.reply(
      '🔌 <b>/mcp</b> — прямой вызов MCP-тула comic-studio\n\n' +
      'Использование:\n' +
      '• <code>/mcp &lt;tool&gt;</code> — вызов без аргументов\n' +
      '• <code>/mcp &lt;tool&gt; {"key": "value"}</code> — вызов с JSON-аргументами\n\n' +
      'Подключён один MCP-сервер: <code>comic-studio</code> (10 тулов).\n' +
      'Сначала посмотри список тулов: <code>/mcp_list</code>',
      { parse_mode: 'HTML' }
    );
  }

  // Парсим: первое слово — tool name, остальное — JSON args (опционально).
  let toolName, jsonPart;
  const spaceIdx = body.indexOf(' ');
  if (spaceIdx === -1) {
    toolName = body;
    jsonPart = '{}';
  } else {
    toolName = body.substring(0, spaceIdx);
    jsonPart = body.substring(spaceIdx + 1).trim() || '{}';
  }

  let args = {};
  try {
    args = JSON.parse(jsonPart);
  } catch (e) {
    return ctx.reply(
      `❌ Невалидный JSON в аргументах:\n<pre>${escapeHtml(jsonPart.substring(0, 500))}</pre>\n\n` +
      `Пример: <code>/mcp ${escapeHtml(toolName)} {"key": "value"}</code>`,
      { parse_mode: 'HTML' }
    );
  }

  const statusMsg = await ctx.reply(
    `🔌 <b>MCP</b> <code>${escapeHtml(toolName)}</code> ${Object.keys(args).length ? `<i>(${Object.keys(args).length} args)</i>` : ''}\n\n⏳ Вызываю...`,
    { parse_mode: 'HTML' }
  );

  let result;
  let handle;
  try {
    handle = await createMcpClient();
    result = await mcpCallTool(handle, toolName, args);
    const formatted = formatMcpResult(result);
    try { await ctx.deleteMessage(statusMsg.message_id); } catch (e) {}
    if (result.isError) {
      await ctx.reply(`❌ <b>${escapeHtml(toolName)}</b>:\n<pre>${escapeHtml(formatted)}</pre>`, { parse_mode: 'HTML' });
    } else {
      const chunks = chunkString(formatted, 3800);
      for (let i = 0; i < chunks.length; i++) {
        const sep = chunks.length > 1 ? ` <i>(${i + 1}/${chunks.length})</i>\n\n` : '\n\n';
        await ctx.reply(`🔌 <b>${escapeHtml(toolName)}</b>${sep}<pre>${escapeHtml(chunks[i])}</pre>`, { parse_mode: 'HTML' });
      }
    }
  } catch (e) {
    const errMsg = String(e.message || e).slice(0, 3800);
    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, null,
        `❌ MCP error: <pre>${escapeHtml(errMsg)}</pre>`,
        { parse_mode: 'HTML' }
      );
    } catch (ee) {
      await ctx.reply(`❌ MCP error: <pre>${escapeHtml(errMsg)}</pre>`, { parse_mode: 'HTML' });
    }
  } finally {
    await closeMcpClient(handle);
  }
});

// ── Ingest & Generation Pipeline Helper ────────────────────────────────────────
//
// Единственный image-провайдер — MiniMax через py/render/minimax_client.py.
// Provider switcher удалён в фиксации 026 (Draw Things не в demo-ветке).
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
// ── /render: запуск рендера approved сценария с выбором провайдера ───────────
//
// Использование:
//   /render <id>                          — провайдеры из scenario.json / router
//   /render <id> drawthings               — override image provider
//   /render <id> drawthings lmstudio      — override image + text providers
//
// Доступные image providers: minimax (cloud), drawthings (local + LoRA)
// Доступные text providers:  minimax (cloud), lmstudio (local Magnum)
//
// Render требует persisted approval (CLAUDE.md rule 1). Сценарий должен быть
// в статусе `approved`. Результат — async job, поллим /api/jobs/:id каждые
// 3 секунды до 3 минут.
//
// См. `summary/audit/027_local-uncensored-stack.md` и
// `openspec/changes/local-uncensored-stack/specs/web-render-provider-passthrough/spec.md`.
const VALID_IMAGE_PROVIDERS = ['minimax', 'drawthings'];
const VALID_TEXT_PROVIDERS = ['minimax', 'lmstudio'];
const RENDER_POLL_MAX_ATTEMPTS = 60;     // 60 * 3s = 3 минуты
const RENDER_POLL_INTERVAL_MS = 3000;

bot.command('render', async (ctx) => {
  if (!assertAuthorized(ctx)) return;

  const text = ctx.message.text || '';
  const body = text.replace(/^\/render(@\w+)?\s*/, '').trim();
  const parts = body.split(/\s+/);

  // No args → usage
  if (!parts[0]) {
    return ctx.reply(
      '🎨 <b>/render</b> — запуск рендера approved сценария\n\n' +
      'Использование:\n' +
      '• <code>/render &lt;ID&gt;</code> — провайдеры из scenario.json / genre-table\n' +
      '• <code>/render &lt;ID&gt; drawthings</code> — override image provider\n' +
      '• <code>/render &lt;ID&gt; drawthings lmstudio</code> — override image+text\n\n' +
      `<b>Image providers:</b> <code>${VALID_IMAGE_PROVIDERS.join('</code>, <code>')}</code>\n` +
      `<b>Text providers:</b> <code>${VALID_TEXT_PROVIDERS.join('</code>, <code>')}</code>\n\n` +
      'Сценарий должен быть в статусе <code>approved</code> (CLAUDE.md rule 1).\n' +
      'После успеха: <code>/view &lt;ID&gt;</code> для просмотра.',
      { parse_mode: 'HTML' }
    );
  }

  const scenarioId = parts[0];
  const imageProvider = parts[1];
  const textProvider = parts[2];

  // Validate providers
  if (imageProvider && !VALID_IMAGE_PROVIDERS.includes(imageProvider)) {
    return ctx.reply(
      `❌ <b>image_provider</b> должен быть одним из: <code>${VALID_IMAGE_PROVIDERS.join('</code>, <code>')}</code>\n\n` +
      `Получено: <code>${escapeHtml(imageProvider)}</code>`,
      { parse_mode: 'HTML' }
    );
  }
  if (textProvider && !VALID_TEXT_PROVIDERS.includes(textProvider)) {
    return ctx.reply(
      `❌ <b>text_provider</b> должен быть одним из: <code>${VALID_TEXT_PROVIDERS.join('</code>, <code>')}</code>\n\n` +
      `Получено: <code>${escapeHtml(textProvider)}</code>`,
      { parse_mode: 'HTML' }
    );
  }

  // 1. Check scenario exists + is approved (read locally — быстрее, чем HTTP)
  const found = findScenario(scenarioId);
  if (!found) {
    return ctx.reply(
      `❌ Сценарий <code>${escapeHtml(scenarioId)}</code> не найден.\n\n` +
      `Проверь ID через <code>/all</code> или <code>/approved</code>.`,
      { parse_mode: 'HTML' }
    );
  }
  if (found.status !== 'approved') {
    return ctx.reply(
      `❌ Render требует статус <code>approved</code>, текущий: <code>${found.status}</code>.\n\n` +
      `Для <code>draft</code> — сначала утвердите через <code>/view ${escapeHtml(scenarioId)}</code> → ✅.`,
      { parse_mode: 'HTML' }
    );
  }

  // 2. Build request body
  const reqBody = {};
  if (imageProvider) reqBody.image_provider = imageProvider;
  if (textProvider) reqBody.text_provider = textProvider;

  const providerNote = (imageProvider || textProvider)
    ? `\n<b>Override:</b> image=<code>${escapeHtml(imageProvider || 'auto')}</code>, ` +
      `text=<code>${escapeHtml(textProvider || 'auto')}</code>`
    : `\n<b>Providers:</b> from scenario.json (router default)`;

  const progressMsg = await ctx.reply(
    `🚀 <b>Render started</b>\n` +
    `Сценарий: <code>${escapeHtml(scenarioId)}</code>` +
    providerNote + `\n\n⏳ Polling status...`,
    { parse_mode: 'HTML' }
  );

  // 3. Start render через Web API
  let res;
  try {
    res = await fetch(
      `${WEB_API_URL}/api/scenarios/${encodeURIComponent(scenarioId)}/render`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      }
    );
  } catch (e) {
    try { await ctx.deleteMessage(progressMsg.message_id); } catch (e) {}
    return ctx.reply(
      `❌ Ошибка соединения с Web API: <code>${escapeHtml(e.message)}</code>`,
      { parse_mode: 'HTML' }
    );
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.ok) {
    try { await ctx.deleteMessage(progressMsg.message_id); } catch (e) {}
    const code = data?.error?.code || `HTTP ${res.status}`;
    const message = data?.error?.message || 'unknown';
    if (code === 'BUSY') {
      return ctx.reply(
        `⚠️ Другой рендер уже выполняется для этого сценария. ` +
        `Проверь позже: <code>/view ${escapeHtml(scenarioId)}</code>.`,
        { parse_mode: 'HTML' }
      );
    }
    return ctx.reply(
      `❌ Render не запущен: <code>${escapeHtml(code)}</code> — <i>${escapeHtml(message)}</i>`,
      { parse_mode: 'HTML' }
    );
  }

  const jobId = data.job.id;

  // 4. Polling (fire-and-forget). В тестах (global.isTestEnv=true) пропускаем —
  //    иначе 60-итерационный setTimeout держит event loop и test runner
  //    не может завершиться. Тесты проверяют только initial request.
  if (global.isTestEnv) {
    return;
  }

  const pollJob = async () => {
    for (let i = 0; i < RENDER_POLL_MAX_ATTEMPTS; i++) {
      await new Promise((r) => setTimeout(r, RENDER_POLL_INTERVAL_MS));
      try {
        const jRes = await fetch(`${WEB_API_URL}/api/jobs/${encodeURIComponent(jobId)}`);
        if (!jRes.ok) continue;
        const jData = await jRes.json();
        const status = jData.job?.status;
        if (status === 'succeeded') {
          try { await ctx.deleteMessage(progressMsg.message_id); } catch (e) {}
          const actualImage = jData.job?.image_provider || 'auto';
          const actualText = jData.job?.text_provider || 'auto';
          await ctx.reply(
            `✅ <b>Render завершён!</b>\n\n` +
            `Сценарий: <code>${escapeHtml(scenarioId)}</code>\n` +
            `Image provider: <code>${escapeHtml(actualImage)}</code>\n` +
            `Text provider: <code>${escapeHtml(actualText)}</code>\n\n` +
            `Используй <code>/view ${escapeHtml(scenarioId)}</code> для просмотра.`,
            { parse_mode: 'HTML' }
          );
          return;
        } else if (status === 'failed' || status === 'interrupted') {
          try { await ctx.deleteMessage(progressMsg.message_id); } catch (e) {}
          await ctx.reply(
            `❌ <b>Render failed:</b> ${escapeHtml(jData.job?.error?.message || 'unknown')}`,
            { parse_mode: 'HTML' }
          );
          return;
        }
      } catch (e) {
        // network blip — продолжаем поллить
      }
    }
    await ctx.reply(
      `⚠️ Timeout: render всё ещё выполняется после ${Math.floor(RENDER_POLL_MAX_ATTEMPTS * RENDER_POLL_INTERVAL_MS / 1000)}s. ` +
      `Проверь позже: <code>/view ${escapeHtml(scenarioId)}</code>.`,
      { parse_mode: 'HTML' }
    );
  };

  pollJob();
});

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
    const resp = await fetch(`${WEB_API_URL}/api/scenarios/${id}`, { method: 'DELETE' });
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
    const response = await fetch(`${WEB_API_URL}/api/scenarios/${id}/remix`, {
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

bot.action(/^render:(auto|minimax|drawthings):(auto|minimax|lmstudio):(.+)$/, async (ctx) => {
  if (!assertAuthorized(ctx)) return;
  const imageProvider = ctx.match[1];
  const textProvider = ctx.match[2];
  const id = ctx.match[3];
  const found = findScenario(id);
  if (!found) return ctx.answerCbQuery('Сценарий не найден');

  if (!['approved', 'rendered'].includes(found.status)) {
    return ctx.answerCbQuery('❌ Сценарий должен быть в статусе approved или rendered', { show_alert: true });
  }

  // Описание выбора для пользователя
  const label =
    imageProvider === 'auto' ? '🎨 Рендер (auto)' :
    imageProvider === 'drawthings' ? '🟧 Local stack (DT+Magnum)' :
    '☁️ MiniMax cloud';

  ctx.answerCbQuery(label);
  const stackNote =
    imageProvider === 'auto'
      ? '<i>провайдеры из scenario.json / router</i>'
      : `<i>image=<code>${escapeHtml(imageProvider)}</code>, text=<code>${escapeHtml(textProvider)}</code></i>`;

  const progressMsg = await ctx.reply(
    `${label} <b>комикса <code>${id}</code>...</b>\n\n${stackNote}\n\n⏳ Генерируем панели и собираем стрип. Обычно 1-3 минуты.`,
    { parse_mode: 'HTML' }
  );

  let cmd = `${VENV_PYTHON} scripts/render_approved.py --scenario-id ${id}`;
  if (imageProvider !== 'auto') {
    cmd += ` --image-provider ${imageProvider}`;
  }
  if (textProvider !== 'auto') {
    cmd += ` --text-provider ${textProvider}`;
  }
  if (found.status === 'rendered') {
    cmd += ` --rerender --staging-dir data/.staging/bot_render_${id}_${Date.now()}`;
  }

  // В тестах НЕ запускаем execAsync — иначе event loop не закрывается
  // (subprocess держит handles). Тесты проверяют только progress message
  // и answerCbQuery, не сам render.
  if (global.isTestEnv) {
    return;
  }

  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd: PROJECT_ROOT, maxBuffer: 10 * 1024 * 1024 });
    try { await ctx.deleteMessage(progressMsg.message_id); } catch(e) {}

    const updated = findScenario(id);
    if (updated) {
      await ctx.reply(`🎉 <b>Рендер завершён!</b>`, { parse_mode: 'HTML' });
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
      `• <b>Restyle</b> (быстро): <code>/restyle ID bubble|star|gothic|boom|memo|bar</code> — меняет только стиль баблов без ре-рендера панелей\n` +
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
      `• Правки сохраняются как история\n\n` +
      `<b>📁 HTML комикс:</b>\n` +
      `• После рендера создаётся <code>data/comics/&lt;ID&gt;.html</code> — автономная HTML-страница\n` +
      `• Открой в браузере: <code>open data/comics/&lt;ID&gt;.html</code> или через Web UI: <code>${HELP_WEB_URL}/comics/&lt;ID&gt;.html</code>\n` +
      `• <b>Редактирование:</b> HTML self-contained (inline CSS + локальные woff2 + относительные пути к панелям в <code>./&lt;ID&gt;/</code>)\n` +
      `  • Открой <code>.html</code> в текстовом редакторе — captions в тегах <code>&lt;p&gt;</code>, можно менять текст/порядок\n` +
      `  • Чтобы переключить стиль баблов на всех панелях: <code>/restyle ID gothic</code> (быстро, 2-5 сек)\n` +
      `  • Чтобы сменить <i>один</i> бабл на другой класс — найди <code>class="bubble bubble--bubble ..."</code> в HTML и замени <code>bubble</code> на <code>gothic|star|boom|memo|bar</code>\n` +
      `• ⚠️ После следующего <b>rerender</b> HTML переписывается — ручные правки теряются. Используй <code>/restyle</code> для стиля, <code>/edit</code> для правки сюжета (с re-approval)`;
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
      const response = await fetch(`${WEB_API_URL}/api/scenarios/${id}/revise`, {
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
              const jRes = await fetch(`${WEB_API_URL}/api/jobs/${jobId}`);
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
    { command: 'edit', description: 'Редактировать сценарий по ID' },
    { command: 'restyle', description: 'Сменить стиль баблов без ре-рендера: /restyle ID bubble|star|gothic|boom|memo|bar' }
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