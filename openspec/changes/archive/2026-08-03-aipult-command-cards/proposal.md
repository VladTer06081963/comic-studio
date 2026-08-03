## Why

Comic Studio требует помнить 8-char hex ID сценария при любой операции (`restyle`,
`render`, `revise`, `view`, `delete`). Это создаёт cognitive load, делает голосовое
управление нерабочим ("пять-шесть-шесть-альфа-е-альфа...") и закрывает discovery —
пользователь помнит **название** комикса, но не ID. Существующие Telegram-бот и CLI
скрипты остаются как legacy-каналы, но не масштабируются на MiniApp и не предлагают
AI-ассистента.

Этот change вводит **AiPULT** (AI Pull-tab Command Cards): Web UI чат-панель, которая
принимает голосовые/текстовые команды, **резолвит сценарий по title** (не по ID),
генерирует **CommandCard** с командой и показывает пользователю для подтверждения
(▶️ Run / ✏️ Edit / ❌ Reject). AI никогда не выполняет команды сам — пользователь
остаётся executor. Паттерн proven: GitHub Copilot suggestions, AWS Q command approval,
Cursor diff review.

## What Changes

- Добавить `py/lib/scenario_resolver.py`: fuzzy match на title и context через
  `rapidfuzzy.partial_ratio`, recency fallback ("последний rendered" → latest by
  `created_at`), disambiguation (2+ кандидата с score > 60 → вернуть список).
- Добавить `py/lib/aipult_client.py`: MiniMax Text-01 wrapper с COMMAND_COOKBOOK v0.3
  (single source of truth в Python), `route_command(message, candidates) -> CommandCard`.
- Добавить `web/lib/aipult/resolver.js`: Node-side резолвер, читает
  `data/scenarios/*/` напрямую, реализует ту же fuzzy-логику.
- Добавить `web/lib/aipult/validator.js`: whitelist intents (restyle, render, revise,
  view, list, approve, publish, delete, stats), regex-валидация args, forbidden patterns
  (`rm -rf /`, raw paths, secrets).
- Добавить `web/lib/aipult/runner.js`: subprocess execution поверх `ProcessRunner`
  с whitelist intents, timeout, exit-code reporting, audit logging.
- Добавить `web/routes/aipult.js`: Express router с `POST /api/aipult/chat`,
  `POST /api/aipult/resolve`, `POST /api/aipult/execute`.
- Логировать все card generations и executions в `data/logs/aipult-YYYY-MM-DD.log`
  structured JSON (без feedback/revise текстов).
- Backward-compat: Telegram-бот и CLI скрипты (`scripts/restyle.py` etc.) продолжают
  работать без изменений.

## Capabilities

### New Capabilities

- `python-aipult-router`: Python-side fuzzy scenario resolution + MiniMax Text-01
  routing with cached COMMAND_COOKBOOK. Single source of truth для system prompt.
- `web-aipult-chat`: Express endpoints `/api/aipult/{chat,resolve}` принимают
  user message, вызывают Python resolver/MiniMax, валидируют и возвращают
  CommandCard JSON с `id`, `title`, `status`, `confidence`, `command`.
- `web-aipult-runner`: Whitelisted subprocess execution с audit log, timeout и
  forbidden-pattern checks. Card execution endpoint `/api/aipult/execute`.

### Modified Capabilities

None. AiPULT — новый канал; legacy Telegram-бот и CLI скрипты не меняются.

## Impact

- Python: новые `py/lib/scenario_resolver.py` и `py/lib/aipult_client.py`. Добавить
  `rapidfuzzy` в `py/requirements.txt`.
- Web: новые `web/lib/aipult/{resolver,validator,runner}.js` и `web/routes/aipult.js`.
  Wiring в `web/app.js` (`app.use('/api/aipult', aipultRouter(...))`).
- Config: опциональные `AIPULT_*` keys (`AIPULT_MAX_HISTORY`, `AIPULT_TIMEOUT_MS`).
- Tests: новые `tests/test_scenario_resolver.py`, `tests/test_aipult_client.py` и
  `web/tests/aipult.test.js`. Все тесты без live MiniMax, без Telegram, без Notion.
- Audit: новый `data/logs/aipult-YYYY-MM-DD.log` с structured JSON.
- Документация: `docs/aipult.md` (отложено в Phase 4), `CLAUDE.md` — дополнить
  раздел про AiPULT.

## Out of Scope (Phase 2-4)

- **Phase 2**: `ui/index.html` chat panel + `ui/aipult.js` (vanilla JS, Telegram theme).
- **Phase 3**: `py/ingest/voice.py` (Whisper), `web/lib/miniapp.js` (Telegram WebApp).
- **Phase 4**: SSE streaming, cost dashboard, `docs/aipult.md`.
- **N1**: Auto-execution без подтверждения — запрещено в принципе.
- **N2**: Multi-step command chains в одном сообщении.
- **N3**: Memory across conversations.
- **N4**: Custom commands per user.
- **N5**: Permission system.
- **N6**: Real-time collaboration.
