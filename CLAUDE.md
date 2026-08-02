# CLAUDE.md — Инструкции для AI-агента

## Проект: Comic Studio

Конвейер для производства серийных комиксов. Работает в режиме: контекст → сценарий → утверждение → рендер → публикация.

## Ключевые правила

1. **Никогда не рендерить комикс без утверждения.** Сценарий должен быть одобрен через Telegram-бота (chat_id 1045621572).
2. **Всегда проверять наличие утверждения.** Перед запуском `render` прочитать `data/scenarios/approved/` или статус в Notion.
3. **Идемпотентность.** Использовать `--id` или `--seed` для повторяемых прогонов.
4. **Логировать всё.** Каждый шаг пишет в `data/logs/YYYY-MM-DD.log`.

## Структура модулей

### Python (`py/`)

- `ingest/url.py` — `fetch_url(url) -> str` извлекает текст статьи
- `ingest/youtube.py` — `transcribe_youtube(url) -> str` через `yt-dlp` + Whisper или субтитры
- `ingest/freeform.py` — `save_freeform(text) -> str` сохраняет пользовательский ввод
- `scenario/writer.py` — `generate_scenario(context, style) -> dict` LLM-сценарий
- `prompt/builder.py` — `build_panel_prompts(scenario) -> list[str]` промты для image-01
- `render/minimax_client.py` — `generate_image(prompt, aspect_ratio) -> bytes`
- `render/comic_assembler.py` — `assemble_comic(panels, captions, style) -> path`
- `lib/notion_sync.py` — `sync_scenario(scenario)`, `sync_comic(comic)`

### Node.js (`web/`, `tg-bot/`, `publisher/`)

- `web/server.js` — Express API на порту 3000
- `tg-bot/bot.js` — Telegraf-бот, обработка inline-кнопок
- `publisher/site.js` — POST на сайт, загрузка PNG
- `publisher/social.js` — постинг в Twitter/Mastodon

## Точки входа

```bash
# Ингест + сценарий
python scripts/ingest_and_draft.py --source "URL или текст"

# Рендер утверждённого
python scripts/render_approved.py --scenario-id ID

# Публикация
node publisher/publish.js --comic-path PATH

# Полный цикл (cron)
bash cron/nightly.sh
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
      "caption": "...",
      "image_path": "data/comics/panel_1.png"
    }
  ],
  "style": "star|bubble|gothic|boom|memo|bar",
  "layout": "comic|grid",
  "aspect_ratio": "16:9",
  "seed": 42
}
```

## Утверждение через Telegram

1. Бот получает inline-кнопки: ✅ Утвердить / ✏️ Редактировать / ❌ Отклонить
2. На "утвердить" → переносит в `data/scenarios/approved/`, обновляет статус в Notion
3. На "редактировать" → ждёт свободный текст с правками
4. На "отклонить" → переносит в `data/scenarios/rejected/`

## Cron-режим

`cron/nightly.sh` запускается по расписанию (через Hermes cron или системный crontab):
1. Берёт N утверждённых сценариев (по `CRON_BATCH_SIZE`)
2. Рендерит каждый
3. Публикует на сайт + соцсети
4. Переносит в `data/archive/YYYY-MM-DD/`
5. Уведомляет в Telegram

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

- ❌ Рендерить без утверждения
- ❌ Публиковать без рендера (только превью)
- ❌ Менять `data/archive/` (только чтение)
- ❌ Коммитить `.env` или ключи