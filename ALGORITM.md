# Comic Studio — актуальный алгоритм

## Основной pipeline

```text
┌──────────────────────────────────────────────────────────────┐
│ URL статьи │ YouTube │ Freeform │ Local file               │
└────────────────────────────┬─────────────────────────────────┘
                             ▼
                       Python ingest
                             ▼
                   MiniMax Text scenario
                             ▼
              data/scenarios/draft/<id>.json
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
   Telegram authorized chat       Local/authenticated Web UI
              └──────────────┬──────────────┘
                             ▼
                       manual approval
                             ▼
            data/scenarios/approved/<id>.json
                             ▼
                       render job
                             ▼
             MiniMax image-01 (≤4 workers)
                             ▼
                Pillow comic assembly
                             ▼
            data/scenarios/rendered/<id>.json
            data/comics/<id>.png + panel files
                             ▼
              deployment publication adapter
                             ▼
           data/scenarios/published/<id>.json
                        (read-only)
```

## 1. Ingest

Точка входа:

```bash
python scripts/ingest_and_draft.py <source option>
```

Источники:

| Source | Option | Реализация |
|---|---|---|
| Article | `--url` | `<main>/<article>` extraction и retry |
| YouTube | `--youtube` | yt-dlp subtitles → Supadata → Voicebox/Whisper |
| Text | `--freeform` | Markdown в `data/freeform/` |
| File | `--file` | UTF-8 text |

LLM получает максимум 8000 символов drafting context. Scenario сохраняет preview context, source metadata и получает случайный 8-символьный ID.

## 2. Scenario generation

MiniMax Text-01 возвращает 3–4 panels:

```json
{
  "id": "abc12345",
  "status": "draft",
  "title": "Название",
  "tone": "funny",
  "style": "bubble",
  "image_style": "comic",
  "layout": "comic",
  "aspect_ratio": "16:9",
  "seed": 42,
  "panels": [
    {"n": 1, "prompt": "English visual prompt", "caption": "Русская подпись"}
  ]
}
```

Image styles:

```text
cartoon | anime | comic | realistic | watercolor
```

Caption styles:

```text
bubble | star | gothic | boom | memo | bar
```

Draft записывается до Telegram/Notion side effects.

## 3. Approval

Manual approval допускается через:

- Telegram для configured chat ID;
- Web UI в local mode;
- Web UI/API в remote mode с bearer token и exact origin allowlist.

Canonical transition:

```text
draft → approved
draft → rejected
```

Initial render без persisted file в `approved/` и `status=approved` запрещён.

## 4. Web security

Default:

```env
HOST=127.0.0.1
PORT=3000
```

Local server принимает same-origin requests. Wildcard CORS отсутствует.

Remote mode требует одновременно:

```env
WEB_API_TOKEN=...
WEB_ALLOWED_ORIGINS=https://studio.example
```

Raw scenario files не доступны через `/scenarios/...`. API валидирует ID/status/payload до построения path или запуска process. Python вызывается без shell interpolation.

## 5. Initial render

CLI:

```bash
python scripts/render_approved.py --scenario-id abc12345
```

Web:

```http
POST /api/scenarios/abc12345/render
{"mode":"initial"}
```

Порядок:

1. Server проверяет canonical approved record.
2. Создаёт persisted job в `data/jobs/`.
3. Python renderer снова проверяет approval перед каждой image request.
4. До четырёх panels генерируются параллельно.
5. Panels проверяются и собираются в final PNG.
6. Только после final PNG scenario переходит в `rendered`.

Ошибки возвращают non-zero process exit и failed job. Scenario не должен становиться rendered после partial failure.

## 6. Render jobs

```text
queued → running → succeeded
                 ├→ failed
                 └→ interrupted
```

API:

```http
GET /api/jobs
GET /api/jobs/<job-id>
```

Для одного scenario допускается один active render job. После server restart незавершённые jobs становятся `interrupted`; автоматический paid retry не выполняется.

## 7. Explicit rerender

Разрешён только из `rendered`:

```http
POST /api/scenarios/<id>/render
{"mode":"rerender","seed":12345}
```

Алгоритм:

1. Новый result генерируется в `data/.staging/<job-id>/`.
2. Existing comic остаётся current.
3. Candidate panels/final проверяются.
4. Current artifacts временно перемещаются в backup.
5. Candidate atomically promoted.
6. Scenario обновляет `seed`, `render_revision`, `rendered_at`.
7. При promotion failure backup восстанавливается.

`published` нельзя rerender.

## 8. Feedback / revision request

Текущий endpoint сохраняет feedback history:

```http
POST /api/scenarios/<id>/feedback
{"text":"Изменить финал"}
```

Response говорит `feedback_recorded`, а не «scenario edited». LLM regeneration пока не выполняется. Она является обязательным follow-up `scenario-revision-and-remix`.

## 9. Delete

```http
DELETE /api/scenarios/<id>?confirm=true
```

Mutable artifacts сначала перемещаются в `data/.trash/<operation-id>/`. При partial failure moves откатываются. Published и archive content не удаляются.

## 10. Publication

```bash
node scripts/publish_rendered.js
```

Текущее состояние:

- custom site adapter deployment-specific;
- social adapters placeholders;
- Notion scenario mirror частичный;
- Notion comic mirror placeholder.

После реальной публикации record считается immutable. Изменение published comic должно создавать новый remix draft с новым ID — этот workflow ещё не реализован.

## 11. Data layout

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
├── jobs/<job-id>.json
├── .staging/
├── .trash/
├── freeform/
├── logs/YYYY-MM-DD.log
└── archive/YYYY-MM-DD/       # existing files immutable
```

## 12. Lifecycle matrix

| Status | Approve | Reject | Initial render | Rerender | Seed | Feedback | Delete |
|---|---:|---:|---:|---:|---:|---:|---:|
| draft | ✅ | ✅ | ❌ | ❌ | ✅ | record | ✅ |
| approved | idempotent | ❌ | ✅ | ❌ | ✅ | record | ✅ |
| rejected | ❌ | idempotent | ❌ | ❌ | ❌ | record | ✅ |
| rendered | ❌ | ❌ | ❌ | ✅ explicit | only with rerender | record | ✅ |
| published | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

## 13. Observability

- API response: `X-Request-ID`.
- Error: `{error:{code,message,request_id}}`.
- Web/Python logs: `data/logs/YYYY-MM-DD.log` + stdout.
- `/api/health`: process liveness.
- `/api/ready`: filesystem, Python executable и security config; без provider calls.

## 14. Safe verification

```bash
cd web && npm test && cd ..
python -m unittest tests.test_render_approved -v
python -m compileall -q py scripts tests
bash -n cron/nightly.sh
bash cron/nightly.sh --dry-run
```

Автоматические render tests mock provider calls. Запуск реального render по документационной или test-задаче не требуется.
