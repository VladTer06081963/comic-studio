# Comic Studio

Конвейер для производства серийных комиксов:
**контекст → сценарий → утверждение в Telegram → рендер → публикация → cron-выпуск**.

## Архитектура

| Слой | Технология | Назначение |
|------|------------|------------|
| `py/ingest/` | Python | Парсинг URL, YouTube-транскрибация, свободный текст |
| `py/scenario/` | Python + LLM | Генерация сценария комикса из контекста |
| `py/prompt/` | Python | Сборка image-промтов для каждой панели |
| `py/render/` | Python + MiniMax API | Генерация панелей и сборка PNG |
| `py/lib/` | Python | Утилиты: Notion-зеркало, логирование, конфиг |
| `web/` | Node.js (Express) | REST API + статический хостинг |
| `ui/` | Vanilla HTML/CSS/JS | Дашборд и превью комиксов |
| `tg-bot/` | Node.js (Telegraf) | Утверждение сценариев через Telegram |
| `publisher/` | Node.js | Публикация на сайт и в соцсети |
| `cron/` | bash | Ежедневный выпуск серий |

## Workflow

```
[Источник] → ingest → scenario → Telegram approve → render → publish
                                                       ↑
                                          cron/nightly.sh (02:00)
```

1. **Ингест** — пользователь отправляет URL YouTube/блога или свободный текст
2. **Сценарий** — LLM генерирует 3-4 панели + промты + подписи
3. **Утверждение** — бот в Telegram присылает превью с кнопками ✅ / ✏️ / ❌
4. **Рендер** — MiniMax image-01 генерирует панели, Pillow собирает финал
5. **Публикация** — комикс деплоится на сайт + постится в соцсети
6. **Cron** — каждую ночь выбирает N утверждённых сценариев и публикует серию

## Быстрый старт

```bash
# 1. Зависимости
cd ~/Projects/comic-studio
python3 -m venv .venv && source .venv/bin/activate
pip install -r py/requirements.txt
cd web && npm install && cd ..
cd tg-bot && npm install && cd ..

# 2. Переменные окружения
cp .env.example .env
# заполнить: MINIMAX_API_KEY, TELEGRAM_BOT_TOKEN, NOTION_TOKEN, ...

# 3. Запуск
python scripts/run_ingest.py "URL или свободный текст"
node tg-bot/bot.js                    # в отдельном терминале
node web/server.js                    # в отдельном терминале
bash cron/nightly.sh                  # тестовый прогон
```

## Структура данных

```
data/
├── scenarios/         # JSON: сценарии на разных стадиях
│   ├── draft/         # ожидают утверждения
│   ├── approved/      # утверждённые, ждут рендера
│   └── rejected/      # отклонённые
├── comics/            # PNG: готовые выпуски + meta.json
└── archive/           # история выпусков по датам
```

## Подробнее

- [`docs/architecture.md`](docs/architecture.md) — детальная архитектура
- [`docs/workflow.md`](docs/workflow.md) — пошаговый workflow с примерами
- [`CLAUDE.md`](CLAUDE.md) — инструкции для AI-агента при работе с проектом