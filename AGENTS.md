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

- **Default:** `minimax` (cloud) via `py/render/minimax_client.py`.
- **Local uncensored:** `drawthings` (Draw Things + LoRA) via `py/render/drawthings_client.py`.
- **Выбор** — `py/scenario/provider_router.py::pick_image_provider(scenario, override)`:
  1. CLI override (`--image-provider` в `scripts/render_approved.py`)
  2. `scenario["image_provider"]` (per-scenario)
  3. `scenario["genre"]` → `GENRE_DEFAULT` (stalker/military/horror → drawthings; comedy/kids/sci-fi → minimax)
  4. env `DEFAULT_IMAGE_PROVIDER` (default `minimax`)
- **Auto-fallback**: если Draw Things упал (WireGuard down, model не загружен) →
  MiniMax для картинок. Scenario помечается `image_provider_fallback: "minimax"`.
- Полная документация: `summary/audit/027_local-uncensored-stack.md` и
  `openspec/changes/local-uncensored-stack/`.

## Censorship-sensitive content

**`provider_router` сам выбирает провайдеров по жанру**:

- `stalker-horror`, `military`, `horror` → text=LM Studio (Magnum), image=Draw Things (с LoRA)
- `comedy`, `kids`, `educational`, `sci-fi` → text=minimax, image=minimax
- `default` → minimax, minimax (последний рубеж)

Override per-scenario: `text_provider` / `image_provider` поля в JSON.
Override per-run: `--text-provider` / `--image-provider` в `scripts/render_approved.py`.

Если локалка недоступна (WireGuard down, модель не загружена) — auto-fallback на
MiniMax с пометкой `*_provider_fallback: "minimax"` в scenario JSON.

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

## Branch workflow

### 🚨 Why these branches must stay separate

The two branches exist because of a **hardware gap** that cannot be papered
over with config:

- **`main`** runs on **Mac Studio M1 Max, 32 GB RAM** — comfortable with
  Whisper, large image models, full ML stack, multiple parallel services.
- **`demo-production`** runs on **Oracle VPS, ~1 GB RAM** — minimum to run
  the web UI and Telegram bot. Cannot host Whisper, yt-dlp, large image
  models, or even full Python ML libraries.

`demo-production` therefore has **stub implementations** of the heavy
parts (Whisper transcription, yt-dlp ingestion). The full implementations
live on `main`. If you merge `main` into `demo-production` carelessly:

- The full Whisper deps land on the VPS → `pip install` fails or OOM-kills.
- The full yt-dlp lands → install fails or runs out of disk.
- The web server tries to call a real MiniMax API key that demo never had
  → 401s on every render.
- Disk fills, services crash, demo URL goes down.

**Don't `git merge main` into `demo-production`. Ever.** Use cherry-pick
below. If the cherry-pick friction becomes painful, switch to Variant D
(overlay branch with rebase, see end of file).

### Two long-lived branches, both rooted at the same ancestor

| Branch | Environment | Purpose |
|---|---|---|
| `main` | Local Mac Studio | Dev / R&D. Full features. All commits land here first. |
| `demo-production` | VPS Oracle (minimal, ~1 GB RAM) | Demo. Stubs for heavy ML deps (Whisper, yt-dlp). Lighter web. |

**When to cherry-pick `main` → `demo-production`:** when the commit is
**docs / workflow only** — does not touch runtime code or heavy deps.
Specifically:

- `AGENTS.md`, `CLAUDE.md`, `FIXATION.md`, `README.md`, `CHANGELOG.md` — always
- `summary/**` (renames, audits, tasks, templates) — always
- `openspec/**` — always
- `py/**`, `web/**`, `tg-bot/**`, `mcp-server/**`, `scripts/**`, `publisher/**` —
  **do NOT cherry-pick** unless the change is explicitly intended for demo
  (e.g. another `stub:` commit on demo-production).
- `py/requirements.txt`, `package*.json` — **do NOT cherry-pick**, these are
  runtime deps that demo has stubbed.

### Cherry-pick procedure

After a successful fix-commit on `main` and `git push origin main`:

```sh
git fetch origin
git checkout demo-production
git cherry-pick <main-commit-sha>
# resolve conflicts if any (most common: source files don't exist on demo,
# so DU conflicts on renamed files — keep the destination with `git add`,
# source was never there to delete)
GIT_EDITOR=true git cherry-pick --continue
git push origin demo-production
git checkout main
```

In the CHANGELOG entry on `main`, note explicitly: «cherry-picked to
`demo-production` as `<short-sha>»» so the history is traceable.

If conflicts are non-trivial (e.g. demo's stubs conflict with main's
implementation), do not force-cherry-pick — fix demo separately or open
an issue. Doc-only commits are safe; code commits are not.

## Future consideration: Variant D (NOT IMPLEMENTED)

Reserved for the case where demo and main drift too much and cherry-pick
becomes painful. Idea:

- Make `demo-production` a **feature branch off `main`**, not a sibling.
- Demo files live in `demo/` overlay (e.g. `demo/py/stubs/`, `demo/requirements.txt`)
  and are merged on top of main via `git checkout demo-production && git rebase main`.
- Cherry-pick becomes automatic (rebase carries everything forward, demo
  overlay stays put).
- Trade-off: makes demo's structure more complex (two parallel file trees).

Don't implement this unless cherry-pick friction becomes > ~30 min per sync.
Current single-machine dev + single-VPS demo doesn't justify the complexity.

## Runtime: mcode exec vs TUI

Two ways to run mcode, with different capabilities:

| Mode | Command | MCP tools loaded? | When to use |
|---|---|---|---|
| **TUI** (interactive) | `mcode` (no args) | ✅ yes (`/mcp` lists them) | Long sessions, multi-step work, MCP-driven tasks |
| **exec** (one-shot) | `mcode exec --cwd <path> "<task>"` | ❌ **no** | Short automated tasks, bot/CLI integration |

**Why exec doesn't load MCP**: exec is a fast path for one-shot prompts.
The runtime doesn't spawn the stdio child for MCP servers — only TUI does.
This is an architectural decision in mcode, not a config issue.

**What exec can still do** (covers the workflow):

- `read` / `write` / `edit` / `glob` / `grep` — files
- `bash` — `mv`, `curl`, `node`, `python`, `git`, anything
- `web_fetch` / `web_search` — HTTP
- Skills (`skill` tool) — gobsmooch-comic-generator, mcode-tools, etc.
- Markdown/PDF/PPTX renderers from `mcode-tools`

**What exec cannot do**:

- Direct `mcp__comic-studio__*` tool calls (approve, render, restyle, etc.)
- These exist in `mcp-server/index.js` but are not registered in exec's tool table.

**Workaround used by the Telegram bot (`/mcode <task>` command)**:

The agent in exec mode drives the comic-studio via **filesystem + bash + curl**:

| Intent | How exec does it |
|---|---|
| List draft scenarios | `ls data/scenarios/draft/` |
| Read scenario `<id>` | `read data/scenarios/draft/<id>.json` |
| Approve scenario `<id>` | `mv data/scenarios/draft/<id>.json data/scenarios/approved/` |
| Render scenario `<id>` | `curl -X POST http://127.0.0.1:3000/api/scenarios/<id>/render` |
| List published comics | `ls data/comics/*.html` |
| Inspect a comic | `read data/comics/<id>.html` (HTML render) or `read data/comics/<id>.png` |
| Restyle comic | `curl -X POST http://127.0.0.1:3000/api/scenarios/<id>/restyle -d '{"style":"bubble"}' -H 'Content-Type: application/json'` |

**This is the intended path**, not a workaround. The MCP tools are a
convenience over the same operations; exec goes through the underlying
primitives (files + HTTP API) directly. Result is identical.

**If you need MCP-style calls from exec anyway**: spawn a long-lived
TUI session and pipe `mcode` interactively. Not recommended for
automation (fragile, no clean exit, blocking).

**mcode acp** (Agent Client Protocol, `mcode acp`) is a server, not a
client — not useful for triggering exec tasks from another process.

## Telegram bot MCP integration (`tg-bot/`)

The bot has its own MCP client (`tg-bot/mcp-client.js`) that spawns the
**comic-studio** MCP server via stdio and calls tools directly. This is
**independent of mcode** and gives the bot full MCP power without the
exec limitation.

Single-server scope: бот подключается только к `comic-studio` MCP.
Draw Things и другие MCP-серверы доступны через Hermes / IDE напрямую,
в бот они не заведены (см. `summary/audit/026_remove-draw-things-orchestrator.md`).

### Bot commands

| Command | Backend | When to use |
|---|---|---|
| `/mcp_list` | Direct MCP via `mcp-client.js` | See all 10 available tools |
| `/mcp <tool> [json-args]` | Direct MCP via `mcp-client.js` | Typed operations, no LLM in loop |
| `/mcode <task>` | `mcode exec` (filesystem + bash) | Freeform tasks that need LLM reasoning |

### Why both `/mcp` and `/mcode`?

- **`/mcp`** is fast, deterministic, and uses the canonical MCP tool
  surface. Use it for `approve`, `render`, `restyle`, `list_scenarios`,
  `resolve_intent`, etc. — anything that's a single typed operation.
- **`/mcode`** is for tasks that require reasoning: "create a scenario
  about X", "explain the lifecycle", "refactor script Y to use new
  env var". Agent works through filesystem + bash + curl.
- **Combined:** `/mcp resolve_intent "ssh"` returns scenario IDs, then
  `/mcode "explain what's interesting about scenario abc"` reasons
  about it. Or `/mcode "list pending approvals and remind me to review"`
  — agent lists via filesystem, suggests via LLM.

### Why not just put MCP in `mcode` exec?

Because exec is a fast-path one-shot and doesn't spawn MCP stdio
transports. The bot's MCP client bypasses this by spawning its own
connection per command. The cost: a small process start per call
(~200 ms), in exchange for full tool access.

### Example flow

```
/mcp_list
  → 10 tools listed

/mcp list_scenarios {"status": "draft"}
  → {"items": [], "invalid_count": 0, ...}

/mcp approve_scenario {"id": "abc12345"}
  → {"ok": true, "scenario_id": "abc12345", ...}

/mcode list published comics
  → reads data/comics/*.html, returns formatted list
```

## Quality reference (vision)

Target style/quality level we aim for in this project:

- <https://openaiua.fr/comic/chernobyl-ritual/>

A working Stalker/Chernobyl-themed multi-page comic with: dark tone,
staged panels, captions, environment detail, character continuity.
This is the **quality bar** for what comic-studio should produce.

When evaluating renders, ask:
- Does it match the Stalker atmosphere of the reference (gritty, post-Soviet,
  not glossy)?
- Are panels staged (foreground/midground/background) or flat?
- Is there a character we can identify across pages?
- Is the caption typography consistent with the reference style?

The reference is external (we don't control it), so we measure **relative
to** it, not **copy** it. If our renders are clearly below this bar
after a few iterations, escalate to the user — that's a signal the
model/style/prompt needs review, not a tweak.
