# CLAUDE.md — Инструкции для AI-агента

## Проект: Comic Studio

Конвейер для производства серийных комиксов. Работает в режиме: контекст → сценарий → утверждение → рендер → публикация.

## Ключевые правила

1. **Никогда не выполнять initial render без persisted approval.** Допустимые ручные каналы: авторизованный Telegram или local/authenticated Web UI.
2. **Всегда проверять approval дважды.** Перед запуском и непосредственно перед provider request сценарий должен находиться в `data/scenarios/approved/` со status `approved`.
3. **Идемпотентность.** Использовать scenario ID и seed; для `rendered` допускается только explicit staging rerender.
4. **Published immutable.** Не изменять, не удалять и не рендерить повторно `published`; будущие изменения создают новый remix draft.
5. **Логировать всё.** Python и Web пишут в `data/logs/YYYY-MM-DD.log` и stdout без секретов.
6. **Тесты без платных side effects.** Mocked suites не должны вызывать MiniMax, публикацию или Telegram.

## Структура модулей

### Python (`py/`)

- `ingest/url.py` — `fetch_url(url) -> str` извлекает текст статьи
- `ingest/youtube.py` — `transcribe_youtube(url) -> str` через `yt-dlp` + Whisper или субтитры
- `ingest/freeform.py` — `save_freeform(text) -> str` сохраняет пользовательский ввод
- `scenario/writer.py` — `generate_scenario(context, style, image_style) -> dict` LLM-сценарий и image style prompts
- `render/minimax_client.py` — `generate_image(prompt, output_path, aspect_ratio, seed) -> Path`
- `render/comic_assembler.py` — `assemble_comic(panels, captions, style) -> Path`
- `lib/lifecycle.py` — canonical Python transitions и render gate
- `lib/notion_sync.py` — partial scenario mirror; comic mirror пока placeholder

### Node.js (`web/`, `tg-bot/`, `publisher/`)

- `web/server.js` — secure bootstrap, localhost по умолчанию
- `web/app.js`, `web/routes/`, `web/lib/` — API, access control, lifecycle, jobs и logging
- `tg-bot/bot.js` — Telegraf-бот, авторизованные inline-actions
- `publisher/site.js` — deployment-specific site adapter
- `publisher/social.js` — Twitter/Mastodon placeholders

## Точки входа

```bash
# Ингест + сценарий
python scripts/ingest_and_draft.py --freeform "Идея"
python scripts/ingest_and_draft.py --url "https://..."

# Web UI/API
node web/server.js

# Initial render утверждённого
python scripts/render_approved.py --scenario-id ID

# Публикация rendered queue
node scripts/publish_rendered.js

# Безопасная проверка cron
bash cron/nightly.sh --dry-run
```

## Формат сценария

```json
{
  "id": "uuid",
  "created_at": "ISO-8601",
  "status": "draft|approved|rejected|rendered|published",
  "source": "url|youtube|freeform",
  "source_url": "...",
  "context": "исходный текст",
  "title": "Название комикса",
  "panels": [
    {
      "n": 1,
      "prompt": "...",
      "caption": "..."
    }
  ],
  "style": "star|bubble|gothic|boom|memo|bar",
  "image_style": "cartoon|anime|comic|realistic|watercolor",
  "layout": "comic|grid",
  "aspect_ratio": "16:9",
  "seed": 42,
  "panel_paths": ["data/comics/<id>/panel_1.png"],
  "render_revision": 1
}
```

## Ручное утверждение

1. Telegram принимает действия только от configured `TELEGRAM_CHAT_ID`.
2. Web approval разрешён в local mode или authenticated remote mode.
3. Approve атомарно переводит `draft → approved`; reject — `draft → rejected`.
4. Кнопка «Запросить правку» пока только сохраняет `feedback_recorded`; LLM regeneration — отдельный OpenSpec follow-up.
5. Approval/feedback в текущей реализации не обновляют Notion lifecycle status автоматически.

## Cron-режим

`cron/nightly.sh` предназначен для внешнего schedule. Всегда начинать с `--dry-run`; запуск без флага выполняет реальные render/publication/archive side effects. Nightly publication hardening остаётся отдельной задачей.

## Расширение проекта

Добавлять модули по принципу:
- Новый источник → `py/ingest/<name>.py` с функцией `ingest_X() -> str`
- Новый стиль подписей → `py/render/comic_assembler.py` добавить case в switch
- Новая соцсеть → `publisher/<platform>.js` с экспортом `publish(comic)`
- Новый LLM-провайдер → `py/scenario/writer.py` параметризовать

## Фиксация задач

Когда пользователь говорит **"фиксируем"**, **"фиксация"**, **"зафиксируй"** — выполни процедуру:

1. **Спросить тему задачи** если не ясно
2. **Проверить OpenSpec:** синхронизировать delta specs и архивировать active change, если он есть
3. **Создать аудит:** `summary/audit/<NNN>_<slug>.md`
4. **Создать таски:** `summary/tasks/<NNN>_<slug>.md`
5. **Обновить `CHANGELOG.md`:** добавить в конец краткую запись с ISO-8601 timestamp
6. **Закоммитить:** `git add ... && git commit -m "..." && git push`

Записи в `CHANGELOG.md` ведутся по нарастающей — от ранних к поздним. Не включать секреты и содержимое `.env`.

## НЕ делать

- ❌ Выполнять initial render без persisted approval
- ❌ Изменять или удалять `published` через Web API
- ❌ Публиковать без rendered PNG
- ❌ Менять существующие файлы в `data/archive/`
- ❌ Коммитить `.env`, токены или ключи
- ❌ Запускать live provider calls в mocked test suite