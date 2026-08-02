# Comic Studio Web API

## Base URL

Local mode, enabled by default:

```text
http://127.0.0.1:3000
```

The dashboard is served at `/ui/`. Raw scenario JSON files are never served as static assets.

## Access modes

### Local mode

```env
HOST=127.0.0.1
PORT=3000
```

Only loopback connections and same-origin browser requests are accepted. A token is not required.

### Remote mode

A non-loopback `HOST` requires both settings:

```env
HOST=0.0.0.0
WEB_API_TOKEN=<long-random-token>
WEB_ALLOWED_ORIGINS=https://studio.example
```

All `/api/*` requests require:

```http
Authorization: Bearer <token>
```

Browser origins must exactly match `WEB_ALLOWED_ORIGINS`. Wildcard CORS is not supported. The dashboard keeps a remotely entered token only in `sessionStorage`.

## Response conventions

Every response includes `X-Request-ID`. Structured errors have this shape:

```json
{
  "error": {
    "code": "INVALID_SCENARIO_ID",
    "message": "Invalid scenario ID",
    "request_id": "uuid"
  }
}
```

No response intentionally exposes tokens, stack traces or absolute filesystem paths.

## Scenario lifecycle

```text
draft ──approve──▶ approved ──initial render──▶ rendered ──publish──▶ published
  └────reject────▶ rejected                         │
                                                   └──explicit rerender──▶ rendered
```

`published` is read-only in the Web API. A future `scenario-revision-and-remix` change will create new drafts from published records.

## Scenario endpoints

### `GET /api/scenarios?status=<status>`

Allowed selectors: `draft`, `approved`, `rejected`, `rendered`, `published`, `all`.

```json
{
  "items": [
    {
      "id": "abc12345",
      "title": "Example",
      "status": "draft",
      "panels": [{"n": 1, "caption": "Подпись"}],
      "feedback_count": 0
    }
  ],
  "invalid_count": 0,
  "request_id": "uuid"
}
```

Malformed records are skipped and counted instead of breaking the whole list.

### `GET /api/scenarios/:id`

Returns a validated detail representation. Internal paths and raw source context are omitted.

### `POST /api/scenarios`

```json
{
  "content": "URL, YouTube URL or freeform idea",
  "image_style": "comic",
  "caption_style": "bubble"
}
```

Styles are allowlisted. The server invokes Python without a shell and returns `201` only after a canonical draft exists.

### `POST /api/scenarios/:id/approve`

Idempotent `draft → approved`. Manual approval is allowed from the local or authenticated dashboard.

### `POST /api/scenarios/:id/reject`

Idempotent `draft → rejected`.

### `POST /api/scenarios/:id/render`

Initial render:

```json
{"mode": "initial"}
```

Allowed only for `approved`.

Explicit rerender:

```json
{"mode": "rerender", "seed": 12345}
```

Allowed only for `rendered`. Candidate artifacts are generated in staging and promoted only after verification.

Successful acceptance returns `202`:

```json
{
  "ok": true,
  "job": {
    "id": "job-id",
    "scenario_id": "abc12345",
    "mode": "initial",
    "status": "queued"
  },
  "request_id": "uuid"
}
```

Important conflicts:

- `APPROVAL_REQUIRED` — draft/rejected;
- `RERENDER_CONFIRMATION_REQUIRED` — rendered without explicit rerender;
- `PUBLISHED_IMMUTABLE` — published;
- `RENDER_ALREADY_RUNNING` — one active job already exists.

### `POST /api/scenarios/:id/seed`

```json
{"seed": 42}
```

Standalone seed changes are allowed only for `draft` and `approved`. For `rendered`, pass the seed with explicit rerender.

### `POST /api/scenarios/:id/feedback`

```json
{"text": "Сделать финал смешнее"}
```

Current transitional behavior stores a timestamped revision request and returns `status=feedback_recorded`. It does **not** regenerate prompts yet. Published scenarios reject feedback.

### `DELETE /api/scenarios/:id?confirm=true`

Deletes a mutable scenario and its panel/final/raw artifacts through staged trash. Published records and `data/archive/` are never deleted.

## Job endpoints

### `GET /api/jobs`

Returns persisted jobs ordered newest first.

### `GET /api/jobs/:id`

```json
{
  "job": {
    "id": "job-id",
    "scenario_id": "abc12345",
    "status": "queued|running|succeeded|failed|interrupted",
    "request_id": "originating-request-id"
  },
  "request_id": "poll-request-id"
}
```

Queued/running jobs left by a restart become `interrupted`; paid render work is not replayed automatically.

## Comics and health

- `GET /api/comics` — final PNGs linked to rendered/published scenarios.
- `GET /comics/:id.png` — safe final comic serving; panel/raw paths are not exposed.
- `GET /api/health` — HTTP liveness only.
- `GET /api/ready` — data-root, write access, Python executable and security configuration; never calls paid providers.

## Validation bounds

Defaults can be configured through `.env`:

- scenario ID: `^[A-Za-z0-9_-]{4,64}$`;
- request body: `128kb`;
- content: 50,000 characters;
- feedback: 5,000 characters;
- seed: integer `0..2147483647`.

## Tests

```bash
cd web
npm test
```

Tests use temporary data roots and mocked child processes. MiniMax, Telegram, Notion, site and social credentials are not required.
