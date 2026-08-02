# Workflow Comic Studio

## 1. Настройка

```bash
cd ~/Projects/comic-studio
python3 -m venv .venv
source .venv/bin/activate
pip install -r py/requirements.txt
cd web && npm install && cd ..
cd tg-bot && npm install && cd ..
cp .env.example .env
```

Для генерации нужен `MINIMAX_API_KEY`. Telegram, Notion, site и social settings опциональны для соответствующих этапов.

## 2. Создание draft

### URL

```bash
python scripts/ingest_and_draft.py \
  --url "https://example.com/article" \
  --tone funny --panels 3 \
  --image-style comic --style bubble
```

### YouTube

```bash
python scripts/ingest_and_draft.py --youtube "https://youtu.be/..."
```

### Freeform

```bash
python scripts/ingest_and_draft.py --freeform "Идея про пожарного, который спасает котёнка"
```

Результат:

```text
data/scenarios/draft/<id>.json
```

## 3. Ручное approval

Разрешены два author-controlled channel:

1. Telegram bot для configured `TELEGRAM_CHAT_ID`.
2. Web UI в local mode или authenticated remote mode.

```bash
node tg-bot/bot.js
node web/server.js
```

Web UI:

```text
http://127.0.0.1:3000/ui/
```

Approval переводит только `draft → approved`. Initial image generation без persisted approval запрещена.

## 4. Initial render

CLI:

```bash
python scripts/render_approved.py --scenario-id abc12345
```

Все approved:

```bash
python scripts/render_approved.py --all
```

Web API:

```http
POST /api/scenarios/abc12345/render
Content-Type: application/json

{"mode":"initial"}
```

API возвращает `202` и job ID. Статус проверяется через:

```http
GET /api/jobs/<job-id>
```

После успешной assembly:

```text
data/scenarios/rendered/<id>.json
data/comics/<id>.png            # PNG-preview (Pillow overlay, backward-compat)
data/comics/<id>.html           # HTML-страница (primary artifact, variant B)
data/comics/<id>/layout.json    # манифест для HTML-рендера
data/comics/<id>/fonts/         # woff2 шрифты для автономности HTML
```
data/comics/<id>/panel_*.png
```

## 5. Rerender до публикации

Только `rendered` допускает явный rerender:

```http
POST /api/scenarios/abc12345/render
Content-Type: application/json

{"mode":"rerender","seed":12345}
```

Candidate panels создаются в staging. Текущий comic заменяется только после проверки candidate final PNG. При failure старый rendered result остаётся доступен.

Standalone seed mutation разрешена только для `draft`/`approved`. Для `rendered` новый seed передаётся вместе с rerender.

## 6. Revision и remix

Revision запускает LLM-регенерацию для `approved` или `rendered` сценариев
и атомарно отзывает approval до вызова модели:

```http
POST /api/scenarios/<id>/revise
Content-Type: application/json

{
  "feedback": [
    {"text": "Сделать концовку мягче", "source": "web-ui"}
  ],
  "source_context": "optional bounded source text"
}
```

Server возвращает `202 Accepted` с `job.id`, `revision_kind`, `feedback_count`
и `request_id`. После LLM-успеха scenario остаётся в `draft` со статусом
`revision_succeeded` и требует повторного approval. На failure —
`revision_failed` с bounded `revision_error`. В обоих случаях
`scenario.feedback` сохраняется.

Для `rendered` rendered artifacts сначала перемещаются в
`data/.staging/legacy/<id>-<ts>/` с manifest, и только затем отзывается
approval. Очистка legacy staging контролируется
`WEB_LEGACY_RETENTION_MS` (default 7 дней).

Remix создаёт новый draft из `published` и никогда не меняет source record:

```http
POST /api/scenarios/<id>/remix
Content-Type: application/json

{"title": "Новое название", "image_style": "anime", "seed": 12345}
```

Возвращает `201 Created` с `id` нового draft, `remix_of` и
`revision_endpoint` для следующего шага.

Legacy `POST /api/scenarios/<id>/feedback` остаётся для
backward-compatible UI, но возвращает `409 REVISION_REQUIRED` для
не-published и `409 PUBLISHED_IMMUTABLE` для published, не записывая
`scenario.feedback`.

## 7. Delete

Mutable scenario удаляется только с явным подтверждением:

```http
DELETE /api/scenarios/<id>?confirm=true
```

Удаление проходит через staged trash. Нельзя удалить:

- `published`;
- что-либо из `data/archive/`.

## 8. Publication

```bash
node scripts/publish_rendered.js
```

Site adapter работает только при configured `SITE_API_URL`. Social adapters пока placeholders; Notion comic mirror не реализован. Проверяйте deployment adapter до изменения статуса production content.

После успешной публикации `published` должен рассматриваться read-only. Будущая переработка создаёт новый draft/remix, а не меняет published record.

## 9. Nightly

Безопасный просмотр плана:

```bash
bash cron/nightly.sh --dry-run
```

Реальный запуск:

```bash
bash cron/nightly.sh
```

Вторая команда выполняет render/publication/archive side effects. Nightly publication hardening остаётся отдельной задачей.

Пример внешнего schedule:

```cron
0 2 * * * /Users/vladteresena/Projects/comic-studio/cron/nightly.sh
```

## 10. Web remote mode

Local mode является default. Для remote:

```env
HOST=0.0.0.0
WEB_API_TOKEN=<long-random-token>
WEB_ALLOWED_ORIGINS=https://studio.example
```

Если token или origins отсутствуют, server не запускается. UI запрашивает token и хранит его только до закрытия browser session.

## 11. Recovery

- `queued/running` jobs после restart становятся `interrupted`; автоматического платного retry нет.
- Interrupted lifecycle transition восстанавливается из pending metadata или блокируется fail-closed.
- Failed rerender не заменяет current comic.
- Partial delete откатывается из `data/.trash/` manifest.
- Не редактируйте `data/archive/` для recovery.

## 12. Проверка

```bash
cd web && npm test && cd ..
python -m unittest tests.test_render_approved -v
python -m compileall -q py scripts tests
bash -n cron/nightly.sh
bash cron/nightly.sh --dry-run
```

Все automated render tests используют mocks и не вызывают MiniMax.
