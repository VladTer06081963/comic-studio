# Задачи: rerender promote + tg-bot stability (фаза 4 local-uncensored-stack)

**Change ID:** `archive/local-uncensored-stack` (фаза 4 — follow-up bug fixes)
**Компаньон:** `summary/audit/028_rerender-promote-and-tgbot-stability.md`

## Статус: ✅ Done (2026-09-06)

| ID | Задача | Оценка | Статус |
|---|---|---|---|
| 4.1 | `_promote_rerender` не промоутил HTML; `assemble_pages` писал напрямую в canonical → pages терялись при rerender | 1h | ✅ Done (`3748a3f`) — `scripts/render_approved.py:215-225` (panel_root для assemble_pages) + `scripts/render_approved.py:256-330` (HTML в backups/promote/rollback) |
| 4.2 | Pre-existing `tests/test_render_approved.py` тесты патчили `generate_image` (удалён в `4117b80`) — silently broken | 30m | ✅ Done (`3748a3f`) — переведены на `minimax_generate_image` + `drawthings_generate_image` + `assemble_pages` + `render_reader` + `synthesize_panel_dialogue` через `ExitStack` |
| 4.3 | tg-bot падал на stale callback (400 "query is too old") — `unhandledRejection` от `answerCallbackQuery` крашил процесс | 20m | ✅ Done (`3a4cb06`) — global `process.on('unhandledRejection')` + `uncaughtException` с regex-фильтром `query is too old\|callback.*timeout` |
| 4.4 | tg-bot падал с `TimeoutError 90s` — Telegraf `handlerTimeout=90000` оборачивает всю middleware; `await execAsync` для render/publish 1-3 мин → timeout | 30m | ✅ Done (`545d2b1`) — render + publish handlers обёрнуты в `void (async () => { ... })()` IIFE; `global.isTestEnv` return'ит до IIFE — тесты не ломаются |
| 4.5 | 97ede986 immediate recovery: pages/, pages.json, audio/0?-page.wav, *.html регенерированы; 5 audio-path'ов в scenario JSON перенаправлены | 15m | ✅ Done (в рамках `3748a3f`) — `assemble_pages(generate_cover=False)` (cover = panel 1 fallback) + `render_reader`; audio-path'ов fix в `data/scenarios/rendered/97ede986.json` |
| 4.6 | OpenSpec: `local-uncensored-stack` change → 🟡 Proposed → ✅ Done; tasks.md обновлён (фазы 1-3 + фаза 4); архивирован | 10m | ✅ Done — `openspec/changes/local-uncensored-stack` → `openspec/changes/archive/local-uncensored-stack/` |
| 4.7 | Audit 028 + tasks 028 созданы | 30m | ✅ Done — `summary/audit/028_rerender-promote-and-tgbot-stability.md` + `summary/tasks/028_rerender-promote-and-tgbot-stability.md` |

## Зависимости

- Stalker-сценарий 97ede986 (data/scenarios/published/97ede986.json) был доступен для live-теста
- Draw Things процесс на 192.168.55.1:7860 (WireGuard)
- LM Studio на 192.168.55.1:1234 (для audio voicebox)
- Python 3.13 (.venv), Node 24 (системный), Telegraf 4.12

## Как использовать

```bash
# 1. Подтянуть фикс
cd /Users/vladteresena/Projects/comic-studio
git pull

# 2. Запустить тесты (всё должно быть зелёным)
.venv/bin/python -m unittest discover -s tests -p "test_*.py"
# → 186/186 OK

cd tg-bot && CHAT_ID=123456789 node --test tests/*.test.js
# → 33/33 OK

# 3. Запустить tg-bot (теперь переживёт stale callback и долгий render)
npm start

# 4. Нажать 🟧 Local stack на любом approved/rendered сценарии
# Бот мгновенно ответит "⏳ Генерируем панели...", render идёт в фоне,
# по завершении — отдельное сообщение "🎉 Рендер завершён!"
```

## Env variables

Все env уже были — ничего нового не добавилось:

| Переменная | Назначение | Default (fallback) |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | токен tg-бота | обязательно |
| `TELEGRAM_CHAT_ID` | авторизованный chat_id | `1045621572` |
| `MINIMAX_API_KEY` | MiniMax cloud (для fallback) | обязательно для fallback-теста |
| `DRAWTHINGS_MODELS_DIR` | путь к моделям Draw Things | `~/Library/Containers/com.liuliu.draw-things/Data/Documents/Models` |
| `LMSTUDIO_URL` | OpenAI-compat endpoint | `http://192.168.55.1:1234/v1` |
| `WEB_PUBLIC_URL` | публичный URL для HTML-ссылок в Telegram | пусто (backward-compat) |

## Файлы

- `scripts/render_approved.py` — MODIFIED — `_generate_candidate` (panel_root) + `_promote_rerender` (HTML backup/promote/rollback)
- `tests/test_render_approved.py` — MODIFIED — ExitStack helpers; переведены с `generate_image` на `minimax_generate_image` + `drawthings_generate_image` + `assemble_pages` + `render_reader` + `synthesize_panel_dialogue`; 2 новых теста
- `tg-bot/bot.js` — MODIFIED — global unhandled handlers + render/publish IIFE
- `tg-bot/tests/stale_callback.test.js` — CREATED — watchdog-тест для global error handler
- `tg-bot/tests/render_button.test.js` — MODIFIED — `Handler returns quickly (fire-and-forget render)` тест
- `CHANGELOG.md` — MODIFIED — 3 записи (3748a3f, 3a4cb06, 545d2b1)
- `openspec/changes/local-uncensored-stack/` — MOVED → `archive/local-uncensored-stack/`
- `summary/audit/028_rerender-promote-and-tgbot-stability.md` — CREATED
- `summary/tasks/028_rerender-promote-and-tgbot-stability.md` — CREATED (этот файл)

## Связанные

- `summary/audit/027_local-uncensored-stack.md` — parent change (фазы 1-3)
- `summary/tasks/027_local-uncensored-stack.md` — tasks фазы 1-3
- `openspec/changes/archive/local-uncensored-stack/proposal.md` — proposal со всеми фазами
- `openspec/changes/archive/local-uncensored-stack/tasks.md` — обновлённый tasks.md (фазы 1-4)
- Commits: `3748a3f` (HTML+pages promote), `3a4cb06` (tg-bot global error handler), `545d2b1` (fire-and-forget render/publish)

## Следующие задачи (для будущего)

| ID | Задача | Приоритет |
|---|---|---|
| N+1 | Добавить meta-tag в HTML `<head>` с `render_revision` + `rendered_at` + `seed` чтобы визуально отличать новый рендер от старого | Medium |
| N+2 | Заменить hand-rolled `unittest discover` на `pytest` + добавить `pyproject.toml` | Medium |
| N+3 | Добавить GitHub Actions CI (Python mocked tests, tg-bot tests, lint) | High |
| N+4 | Патч `bot.options.handlerTimeout = 10 * 60 * 1000` на старте (на случай если кто-то снова обернёт `await` в render handler) | Low |
| N+5 | Voice synthesis: cache + rate-limit на `voicebox` (Magnum) чтобы не генерировать WAV заново если текст не менялся | Low |
| N+6 | Render task в tg-bot: вместо `ctx.reply(...)` использовать `ctx.editMessageText(...)` для оригинальной карточки (inline-кнопки обновятся) | Low |
