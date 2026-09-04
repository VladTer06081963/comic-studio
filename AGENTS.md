# AGENTS.md

Pipeline for producing short comics: ingest → draft scenario → human approval → render → publish.
Scenarios are JSON on disk; approval is a persisted artifact, not a flag in memory.

## Setup

```bash
# Python (3.11+)
python3 -m venv .venv
source .venv/bin/activate
pip install -r py/requirements.txt

# Node sub-packages — no workspaces, install each
(cd web        && npm install)
(cd tg-bot     && npm install)
(cd mcp-server && npm install)

cp .env.example .env   # fill MINIMAX_API_KEY at minimum
```

## Run

| Service | Command | Default bind |
|---|---|---|
| Web API + UI | `node web/server.js` | `127.0.0.1:3000` |
| Telegram bot | `node tg-bot/bot.js` | — |
| MCP server | `node mcp-server/index.js` | — |
| Create draft | `python scripts/ingest_and_draft.py --freeform "..."` / `--url` / `--youtube` | — |
| Render approved | `python scripts/render_approved.py --scenario-id <id>` (or `--all`) | — |
| Publish queue | `node scripts/publish_rendered.js` | — |
| Nightly (dry) | `bash cron/nightly.sh --dry-run` | — |

`publisher/` ships as plain JS used by `scripts/`; it has no `package.json` of its own.

## Project layout

- `py/ingest/` — URL, YouTube, freeform text ingest
- `py/scenario/` — LLM scenario + image-style prompts
- `py/render/` — image gen, Pillow assembly, HTML renderer, voice merge
- `py/lib/` — config, lifecycle, logging, Notion sync
- `web/` — Express API, jobs, lifecycle, static UI backend
- `tg-bot/` — Telegraf bot (authorised inline actions)
- `mcp-server/` — MCP server exposing studio tools to agents
- `publisher/` — site + social adapters (social are placeholders)
- `ui/` — vanilla-JS dashboard (`ui/index.html`, `viewer.html`)
- `scripts/` — operational entry points (Python + Node)
- `tests/` — Python `unittest` suite (run from repo root)
- `web/tests/`, `tg-bot/tests/` — Node `--test` suites
- `openspec/` — in-flight spec changes; `docs/`, `summary/`, `skills/`, `cron/`

## Code style

- Python 3.11+, ESM Node.js (each sub-package uses `"type": "module"`).
- No formatter or linter is configured (no `ruff`/`prettier`/`eslint`/`mypy`); match neighbouring files.
- TypeScript is not used. Plain `.js` and `.py` only.

## Testing

| Suite | Command |
|---|---|
| Web | `cd web && npm test` (`node --test --test-concurrency=1 tests/*.test.js`) |
| Bot | `cd tg-bot && CHAT_ID=123456789 npm test` (chat-id env required) |
| Python | `python -m unittest tests.test_render_approved -v` (one module per `tests/test_*.py`) |
| Compile check | `python -m compileall -q py scripts tests` |
| Cron syntax | `bash -n cron/nightly.sh` |
| Cron dry-run | `bash cron/nightly.sh --dry-run` |

Test suites use temporary data roots and mock providers — never call `MiniMax`, Telegram, or publication endpoints from tests.

## Project invariants (read before changing anything)

- **Approval gate.** Initial render requires a persisted approval: a scenario file in `data/scenarios/approved/` with `status: "approved"`. Verifiable through Telegram (`TELEGRAM_CHAT_ID`) or local / bearer-authenticated Web UI. Re-check approval immediately before the provider request.
- **Idempotency.** Use scenario `id` + `seed`. Only explicit staging rerender may re-render a `rendered` scenario.
- **Updates only via revision / remix.**
  - `approved` or `rendered` → `POST /api/scenarios/:id/revise` (LLM regen with atomic approval revoke; legacy `feedback` returns `REVISION_REQUIRED`).
  - `published` → `POST /api/scenarios/:id/remix` (creates a new draft with `remix_of`).
- **`published` is immutable.** Never edit, delete, or re-render a published scenario; new edits produce a remix.
- **HTML is the primary artifact, PNG is the preview fallback.** `assemble_comic(scenario=...)` writes both `data/comics/<id>.html` and `data/comics/<id>.png`. Without `scenario` it writes PNG only (legacy).
- **Fonts are vendored, not CDN.** `py/render/html_renderer/static/fonts/*.woff2` is committed directly (OFL, ~120 KB). `render_html` copies them next to the HTML for self-contained viewing. Do not add `git lfs` or link `fonts.googleapis.com` / `fonts.gstatic.com`.
- **HTML safety.** `render_html` uses `jinja2` with `autoescape=True`. Pass only plain text to captions, titles, and ids — never raw HTML.
- **Telegram HTML link.** When `WEB_PUBLIC_URL` is set, the bot appends `🔗 HTML: <url>/comics/<id>.html` to the caption and a `🔗 Открыть HTML` inline button. Without it, backward-compat: photo only.

## Logging

- Python and Web code write to `data/logs/YYYY-MM-DD.log` and stdout, with secrets redacted.
- Revision and remix must emit `revision.requested`, `revision.succeeded`, `revision.failed`, `remix.created` with `request_id`, `scenario_id`, and `revision_request_id`.

## Security

- `.env`, tokens, keys, and `.env.*` files must never be committed (already in `.gitignore`).
- Web server binds to `127.0.0.1` by default. Remote mode requires **both** `WEB_API_TOKEN` and `WEB_ALLOWED_ORIGINS` together.
- Test suites must not perform live provider calls (`MINIMAX_API_KEY`, Telegram, publication endpoints).
- `data/archive/` is append-only: do not edit or delete existing files.

## PR & commit conventions

- Branch from `main`; never push to it directly.
- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`.
- `openspec/` is the source of truth for in-flight changes — keep deltas in sync and archive the change once it lands.
- Append a short entry to `CHANGELOG.md` (chronological, ISO-8601 timestamp, no secrets).

## Extension points

- New ingest source → `py/ingest/<name>.py` exporting `ingest_X() -> str`.
- New caption style → add a case in `py/render/comic_assembler.py`.
- New social platform → `publisher/<platform>.js` exporting `publish(comic)`.
- New LLM provider → parameterise `py/scenario/writer.py`.

## Project status

R&D / prep, **not production**. Treat all advice as exploration-stage.
The pipeline (MCP, lifecycle, Web UI, Telegram, .env discipline) is solid; the
open problem is **long-form serials** (recurring characters, plot continuity,
style consistency across episodes). Default to R&D pace; don't push
production-grade answers unless explicitly asked.

## Image gen provider

- **Current:** `minimax` (cloud) via `py/render/minimax_client.py`.
- **Evaluating:** `drawthings` (local) for Stalker / military themes — no
  censorship, full model choice (Flux, SDXL, Pony, NoobAI), LoRA-friendly.
- **Switch:** set `IMAGE_PROVIDER=drawthings` in `.env`. `py/render/drawthings_client.py`
  is a TODO; mirror the interface of `minimax_client.py` so the rest of the
  pipeline doesn't notice the change.
- Do **not** switch providers mid-series — that breaks character/style consistency.

## Censorship-sensitive content

For Stalker / military / horror scenarios, prefer **local models** (LM Studio
at `http://192.168.55.1:1234` over WireGuard) over MiniMax M-series or
Anthropic. Magnum-picaro and other uncensored local models handle the
creative space without refusals.

The revision pipeline handles this transparently: scenarios can be generated
locally, render via Draw Things, publish normally. The miniMax cloud path
stays available for neutral content where its quality is wanted.

## Series workflow (open problem)

Not yet implemented. When designing a multi-episode arc, set up:

- `bible/character-<name>.md` — visual sheet (clothing, features, props) +
  fixed **Draw Things seed** for character consistency.
- `bible/style-<name>.md` — frozen image-prompt template + negative prompt;
  reuse verbatim across episodes.
- `bible/voice-<name>.md` — fixed VoiceBox voice ID + emotion profile.
- `serials/<arc-name>/episode-log.md` — chronicle of what happened in each
  episode (panels, decisions, callbacks). Source of truth for continuity.
- `serials/<arc-name>/ep-XX-<slug>/` — per-episode working directory with
  `script.json`, `panels/`, `audio/`, `final.mp4`, `release.md`.

**Continuity check (script-level):** before approving a new episode, the
`@script-writer` agent must diff against `episode-log.md` and the bible,
and flag inconsistencies (location, props, character state, timeline).

**Don't try to solve the whole thing upfront.** Build ep-01 cleanly with
the bible structure, then ep-02 — and watch what specifically breaks. That's
where the actual gaps are.

## Fixation procedure

When the user says **«фиксируем»**, **«фиксация»**, or **«зафиксируй»**,
follow the 5-step procedure in [`FIXATION.md`](./FIXATION.md):

1. **OpenSpec change** — check `openspec/changes/` for unarchived changes;
   archive to `openspec/changes/archive/YYYY-MM-DD-<name>/` if present.
2. **Audit** — create `summary/audit/<NNN>_<slug>.md` with sections
   `Контекст`, `Что сделано`, `Статус`.
3. **Tasks** — create `summary/tasks/<NNN>_<slug>.md` with table
   `| ID | Задача | Оценка | Статус |`. Use `summary/tasks/022_lmstudio-provider-setup.md`
   as format reference.
4. **CHANGELOG** — append ISO-8601 timestamped line at the end of
   `CHANGELOG.md`. No secrets.
5. **Git** — `git add` + conventional commit + `git push` if remote set.

Numbering: `summary/tasks/NNN_<slug>.md` and `summary/audit/NNN_<slug>.md`
share the same NNN. If unsure, check `ls summary/tasks/ | sort -r | head`
for the highest existing number. Templates live in
`summary/tasks/_TEMPLATE.md` and `summary/audit/_TEMPLATE.md`.

For pi agent: see `.pi/skills/fixation/SKILL.md`. For mcode (Mavis / M3):
read this section and `FIXATION.md` end-to-end before starting.
