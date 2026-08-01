# PRD: Comic Studio

**Версия:** 1.0  
**Дата:** 2026-08-01  
**Владелец:** Vlad  
**Статус:** Draft → Approved → In Progress  
**Путь проекта:** `~/Projects/comic-studio/`  

---

## Содержание

1. [Problem Statement](#1-problem-statement)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [User Personas](#3-user-personas)
4. [User Stories & Use Cases](#4-user-stories--use-cases)
5. [Solution Overview](#5-solution-overview)
6. [Functional Requirements](#6-functional-requirements)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [Architecture](#8-architecture)
9. [Data Model](#9-data-model)
10. [Workflows](#10-workflows)
11. [Integration Points](#11-integration-points)
12. [UI/UX](#12-uiux)
13. [Observability](#13-observability)
14. [Security & Privacy](#14-security--privacy)
15. [Rollout Plan](#15-rollout-plan)
16. [Risks & Mitigations](#16-risks--mitigations)
17. [Acceptance Criteria](#17-acceptance-criteria)
18. [Open Questions](#18-open-questions)
19. [Glossary](#19-glossary)

---

## 1. Problem Statement

### Контекст

Vlad ведёт блог, делает видео и формирует идеи, которые хочет превращать в короткие визуальные истории для соцсетей и своего сайта. Сейчас процесс ручной:

1. Читает статью / смотрит YouTube / формулирует мысль
2. Открывает MiniMax image-01 вручную, пишет 3-4 промта
3. Скачивает PNG, открывает в редакторе, добавляет подписи
4. Выкладывает на сайт и в соцсети

### Проблема

- **Нет воспроизводимости.** Каждый комикс — это уникальная ручная сессия, нельзя вернуться и повторить удачный вариант.
- **Нет утверждения.** Сценарии нет — сразу генерируются картинки, переделывать дорого.
- **Нет серийности.** Хочется длительный читабельный комикс с recurring персонажами и сквозным сюжетом — но сейчас каждый выпуск изолирован.
- **Нет расписания.** Публикация ad-hoc, нет ночного «комбайна», который сам бы выкатывал серии.
- **Нет зеркала.** Сценарии и выпуски хранятся в голове / в файлах — нет Notion-архива для поиска и повторного использования.

### Воздействие

- ~2-3 часа на один комикс вручную → после автоматизации ≤10 минут на утверждение
- Невозможность вести серию с character-consistency
- Потеря идей между сессиями

---

## 2. Goals & Non-Goals

### Goals (MVP)

| # | Цель | Метрика |
|---|------|---------|
| G1 | Ингест контекста из URL, YouTube, свободного текста | 3 источника работают end-to-end |
| G2 | LLM генерирует сценарий комикса (3-4 панели) | < 60 сек на генерацию |
| G3 | Утверждение сценария через Telegram с inline-кнопками | 3 действия: ✅ / ✏️ / ❌ |
| G4 | Рендер утверждённого сценария в PNG | < 90 сек на 4 панели |
| G5 | Публикация на сайт и (опционально) в соцсети | POST → 200 OK |
| G6 | Cron-режим: ночной выпуск серии без ручного запуска | Работает по `0 2 * * *` |
| G7 | Зеркало в Notion для архива | DB создана, страницы пишутся |
| G8 | UI-дашборд для мониторинга | http://localhost:3000/ui/ |

### Non-Goals (вне MVP)

- ❌ Генерация видео (только статичные PNG)
- ❌ Автоматическое комментирование комиксов
- ❌ Marketplace / публикация сторонних авторов
- ❌ Мобильное приложение
- ❌ Платежи / монетизация
- ❌ Multi-user / командный режим (только один автор)

---

## 3. User Personas

### Primary: Vlad (автор)

- **Контекст:** технически грамотный, ведёт блог + канал, знает Python/JS базово
- **Боль:** хочет быстро превращать идеи в комиксы без потери качества
- **Цель:** серия комиксов 2-3 раза в неделю, минимум ручной работы
- **Устройство:** macOS, Hermes desktop, Telegram

### Secondary: Читатели (аудитория)

- **Контекст:** подписчики блога / канала, читают с телефона
- **Боль:** нет — они потребляют готовый продукт
- **Цель:** интересный контент, чтобы подписаться / поделиться

---

## 4. User Stories & Use Cases

### US-1: Быстрый комикс из статьи

> Как автор, я хочу скинуть URL статьи и получить готовый к утверждению сценарий, чтобы не копировать текст вручную.

**Acceptance:**
- `python scripts/ingest_and_draft.py --url "https://..."` работает
- Сценарий сохранён в `data/scenarios/draft/<id>.json`
- Уведомление в Telegram с inline-кнопками

### US-2: Комикс из YouTube

> Как автор, я хочу скинуть YouTube-ссылку и получить комикс по содержимому видео.

**Acceptance:**
- `--youtube "https://youtu.be/..."` работает
- Если есть субтитры — берутся; иначе — Whisper
- Транскрипт ≤ 30k символов подаётся в LLM

### US-3: Комикс из свободной мысли

> Как автор, я хочу записать идею и получить комикс по ней, без привязки к источнику.

**Acceptance:**
- `--freeform "Идея про пожарного..."` работает
- Текст сохраняется в `data/freeform/` как Markdown
- Сценарий строится из этого текста

### US-4: Утверждение сценария

> Как автор, я хочу утвердить / отклонить сценарий одним нажатием в Telegram.

**Acceptance:**
- Inline-кнопки: ✅ Утвердить / ✏️ Редактировать / ❌ Отклонить
- Утверждённый → `data/scenarios/approved/`
- Отклонённый → `data/scenarios/rejected/`
- Правка → сохранение feedback в JSON, обновление промтов

### US-5: Ночной выпуск серии

> Как автор, я хочу, чтобы раз в день автоматически выкатывалось N комиксов.

**Acceptance:**
- `cron/nightly.sh` запускается по расписанию
- Берёт N (default 3) утверждённых сценариев
- Рендерит, публикует, архивирует, уведомляет

### US-6: Мониторинг через UI

> Как автор, я хочу видеть в браузере, что происходит: черновики, утверждённые, готовые.

**Acceptance:**
- http://localhost:3000/ui/ открывается
- 4 вкладки: draft / approved / rendered / comics
- Кнопки утверждения / отклонения в draft
- Live-обновление каждые 10 сек

### US-7: Character consistency в серии

> Как автор, я хочу, чтобы в серии комиксов был один и тот же персонаж.

**Acceptance:**
- `--character-ref path/to/ref.jpg` работает
- Все панели используют `subject_reference` в API
- Лицо / одежда / стиль сохраняются между выпусками

### US-8: Архив в Notion

> Как автор, я хочу видеть все сценарии и выпуски в Notion для поиска.

**Acceptance:**
- При создании сценария → страница в `NOTION_SCENARIOS_DB`
- При публикации → страница в `NOTION_COMICS_DB`
- Без токена — no-op (не ломает pipeline)

---

## 5. Solution Overview

### Концепция

**Конвейер:** `источник → сценарий → утверждение → рендер → публикация → архив`

```
┌─────────────┐   ┌─────────────┐   ┌──────────────┐   ┌─────────────┐
│  Ingest     │ → │  Scenario   │ → │  Approve     │ → │   Render    │
│  (Python)   │   │  (LLM)      │   │  (Telegram)  │   │  (MiniMax)  │
└─────────────┘   └─────────────┘   └──────────────┘   └─────────────┘
                                                                  │
                                                                  ↓
┌─────────────┐   ┌─────────────┐   ┌──────────────┐   ┌─────────────┐
│  Archive    │ ← │  Publish    │ ← │  Notion      │ ← │  UI Dashboard│
│             │   │  (Node)     │   │  Mirror      │   │             │
└─────────────┘   └─────────────┘   └──────────────┘   └─────────────┘
```

### Технологический стек

| Слой | Технология | Почему |
|------|------------|--------|
| Парсинг / рендер | Python 3.11+ | requests, BeautifulSoup, Pillow, openai-whisper |
| Сценарий / image | MiniMax Text-01 + image-01 | Один провайдер, низкая цена, качество |
| Утверждение | Node.js + Telegraf | async/await, простые inline-кнопки |
| API + статика | Node.js + Express | Минимальный boilerplate |
| UI | Vanilla HTML/CSS/JS | Без зависимостей, без сборки |
| Публикация | Node.js fetch | Встроено в Node 18+ |
| Cron | bash + Hermes cron | Простота, читаемость |
| Хранилище | JSON на диске + Notion mirror | Человекочитаемость + поиск |

### Почему не чисто-Python или чисто-Node

- **Python** — лучшая экосистема для парсинга, ML/LLM, Pillow
- **Node.js** — лучшая экосистема для Telegram-ботов (Telegraf), быстрые CLI-обёртки
- **Vanilla HTML/CSS/JS** — UI без зависимостей, деплой одной строкой

---

## 6. Functional Requirements

### FR-1: Ингест контекста

| ID | Требование | Приоритет |
|----|------------|-----------|
| FR-1.1 | Парсинг веб-страницы: `<main>` или `<article>`, удаление скриптов/стилей | P0 |
| FR-1.2 | YouTube: авто-субтитры (приоритет), fallback на Whisper | P0 |
| FR-1.3 | Свободный текст: сохранение в `data/freeform/<ts>-<title>.md` | P0 |
| FR-1.4 | Ограничение длины контекста ≤ 8k символов для LLM | P1 |
| FR-1.5 | Retry с exponential backoff для сетевых ошибок | P2 |

### FR-2: Генерация сценария

| ID | Требование | Приоритет |
|----|------------|-----------|
| FR-2.1 | LLM получает контекст → JSON со структурой (title, panels, style) | P0 |
| FR-2.2 | 3 или 4 панели (конфигурируемо через `--panels`) | P0 |
| FR-2.3 | Промты на английском (image-01 лучше работает с EN) | P0 |
| FR-2.4 | Подписи ≤ 6 слов | P0 |
| FR-5 обязательных полей: | `id, created_at, status, source, panels` | P0 |
| FR-2.6 | Сохранение в `data/scenarios/draft/<id>.json` | P0 |
| FR-2.7 | Notion mirror (если задан токен) | P2 |

### FR-3: Утверждение через Telegram

| ID | Требование | Приоритет |
|----|------------|-----------|
| FR-3.1 | Inline-кнопки: ✅ Утвердить / ✏️ Редактировать / ❌ Отклонить | P0 |
| FR-3.2 | Команда `/pending` — список черновиков | P1 |
| FR-3.3 | Отправка ID → показ сценария с кнопками | P0 |
| FR-3.4 | Команда `/edit <id> <feedback>` — сохранение правок | P1 |
| FR-3.5 | Кнопка 🚀 Опубликовать для rendered-сценариев | P2 |
| FR-3.6 | Уведомления о nightly-run | P2 |

### FR-4: Рендер

| ID | Требование | Приоритет |
|----|------------|-----------|
| FR-4.1 | Параллельная генерация панелей (≤4 workers) | P0 |
| FR-4.2 | Сохранение отдельных `panel_<n>.png` для отладки | P2 |
| FR-4.3 | Сборка финального комикса через Pillow + minimax-comic skill | P0 |
| FR-4.4 | Поддержка 6 стилей подписей: star/bubble/gothic/boom/memo/bar | P0 |
| FR-4.5 | Character reference через `subject_reference` в API | P1 |
| FR-4.6 | Идемпотентность через `--seed` | P1 |
| FR-4.7 | Обновление статуса `draft → approved → rendered` | P0 |

### FR-5: Публикация

| ID | Требование | Приоритет |
|----|------------|-----------|
| FR-5.1 | POST на сайт (JSON с base64 PNG) | P0 |
| FR-5.2 | Опциональный постинг в Twitter/X | P2 |
| FR-5.3 | Опциональный постинг в Mastodon | P2 |
| FR-5.4 | Обновление статуса → `published` | P0 |
| FR-5.5 | Логирование URL публикации | P1 |

### FR-6: Cron-режим

| ID | Требование | Приоритет |
|----|------------|-----------|
| FR-6.1 | `cron/nightly.sh` запускается по `0 2 * * *` | P0 |
| FR-6.2 | Берёт N (default 3) утверждённых сценариев | P0 |
| FR-6.3 | Рендер → публикация → архив → уведомление | P0 |
| FR-6.4 | Параметр `CRON_BATCH_SIZE` через `.env` | P1 |
| FR-6.5 | Обработка ошибок: не падать, если один сценарий не рендерится | P0 |

### FR-7: UI Dashboard

| ID | Требование | Приоритет |
|----|------------|-----------|
| FR-7.1 | 4 вкладки: draft / approved / rendered / comics | P0 |
| FR-7.2 | Inline-кнопки утверждения в draft | P0 |
| FR-7.3 | Превью готовых PNG | P0 |
| FR-7.4 | Live-обновление каждые 10 сек | P2 |
| FR-7.5 | Адаптивная сетка карточек | P1 |

---

## 7. Non-Functional Requirements

| Категория | Требование |
|-----------|------------|
| **Performance** | Генерация сценария < 60 сек; рендер 4 панелей < 90 сек параллельно |
| **Reliability** | Pipeline не падает при ошибке одного сценария; retry с exponential backoff для API |
| **Idempotency** | `--seed` + сценарный `id` обеспечивают повторяемость |
| **Observability** | Логи в `data/logs/<date>.log`; уведомления в Telegram о nightly-run |
| **Security** | `.env` в `.gitignore`; ключи только через переменные окружения |
| **Maintainability** | Каждый модуль имеет docstring + CLI-режим (`if __name__ == "__main__"`) |
| **Extensibility** | Новый источник = `py/ingest/<name>.py`; новый стиль = case в `_comic_lib.py` |
| **Cost** | ≤ $0.10 на один комикс (4 панели × image-01) |

---

## 8. Architecture

### Слои

```
┌──────────────────────────────────────────────────────┐
│ UI Layer (vanilla HTML/CSS/JS)                       │
│ → http://localhost:3000/ui/                         │
└──────────────────┬───────────────────────────────────┘
                   ↓ HTTP
┌──────────────────────────────────────────────────────┐
│ Web Layer (Node.js Express)                          │
│ → /api/scenarios, /api/comics, /api/scenarios/:id/*  │
└──────────────────┬───────────────────────────────────┘
                   ↓ file system + Telegram
┌──────────────────────────────────────────────────────┐
│ Telegram Bot (Telegraf)                              │
│ → inline-кнопки, edit feedback                       │
└──────────────────┬───────────────────────────────────┘
                   ↓ file system
┌──────────────────────────────────────────────────────┐
│ Python Layer                                         │
│ ingest → scenario → render                           │
│ → MiniMax API (text + image)                         │
│ → minimax-comic skill (сборка)                       │
└──────────────────┬───────────────────────────────────┘
                   ↓ file system + HTTP
┌──────────────────────────────────────────────────────┐
│ Publisher (Node.js)                                  │
│ → site.js (POST JSON+base64)                         │
│ → social.js (Twitter/Mastodon stubs)                 │
└──────────────────┬───────────────────────────────────┘
                   ↓ HTTP
┌──────────────────────────────────────────────────────┐
│ External Systems                                     │
│ → MiniMax API / Telegram / Notion / Site / Social    │
└──────────────────────────────────────────────────────┘
```

### Модули

| Модуль | Файл | Ответственность |
|--------|------|-----------------|
| Config | `py/lib/config.py` | `.env`, пути, логгеры |
| Ingest URL | `py/ingest/url.py` | `fetch_url(url) → str` |
| Ingest YouTube | `py/ingest/youtube.py` | `transcribe_youtube(url) → str` |
| Ingest Freeform | `py/ingest/freeform.py` | `save_freeform(text) → id` |
| Scenario Writer | `py/scenario/writer.py` | `generate_scenario(ctx) → dict` |
| MiniMax Client | `py/render/minimax_client.py` | `generate_image(prompt) → bytes` |
| Comic Assembler | `py/render/comic_assembler.py` | `assemble_comic(panels) → path` |
| Notion Sync | `py/lib/notion_sync.py` | `sync_scenario(sc) → page_id` |
| Web Server | `web/server.js` | CRUD API + статика |
| TG Bot | `tg-bot/bot.js` | Inline-кнопки + команды |
| Publisher Site | `publisher/site.js` | `publish(path, meta) → url` |
| Publisher Social | `publisher/social.js` | Twitter/Mastodon stubs |
| UI Dashboard | `ui/index.html, app.js, style.css` | 4 вкладки + live-refresh |
| Cron | `cron/nightly.sh` | render → publish → archive |
| Scripts | `scripts/ingest_and_draft.py`, `scripts/render_approved.py`, `scripts/publish_rendered.js`, `scripts/notify_telegram.js` | Оркестрация |

### Зависимости

```
ingest ──→ scenario ──→ tg-bot ──→ render ──→ publisher
                                ↘            ↗
                                Notion   cron
                                    ↘   ↗
                                  archive
```

---

## 9. Data Model

### Scenario JSON

```json
{
  "id": "abc12345",
  "created_at": "2026-08-01T11:25:00Z",
  "status": "draft|approved|rejected|rendered|published",
  "source": "url|youtube|freeform|file",
  "source_url": "https://...",
  "source_path": "/path/to/file",
  "context": "Первые 2000 символов исходного текста",
  "title": "Название комикса",
  "tone": "epic|funny|educational|dark|whimsical",
  "style": "star|bubble|gothic|boom|memo|bar",
  "layout": "comic|grid",
  "aspect_ratio": "16:9",
  "seed": 42,
  "panels": [
    {
      "n": 1,
      "prompt": "Детальное описание сцены на английском, ≤1500 chars",
      "caption": "Короткая подпись на русском",
      "image_path": "data/comics/abc12345/panel_1.png"
    }
  ],
  "feedback": [
    { "ts": "ISO-8601", "text": "правка пользователя" }
  ],
  "comic_path": "data/comics/abc12345.png",
  "published_at": "ISO-8601",
  "notion_page_id": "..."
}
```

### File System Layout

```
data/
├── scenarios/
│   ├── draft/        # status=draft, ждут утверждения
│   ├── approved/     # status=approved, ждут рендера
│   ├── rejected/     # status=rejected, для истории
│   └── rendered/     # status=rendered или published
├── comics/
│   ├── <id>.png           # финальный комикс
│   ├── <id>/panel_*.png   # отдельные панели
│   └── raw/<id>.png       # копия для debug
├── archive/
│   └── YYYY-MM-DD/        # иммутабельный архив выпусков
├── logs/
│   └── YYYY-MM-DD.log
└── freeform/
    └── YYYY-MM-DD-HH-MM-SS-<title>.md
```

### State Machine

```
       ┌──────┐
       │ draft│
       └──┬───┘
          │ ✅ approve
          ↓
       ┌─────────┐
       │approved │ ──→ render ──→ ┌─────────┐
       └─────────┘                │ rendered│ ──→ publish ──→ ┌──────────┐
                                  └─────────┘                  │ published│
                                                               └──────────┘
          │ ✏️ edit (остаётся в draft с feedback)
          ↓
       (back to draft with feedback array)

          │ ❌ reject
          ↓
       ┌─────────┐
       │rejected │ (immutable)
       └─────────┘
```

---

## 10. Workflows

### W-1: Одиночный комикс (3 панели, утренний запуск)

```bash
# 1. Ингест + сценарий
python scripts/ingest_and_draft.py \
  --url "https://blog.example.com/article" \
  --tone funny --panels 3

# 2. Утверждение в Telegram
# Бот: "Новый сценарий: ..." + кнопки
# Пользователь: ✅ Утвердить

# 3. Рендер
python scripts/render_approved.py --scenario-id abc12345

# 4. Публикация
node scripts/publish_rendered.js

# 5. Архивация (автоматически)
```

### W-2: Character-consistent серия

```bash
# 1. Сгенерировать character reference
python scripts/create_image_minimax.py \
  "Чистое фронтальное портретное фото девушки-пожарного в шлеме, советская эпоха" \
  --aspect-ratio 1:1

# → character_ref.jpeg

# 2. Создать 5 выпусков серии
for episode in 1 2 3 4 5; do
  python scripts/ingest_and_draft.py \
    --freeform "Серия про пожарного, эпизод $episode: спасает котёнка из дерева" \
    --panels 4 --style star
done

# 3. Утвердить все в Telegram (или bulk approve в UI)

# 4. Рендер с character reference
# (требует доработки render_approved.py для передачи --character-ref)

# 5. Cron выпускает по 1 в день
```

### W-3: Ночной выпуск

```
02:00 → cron/nightly.sh
        ├── render_approved.py --all  (≤4 параллельно)
        ├── publish_rendered.js       (site + social)
        ├── archive в data/archive/2026-08-02/
        └── notify_telegram.js "✅ Nightly run finished"
```

### W-4: Быстрый freeform

```bash
# Одна команда от идеи до рендера
python scripts/ingest_and_draft.py \
  --freeform "Идея: скилл minimax-comic — это как голливудский художник в терминале"

# → черновик в data/scenarios/draft/

# Утверждение в TG → утверждён

# Рендер вручную или через cron
python scripts/render_approved.py --scenario-id <id>
```

---

## 11. Integration Points

### 11.1 MiniMax API

- **Endpoint:** `POST {MINIMAX_BASE_URL}/v1/image_generation`
- **Headers:** `Authorization: Bearer ${MINIMAX_API_KEY}`
- **Payload:** `{ model: "image-01", prompt, aspect_ratio, n: 1, response_format: "base64", prompt_optimizer: true, seed?, subject_reference? }`
- **Errors:** HTTP 200 + `base_resp.status_code ≠ 0` (1002=quota, 1004=auth, 1011=policy)

### 11.2 Telegram Bot API (Telegraf)

- **Bot:** `@<bot_username>` (создаётся через @BotFather)
- **Token:** `TELEGRAM_BOT_TOKEN` в `.env`
- **Chat ID:** `TELEGRAM_CHAT_ID` (по умолчанию 1045621572)
- **Webhook mode:** polling (для простоты)
- **Commands:** `/pending`, `/edit <id> <feedback>`, прямой ID для превью
- **Inline-кнопки:** `Markup.button.callback(...)`

### 11.3 Notion API

- **Endpoint:** `POST https://api.notion.com/v1/pages`
- **Headers:** `Authorization: Bearer ${NOTION_TOKEN}`, `Notion-Version: 2022-06-28`
- **Databases:** `NOTION_SCENARIOS_DB`, `NOTION_COMICS_DB`
- **Mode:** no-op если токен не задан

### 11.4 Site (custom)

- **Endpoint:** `${SITE_API_URL}` (задаётся владельцем)
- **Method:** POST JSON `{ title, image_base64, meta }`
- **Auth:** Bearer token через `SITE_API_KEY` (опционально)
- **Response:** `{ url: "https://..." }`

### 11.5 Соцсети (опционально)

- **Twitter/X:** bearer token + media upload (TODO)
- **Mastodon:** instance URL + access token + media upload (TODO)
- **Mode:** stubs в `publisher/social.js`, активируются при наличии ключей

---

## 12. UI/UX

### Главный дашборд

```
┌─────────────────────────────────────────────────────────┐
│ 🎨 Comic Studio          [Черновики] [Утверждённые] [...│
├─────────────────────────────────────────────────────────┤
│ 📋 Черновики на утверждении                             │
│                                                         │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│ │ Card 1   │ │ Card 2   │ │ Card 3   │                │
│ │ Title    │ │ Title    │ │ Title    │                │
│ │ tone|tag │ │ tone|tag │ │ tone|tag │                │
│ │ panels   │ │ panels   │ │ panels   │                │
│ │ [✅][❌]  │ │ [✅][❌]  │ │ [✅][❌]  │                │
│ └──────────┘ └──────────┘ └──────────┘                │
└─────────────────────────────────────────────────────────┘
```

### Карточка сценария (draft)

```
┌────────────────────────────┐
│ Chernobyl Inferno          │ ← title
│ [epic][star] abc12345      │ ← tone, style, id
│ 1. 23:43 — СМЕНА          │
│ 2. AZ-5 — АВАРИЙНАЯ       │ ← captions
│ 3. 01:23 — ИНФЕРНО        │
│                            │
│ [✅ Утвердить] [❌ Отклонить] │
└────────────────────────────┘
```

### Карточка готового комикса

```
┌────────────────────────────┐
│ [PNG превью]               │
│ abc12345.png               │
└────────────────────────────┘
```

### Цветовая схема

```
--bg:      #0e0e10  (тёмный фон)
--panel:   #1a1a1d  (карточки)
--accent:  #ff6b35  (оранжевый акцент)
--accent2: #ffd166  (золотой для star)
--green:   #06d6a0  (✅ утвердить)
--red:     #ef476f  (❌ отклонить)
```

### Telegram UX

- Сообщение: Markdown с заголовком, тоном, стилем, captions
- Inline-клавиатура: 2 ряда кнопок (✅✏️ / ❌)
- Edit mode: ответ на кнопку ✏️ → ожидание текста

---

## 13. Observability

### Логирование

- **Формат:** `%(asctime)s [%(levelname)s] %(name)s: %(message)s`
- **Файл:** `data/logs/<YYYY-MM-DD>.log`
- **Ротация:** один файл в день (для MVP достаточно)
- **Stdout:** да, для cron-режима

### Метрики (в разработке)

- Количество утверждённых / отклонённых сценариев в день
- Среднее время генерации сценария / рендера
- Стоимость API за период

### Уведомления

- **Telegram:** nightly-run summary, ошибки рендера
- **Notion:** все сценарии и выпуски (опционально)

---

## 14. Security & Privacy

| Аспект | Решение |
|--------|---------|
| API ключи | Только в `.env`, никогда в git |
| `.env` в git | `.gitignore` исключает |
| Telegram chat ID | Хардкод для личного использования (1045621572) |
| Внешний сайт | Bearer token через `.env` |
| Notion | Bearer token через `.env` |
| Логи | Не содержат ключей и токенов |
| Backup | `data/archive/` — иммутабельный, версионируется отдельно |

---

## 15. Rollout Plan

### Phase 0: MVP (текущая итерация)

- ✅ Структура проекта
- ✅ Ingest URL / YouTube / freeform
- ✅ Scenario writer через MiniMax Text-01
- ✅ Telegram-бот с inline-кнопками
- ✅ Рендер через MiniMax image-01 + minimax-comic skill
- ✅ UI дашборд
- ✅ Базовый cron
- ⏳ Publisher (stubs, требует конфигурации SITE_API_URL)
- ⏳ Notion mirror (работает, требует токен)

### Phase 1: Stabilization (1-2 недели)

- E2E тест полного цикла ingest → publish
- Retry/backoff для всех API-вызовов
- Обработка edge cases: пустой контекст, длинные YouTube, превышение квоты
- Логирование в Notion (отдельная DB для логов)

### Phase 2: Series & Characters (3-4 недели)

- Character consistency через subject_reference
- Bulk approve в UI
- Эпизодический режим: связать сценарии через `series_id`
- Шаблоны стилей (сохранять удачные seed + промты)

### Phase 3: Public Beta (по готовности)

- Multi-user support (отдельный Telegram-бот на каждого автора)
- Marketplace готовых сценариев
- A/B тесты подписей и стилей
- Интеграция с дополнительными LLM (Claude, GPT-4)

---

## 16. Risks & Mitigations

| Риск | Вероятность | Воздействие | Митигация |
|------|-------------|-------------|-----------|
| MiniMax API квота исчерпана | Средняя | Высокое | Retry с backoff, fallback на другой провайдер |
| Длинный YouTube (1+ час) таймаут Whisper | Средняя | Среднее | Ограничение 30 мин, summary через LLM |
| Telegram-бот упал | Низкая | Высокое | Healthcheck через cron, автоперезапуск |
| Промт нарушает content policy | Низкая | Среднее | Предварительная модерация через LLM |
| Потеря утверждённых сценариев | Низкая | Высокое | Git-версионирование `data/scenarios/approved/`, бэкап |
| Цена image-01 вырастет | Низкая | Среднее | Мониторинг стоимости, опциональный fallback |
| Несовместимость minimax-comic skill | Низкая | Среднее | Fallback на простую grid-сборку в `py/render/comic_assembler.py` |
| Конкуренты копируют стиль | Низкая | Низкое | Character consistency + уникальные промты |

---

## 17. Acceptance Criteria

### AC-1: Smoke Test (MVP готов)

- [ ] Структура `~/Projects/comic-studio/` существует со всеми файлами
- [ ] `python scripts/ingest_and_draft.py --help` работает без ошибок
- [ ] `python -m py.lib.config` показывает корректные пути
- [ ] `node web/server.js` стартует на порту 3000
- [ ] `node tg-bot/bot.js` подключается к Telegram API
- [ ] `bash -n cron/nightly.sh` проходит без ошибок
- [ ] `bash cron/nightly.sh --dry-run` (когда добавлен) показывает план

### AC-2: End-to-End

- [ ] URL → сценарий за ≤ 60 сек
- [ ] Telegram утверждение → файл перемещается в `approved/`
- [ ] Рендер утверждённого → PNG за ≤ 90 сек
- [ ] Публикация на сайт → 200 OK
- [ ] Архивация → файлы в `data/archive/<date>/`

### AC-3: Reliability

- [ ] Падение одного сценария в cron не останавливает batch
- [ ] Нет потери данных при kill -9 во время рендера
- [ ] Все сетевые вызовы имеют timeout
- [ ] Retry при 5xx ошибках MiniMax API

### AC-4: UX

- [ ] Дашборд открывается в браузере без ошибок в console
- [ ] Inline-кнопки в Telegram работают с первого раза
- [ ] Команда `/pending` показывает все черновики
- [ ] Логи читаемы (один формат, понятные имена логгеров)

### AC-5: Security

- [ ] `.env` отсутствует в `git status`
- [ ] Никакие ключи не светятся в логах
- [ ] `data/archive/` доступен только на чтение (опционально)

---

## 18. Open Questions

| # | Вопрос | Требует решения до |
|---|--------|---------------------|
| OQ-1 | Какой формат API у сайта публикации? (REST/GraphQL, JSON/form-data) | Phase 1 |
| OQ-2 | Нужна ли интеграция с конкретными соцсетями (X, LinkedIn, Telegram-канал)? | Phase 1 |
| OQ-3 | Как версионировать серии (по дате / по эпизоду / по slug)? | Phase 2 |
| OQ-4 | Как хранить character reference (URL на Notion / локальный файл)? | Phase 2 |
| OQ-5 | Как тарифицировать для multi-user в будущем? | Phase 3 |
| OQ-6 | Нужно ли A/B тестирование подписей? | Phase 3 |

---

## 19. Glossary

| Термин | Определение |
|--------|-------------|
| **Comic** | PNG из 3-4 панелей с подписями в одном из 6 стилей |
| **Scenario** | JSON со структурой комикса до рендера |
| **Panel** | Одна сцена в комиксе |
| **Caption** | Короткая подпись на панели |
| **Style** | Визуальный стиль подписи (star/bubble/gothic/boom/memo/bar) |
| **Tone** | Настроение комикса (epic/funny/educational/dark/whimsical) |
| **Layout** | Расположение панелей (comic — асимметричное, grid — равномерное) |
| **Ingest** | Преобразование контекста в чистый текст |
| **Render** | Генерация PNG из промта через image-01 |
| **Assemble** | Сборка финального PNG из панелей + подписей |
| **Approve** | Утверждение сценария через Telegram |
| **Publish** | Публикация готового PNG на сайт и в соцсети |
| **Archive** | Иммутабельное хранилище выпусков по дате |
| **Mirror** | Зеркало данных в Notion для поиска |
| **Cron** | Регулярный запуск pipeline по расписанию |
| **MVP** | Minimum Viable Product — Phase 0 |
| **Phase** | Итерация развития (0 → 1 → 2 → 3) |

---

## Приложение A: Соответствие требований → реализация

| Требование | Реализация | Файл |
|------------|------------|------|
| FR-1.1 Парсинг URL | `fetch_url` с BeautifulSoup | `py/ingest/url.py` |
| FR-1.2 YouTube | `transcribe_youtube` с yt-dlp + Whisper | `py/ingest/youtube.py` |
| FR-1.3 Freeform | `save_freeform` | `py/ingest/freeform.py` |
| FR-2.1 LLM → JSON | `generate_scenario` с MiniMax Text-01 | `py/scenario/writer.py` |
| FR-3.1 Inline-кнопки | Telegraf `Markup.button.callback` | `tg-bot/bot.js` |
| FR-4.1 Параллельный рендер | `ThreadPoolExecutor(max_workers=4)` | `scripts/render_approved.py` |
| FR-4.3 Pillow сборка | `_comic_lib.assemble` из minimax-comic | `py/render/comic_assembler.py` |
| FR-5.1 POST на сайт | `fetch(SITE_API_URL, POST, JSON)` | `publisher/site.js` |
| FR-6.1 Nightly cron | `bash cron/nightly.sh` + Hermes cron | `cron/nightly.sh` |
| FR-7.1 UI 4 вкладки | `index.html` + `app.js` | `ui/index.html`, `ui/app.js` |

---

## Приложение B: Метрики успеха

| Метрика | Baseline | Цель |
|---------|----------|------|
| Время на один комикс (ручное) | 2-3 часа | ≤ 10 мин (только утверждение) |
| Стоимость одного комикса | ~$0.20 (image-01) | ≤ $0.10 (оптимизация промтов) |
| Утверждаемость сценариев (1 - rejected/total) | n/a | ≥ 70% |
| Время простоя pipeline (cron → publish) | n/a | ≤ 5 мин |
| Количество выпусков в неделю | 1-2 | 3-5 |

---

*Документ создан: 2026-08-01*  
*Следующая ревизия: после Phase 1 (стабилизация)*