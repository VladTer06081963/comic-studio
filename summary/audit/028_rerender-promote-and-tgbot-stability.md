# Аудит: rerender promote + tg-bot stability (фаза 4 local-uncensored-stack)

**Дата:** 2026-09-06
**Change ID:** `archive/local-uncensored-stack` (фаза 4 — follow-up bug fixes)
**Компаньон:** `summary/tasks/028_rerender-promote-and-tgbot-stability.md`

## 1. Контекст

Change `local-uncensored-stack` (audit 027) описывал переход main на локальный стек (Draw Things + LM Studio Magnum) вместо MiniMax. Foundation (фаза 1) + Wire-up (фаза 2) + A/B harness и bible (фаза 3) были завершены и закоммичены (4117b80, e4d8568, ad87ba5, 75db351, 89a9823, e50402b, e19445a, 723c06d, dbc6b3f, 4b63f40, c9e68de). Но при первом реальном live-тесте на Stalker-сценарии 97ede986 (WireGuard-isolated, DT + Magnum) всплыли три бага, которые сделали end-to-end pipeline нерабочим:

1. **HTML + pages терялись при rerender** — пользователь нажал 🟧 Local stack, рендер прошёл успешно, но `data/comics/97ede986.html` остался устаревшим, и `data/comics/97ede986/pages/` был пустой. Reader показывал пустые страницы.
2. **tg-bot падал на stale Telegram callback** (400 "query is too old") — `unhandledRejection` от `answerCallbackQuery` убивал процесс.
3. **tg-bot падал с `TimeoutError 90s`** — Telegraf `handlerTimeout=90000` оборачивает всю middleware; `await execAsync` для Draw Things рендера (1-3 мин) вылетал с timeout.

Все три бага были тихими — сборка была зелёная, тесты проходили, но реальное использование через Telegram ломалось. Это типичный пример того, что `mocks-only tests` не покрывают долгие async-сценарии с реальным провайдером.

## 2. Что сделано

### 2.1. `scripts/render_approved.py` (MODIFIED, +17 строк)

**Что**: фикс `_generate_candidate` + `_promote_rerender` для корректной переноски HTML + pages + pages.json + merged page audio из staging в canonical в rerender-режиме.

**Корневая причина**: `assemble_pages(panels_dir=comics_dir()/sid, audio_dir=comics_dir()/sid/audio, output_dir=comics_dir()/sid)` всегда писал в canonical, даже в `mode=rerender`. `_promote_rerender` делал `current_panels.rename(backup)` (унося свежесгенерированные pages в backup) → `candidate_panels.rename(current_panels)` (подменял canonical staging-панелями, где pages не было) → `shutil.rmtree(backup_root, ignore_errors=True)` (уничтожал новые pages навсегда). HTML вообще никогда не промоутился — `_promote_rerender` о нём не знал.

| Было | Стало |
|---|---|
| `assemble_pages(panels_dir=comics_dir() / sid, ..., output_dir=comics_dir() / sid)` | `assemble_pages(panels_dir=panel_root, audio_dir=panel_root / "audio", output_dir=panel_root)` |
| `_promote_rerender` backup + promote только для PNG/panels | `+ current_html` в backups + `candidate_html.rename(current_html)` после promote + rollback восстанавливает HTML |

**Trade-off**: `panel_root` это параметр `_generate_candidate` — в initial mode он равен canonical, в rerender mode равен staging. Один вызов работает для обоих. Никакого conditional.

### 2.2. `tests/test_render_approved.py` (MODIFIED, +211 строк)

**Что**: 6/6 тестов, из них 2 новых (`test_rerender_promotes_html_and_pages_from_staging`, `test_failed_rerender_rollback_restores_old_html`). Заодно починены pre-existing broken тесты: они патчили `generate_image` (удалён в `4117b80` после рефакторинга на двойной provider — `minimax_generate_image` + `drawthings_generate_image`). С `4117b80` они тихо падали с `AttributeError` на `patch.object(render, "generate_image", ...)`.

Новые helpers (`_patch_providers`, `_patch_assembly`) через `ExitStack`:
- `minimax_generate_image` + `drawthings_generate_image` → `fake_generate` (зелёный PNG)
- `assemble_pages` → fake result
- `render_reader` → возвращает `output_path` (тест сам сетапит файл)
- `synthesize_panel_dialogue` → `[]` (без voice в тестах)

### 2.3. `tg-bot/bot.js` (MODIFIED, +32 строки, 2 куска)

**Что #1**: global `process.on('unhandledRejection', ...)` + `process.on('uncaughtException', ...)` рядом с константами. Stale callback ошибки (regex `query is too old|callback.*timeout`) → warning, не crash. Остальные rejection/exception → `console.error` как раньше.

**Что #2**: render и publish handlers обёрнуты в `void (async () => { ... })()` IIFE. Синхронная часть (answerCbQuery + progress message) уходит как раньше за <1s. exec идёт в фоне, результат публикуется отдельными `ctx.reply()` вызовами. Прецедент: `republish` handler (строка 1417) уже использовал fire-and-forget с `.then().catch()`.

| Было | Стало |
|---|---|
| `try { const { stdout } = await execAsync(cmd, ...) } catch (err) { ... }` (sync, в Telegraf middleware) | `void (async () => { try { const { stdout } = await execAsync(cmd, ...) } catch (err) { ... } })()` |
| handler висит 1-3 мин → Telegraf `p-timeout(90000)` → `TimeoutError` → `process.exitCode=1` | handler возвращается мгновенно, render идёт в фоне |

**Trade-off**: для `republish`/recover-from-error сценариев теряем await в middleware, но это уже не нужно — все ошибки попадают в `ctx.reply()` через `.catch()` или `try/catch` в IIFE. UI-flow не меняется.

### 2.4. 97ede986 immediate recovery (manual)

**Что**: после фикса вручную регенерировал `data/comics/97ede986/{pages, pages.json, audio/0?-page.wav, *.html}` через `assemble_pages(generate_cover=False)` + `render_reader`. Cover = panel 1 (без MiniMax-вызова, fallback в `_use_first_panel_as_cover`). 5 audio-path'ов в `data/scenarios/rendered/97ede986.json` (потом `data/scenarios/published/97ede986.json`) перенаправлены из wiped `data/.staging/bot_render_97ede986_*/candidate/...` в canonical `data/comics/97ede986/audio/`. Orphan `data/.staging/bot_render_97ede986_*` в trash.

## 3. Файлы

| Путь | Действие | Описание |
|---|---|---|
| `scripts/render_approved.py` | MODIFIED | `_generate_candidate` использует `panel_root` для `assemble_pages`; `_promote_rerender` промоутит HTML + rollback |
| `tests/test_render_approved.py` | MODIFIED | 6/6 тестов OK (включая 2 новых). ExitStack-based helpers. Pre-existing тесты переведены с `generate_image` на `minimax_generate_image` + `drawthings_generate_image` + `assemble_pages` + `render_reader` + `synthesize_panel_dialogue` |
| `tg-bot/bot.js` | MODIFIED | global `unhandledRejection`/`uncaughtException` handlers (stale-callback safe); render + publish handlers → fire-and-forget IIFE |
| `tg-bot/tests/stale_callback.test.js` | CREATED | watchdog-тест: мок `bot.telegram.callApi` бросает 400 на `answerCallbackQuery`, проверяет что process не падает (watchdog ловит только non-stale errors) |
| `tg-bot/tests/render_button.test.js` | MODIFIED | новый тест `Handler returns quickly (fire-and-forget render)`: с `isTestEnv=false` handler возвращается <2000ms |
| `CHANGELOG.md` | MODIFIED | 3 записи: HTML+pages promote (3748a3f), tg-bot global error handler (3a4cb06), fire-and-forget render/publish (545d2b1) |
| `openspec/changes/local-uncensored-stack/` | MOVED → archive/ | статус 🟡 Proposed → ✅ Done; tasks.md обновлён (фазы 1-3 + 4.1-4.5 follow-up) |

## 4. Verification

| Шаг | Результат |
|---|---|
| `python -m unittest discover -s tests -p "test_*.py"` | ✅ 186/186 OK (0 failures, 0 errors) |
| `cd tg-bot && CHAT_ID=123456789 node --test tests/*.test.js` | ✅ 33/33 OK (включая новые `stale_callback.test.js` + `Handler returns quickly` из `render_button.test.js`) |
| Live: rerender 97ede986 через tg-bot (🟧 Local stack), 01:57-02:00 | ✅ panels + pages + PNG + HTML все обновлены; `Promoted HTML → /data/comics/97ede986.html` в логе; пустой `data/.staging/.../candidate/` = успешный promote |
| Manual: 97ede986 восстановлен (pages/, pages.json, audio/0?-page.wav, *.html) | ✅ читается в браузере, страницы с новыми DT-картинками |
| Orphan `data/.staging/bot_render_97ede986_1788646932394` в trash | ✅ `mavis-trash` подтвердил |

## 5. Связанные

- `summary/audit/027_local-uncensored-stack.md` — parent change (фазы 1-3)
- `summary/tasks/027_local-uncensored-stack.md` — tasks фазы 1-3
- `summary/tasks/028_rerender-promote-and-tgbot-stability.md` — tasks фазы 4
- `openspec/changes/archive/local-uncensored-stack/` — заархивированный change со всеми фазами + follow-up
- Commits: `3748a3f` (HTML+pages promote), `3a4cb06` (tg-bot global error handler), `545d2b1` (fire-and-forget render/publish)

## 6. Известные ограничения

- **HTML content байт-в-байт идентичен** между rerender'ами с тем же scenario data (title, captions, dialogue, panel count). mtime обновляется, content тот же. Пользователь может подумать что HTML не обновлялся — workaround: hard refresh в браузере (Cmd+Shift+R), или добавить в `<head>` meta-tag с `render_revision` + `rendered_at` + `seed`. **Не реализовано** в этом фиксе.
- **Render task в tg-bot** публикует результат отдельным сообщением, но не обновляет inline-кнопки в исходной карточке (которая уже «устарела» к моменту завершения рендера). Приемлемо для текущего UX, но при желании можно отредактировать оригинальное сообщение через `ctx.editMessageText` вместо `ctx.reply`.
- **Telegraf `handlerTimeout=90000`** остаётся hardcoded в `node_modules`. Если пользователь запустит render с ещё более долгим провайдером (>90s синхронно где-то ещё) — снова упадёт. Глобальное решение — патчить `bot.options.handlerTimeout` на старте, но пока все async-работы в fire-and-forget.
- **Tests pre-existing broken** были найдены случайно — гарантии что в других test_*.py нет похожих «silently broken» мест, нет. Нужен `pytest` + CI (сейчас в проекте нет ни `pytest`, ни `pyproject.toml`, ни CI workflow).
- **`drawthings_client.py` HTTP timeout 120s** — не покрывает edge case когда DT вообще не отвечает (process kill). Long-running renders зависают в `await` без какого-либо watchdog'а кроме общего bot `handlerTimeout` (который теперь не релевантен из-за fire-and-forget).

## 7. Следующие шаги

- [ ] Добавить meta-tag с `render_revision` + `rendered_at` + `seed` в HTML `<head>` чтобы можно было визуально отличить новый рендер от старого без сравнения mtime
- [ ] Заменить hand-rolled `unittest discover` на `pytest` + добавить `pyproject.toml` (нет в проекте вообще)
- [ ] Добавить GitHub Actions CI с раздельными job'ами: Python tests (mocked), tg-bot tests, lint
- [ ] Рассмотреть патч `bot.options.handlerTimeout = 10 * 60 * 1000` на старте, чтобы даже случайный забытый `await` не крашил бот
- [ ] Для voice synthesis: добавить cache + rate-limit на `voicebox` (Magnum), чтобы при rerender не генерировать WAV заново если текст не менялся
- [ ] `data/comics/<id>.html` и `data/comics/<id>.png` — добавить в `data/.gitignore` (уже там) и убедиться что backup/restore scripts не архивируют их в `data/archive/` случайно
