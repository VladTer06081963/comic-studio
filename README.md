# Comic Studio

Конвейер производства коротких комиксов:

```text
контекст → draft → ручное approval → render job → rendered → publication
```

Сценарии хранятся как JSON на диске. Утверждение доступно через авторизованный Telegram-бот или локальный/авторизованный Web UI. `published` records считаются неизменяемыми.

## Основные компоненты

| Компонент | Назначение |
|---|---|
| `py/ingest/` | URL, YouTube и freeform ingest |
| `py/scenario/` | MiniMax LLM-сценарий и image style prompts |
| `py/render/` | MiniMax image-01 и Pillow assembly |
| `py/lib/` | Config, lifecycle, logging и частичный Notion mirror |
| `web/` | Hardened Express API, jobs, lifecycle и static UI |
| `ui/` | Vanilla dashboard |
| `tg-bot/` | Telegram approval и управление |
| `publisher/` | Site adapter; social adapters пока placeholders |
| `cron/` | Nightly orchestration |

## Быстрый старт

```bash
cd ~/Projects/comic-studio

# Python
python3 -m venv .venv
source .venv/bin/activate
pip install -r py/requirements.txt

# Node
cd web && npm install && cd ..
cd tg-bot && npm install && cd ..

# Конфигурация
cp .env.example .env
# Минимум для генерации: MINIMAX_API_KEY
```

### Создать draft

```bash
python scripts/ingest_and_draft.py --freeform "Идея комикса"
python scripts/ingest_and_draft.py --url "https://example.com/article"
python scripts/ingest_and_draft.py --youtube "https://youtu.be/..."
```

Полезные параметры:

```text
--image-style cartoon|anime|comic|realistic|watercolor
--style bubble|star|gothic|boom|memo|bar
--panels 3|4
--seed N
```

### Запустить Web UI

```bash
node web/server.js
# http://127.0.0.1:3000/ui/
```

По умолчанию server слушает только `127.0.0.1` и принимает same-origin API requests. Для remote mode одновременно обязательны `WEB_API_TOKEN` и `WEB_ALLOWED_ORIGINS`; подробности — в [`docs/api.md`](docs/api.md).

### Утвердить

Draft можно утвердить вручную:

- в Telegram из разрешённого `TELEGRAM_CHAT_ID`;
- в локальном или bearer-authenticated Web UI.

Наличие persisted approval обязательно перед initial render.

### Render

```bash
python scripts/render_approved.py --scenario-id abc12345
python scripts/render_approved.py --all
```

Web API запускает render как durable job. Для `rendered` поддерживается только явный staging rerender. `published` через Web API не изменяется и не рендерится повторно.

### Безопасный cron test

```bash
bash cron/nightly.sh --dry-run
```

Команда без `--dry-run` выполняет реальные side effects.

## Transitional feedback

Кнопка **«Запросить правку»** пока сохраняет revision request в `scenario.feedback[]`, но не запускает LLM-регенерацию. Настоящее редактирование и remix опубликованного контента запланированы в [`docs/roadmap.md`](docs/roadmap.md).

## Публикация

```bash
node scripts/publish_rendered.js
```

Текущее состояние интеграций:

- custom site adapter требует `SITE_API_URL`;
- Twitter/X и Mastodon являются placeholders;
- Notion scenario mirror частичный;
- Notion comic mirror не реализован.

Не следует считать эти optional integrations завершёнными без deployment-specific проверки.

## Данные

```text
data/
├── scenarios/
│   ├── draft/
│   ├── approved/
│   ├── rejected/
│   ├── rendered/
│   └── published/
├── comics/
│   ├── <id>.png
│   ├── <id>/panel_*.png
│   └── raw/<id>.png
├── jobs/                 # Web render jobs
├── .staging/             # candidate rerenders
├── .trash/               # recoverable deletes
├── freeform/
├── logs/YYYY-MM-DD.log
└── archive/YYYY-MM-DD/   # existing content immutable
```

## Проверки

```bash
cd web && npm test && cd ..
python -m unittest tests.test_render_approved -v
python -m compileall -q py scripts tests
bash -n cron/nightly.sh
bash cron/nightly.sh --dry-run
```

Web tests используют temporary data roots и mocked subprocesses — live API credentials не нужны.

## Документация

- [`ALGORITM.md`](ALGORITM.md) — фактический pipeline и lifecycle
- [`docs/architecture.md`](docs/architecture.md) — архитектура
- [`docs/workflow.md`](docs/workflow.md) — рабочие сценарии
- [`docs/api.md`](docs/api.md) — Web API и security modes
- [`docs/roadmap.md`](docs/roadmap.md) — обязательные follow-ups
- [`CHANGELOG.md`](CHANGELOG.md) — хронология изменений
- [`CLAUDE.md`](CLAUDE.md) — правила для AI-агентов
