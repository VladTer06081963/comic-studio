# Архитектура Comic Studio

## Назначение

Comic Studio — single-author filesystem pipeline для производства 3–4-панельных комиксов с обязательным ручным approval до первой генерации изображений.

## Контуры системы

```text
URL / YouTube / freeform
           │
           ▼
      Python ingest
           │
           ▼
  MiniMax scenario writer
           │
           ▼
 data/scenarios/draft/
           │
   ┌───────┴────────┐
   │ Telegram       │ Web UI/API
   │ authorized chat│ localhost/authenticated remote
   └───────┬────────┘
           ▼
 data/scenarios/approved/
           │
           ▼
      render job
           │
   MiniMax image-01 × panels
           │
           ▼
 Pillow assembly → rendered
           │
           ▼
 publication adapters → published
```

## Source of truth

Canonical scenario record находится ровно в одной lifecycle queue:

```text
draft | approved | rejected | rendered | published
```

`data/archive/` не является active queue и не изменяется приложением.

## Python layer

### Ingest

- `py/ingest/url.py` — article/main extraction с retry;
- `py/ingest/youtube.py` — `yt-dlp` subtitles → Supadata → Voicebox/Whisper;
- `py/ingest/freeform.py` — timestamped Markdown artifact.

### Scenario

`py/scenario/writer.py` вызывает MiniMax Text-01, ограничивает drafting context до 8000 символов и добавляет один из пяти image style suffixes.

### Render

- `py/render/minimax_client.py` — image-01;
- `py/render/comic_assembler.py` — assembly;
- `py/render/_comic_lib.py` — bubble/star/gothic/boom/memo/bar;
- `scripts/render_approved.py` — strict initial approval gate, machine-readable result и explicit staging rerender.

Initial render повторно проверяет persisted `approved` непосредственно перед каждым provider call. Rerender разрешён только для `rendered`, создаёт candidate artifacts в `data/.staging/` и заменяет current result после проверки.

## Web layer

`web/server.js` только загружает config, запускает listener и управляет shutdown. `web/app.js` создаёт injectable Express app.

```text
web/
├── app.js
├── server.js
├── routes/
│   ├── scenarios.js
│   ├── jobs.js
│   ├── comics.js
│   └── health.js
├── lib/
│   ├── config.js
│   ├── errors.js
│   ├── validation.js
│   ├── access_control.js
│   ├── scenario_store.js
│   ├── lifecycle.js
│   ├── process_runner.js
│   ├── job_store.js
│   ├── job_manager.js
│   ├── runtime.js
│   └── logger.js
└── tests/
```

### Security modes

- Local default: `127.0.0.1`, same-origin, no wildcard CORS.
- Remote: non-loopback host требует bearer token и exact origin allowlist.
- Raw `/scenarios/...json` static route отсутствует.
- IDs, paths, status и payloads валидируются до filesystem/process operations.
- Python вызывается через shell-disabled argument arrays.

### Lifecycle persistence

Node scenario store:

- обнаруживает duplicate ID вместо выбора первого файла;
- изолирует malformed list records;
- выполняет unique-temp write + fsync + rename;
- сериализует per-ID mutations;
- восстанавливает interrupted pending transitions;
- не отдаёт absolute filesystem paths.

### Render jobs

Transient `rendering` не добавляется в scenario lifecycle. Jobs хранятся отдельно:

```text
data/jobs/<job-id>.json
queued → running → succeeded|failed|interrupted
```

Один scenario не может иметь два active render jobs. После restart paid work автоматически не повторяется.

### Delete

Mutable delete использует manifest и staged trash. При частичном failure сделанные moves откатываются. `published` и `data/archive/` не удаляются.

## Telegram

`tg-bot/bot.js` ограничивает mutation разрешённым chat ID. Telegram и Web оба являются ручными approval channels. Полная cross-runtime lifecycle parity остаётся follow-up и проверяется общими contract fixtures.

## Publication

- `publisher/site.js` — deployment-specific site adapter;
- `publisher/social.js` — Twitter/Mastodon placeholders;
- `py/lib/notion_sync.py` — частичный scenario mirror; comic mirror placeholder.

Publication integrations не относятся к завершённому Web hardening contract.

## Observability

- Python и Web пишут в `data/logs/YYYY-MM-DD.log` и stdout.
- API возвращает `X-Request-ID` и structured error codes.
- Jobs сохраняют originating request ID.
- `/api/health` — liveness.
- `/api/ready` — filesystem/Python/security readiness без paid provider calls.

## Immutability rules

| Объект | Правило |
|---|---|
| `approved` | разрешён initial render |
| `rendered` | разрешён explicit atomic rerender |
| `published` | read-only; будущие изменения только через новый remix draft |
| `data/archive/` | существующие файлы никогда не меняются |

## Tests

Web API использует `node:test`, temporary data roots и fake subprocess runner. Python renderer tests mock provider и assembly calls. Live MiniMax, Telegram, Notion и publication credentials для suite не нужны.
