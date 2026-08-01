# Архитектура Comic Studio

## Цель

Серийное производство коротких комиксов (3-4 панели) с утверждением через Telegram и автоматической публикацией через cron.

## Слои

### 1. Ингест (Python, `py/ingest/`)
Преобразует произвольный контекст в чистый текст:
- `url.py` — парсинг веб-страниц
- `youtube.py` — субтитры или Whisper
- `freeform.py` — пользовательский текст

### 2. Сценарий (Python + LLM, `py/scenario/writer.py`)
LLM получает контекст → возвращает JSON со структурой:
```json
{
  "title": "...",
  "panels": [{"n": 1, "prompt": "...", "caption": "..."}],
  "style": "star|bubble|gothic|boom|memo|bar",
  "tone": "epic|funny|educational|...",
  "layout": "comic|grid"
}
```

### 3. Утверждение (Telegram-бот, `tg-bot/bot.js`)
Inline-кнопки: ✅ Утвердить / ✏️ Редактировать / ❌ Отклонить.
Состояние в файлах `data/scenarios/<status>/<id>.json`.

### 4. Рендер (Python, `py/render/`)
- `minimax_client.py` — HTTP к image-01, параллельные панели
- `comic_assembler.py` — Pillow сборка + подписи (через minimax-comic skill)

### 5. Публикация (Node.js, `publisher/`)
- `site.js` — POST на сайт (JSON с base64)
- `social.js` — Twitter / Mastodon

### 6. Cron (`cron/nightly.sh`)
Каждый день в 02:00: рендер утверждённых → публикация → архив → уведомление.

## Состояние сценария

```
draft → approved → rendered → published
            ↓
        rejected
```

## Расширяемость

| Добавить | Файл |
|----------|------|
| Новый источник контекста | `py/ingest/<source>.py` |
| Новый стиль подписей | `_comic_lib.py` (в minimax-comic skill) |
| Новая соцсеть | `publisher/<platform>.js` |
| Новый LLM-провайдер | `py/scenario/writer.py` параметризовать |
| Новый сайт публикации | `publisher/site.js` или создать `publisher/<site>.js` |

## Зависимости от внешних систем

| Сервис | Где | Что без него работает |
|--------|-----|----------------------|
| MiniMax API | ключ в `.env` | Не работает (нужен для image и LLM) |
| Telegram bot | токен в `.env` | Сценарии не утверждаются |
| Notion | токен в `.env` | Опционально (mirror отключается) |
| Сайт | URL в `.env` | Публикация пропускается |
| Соцсети | токены в `.env` | Опционально |
| Cron | системный crontab или Hermes cron | Nightly-режим не работает |