# Proposal: MCP Server Integration 🤖🎙️

## Status: 🟡 Proposed

## Purpose
Добавление Model Context Protocol (MCP) сервера для управления Comic Studio через внешних мощных ИИ-агентов (например, Claude 3.5 Sonnet). 

**Глобальное видение (Экосистема "Агрегатора"):** 
Построение мощного, полностью локального конвейера по созданию "комикс-романов" (graphic novels). 
ИИ-агент, работающий локально (например, в **LM Studio** с моделью `magnum-picaro`), сможет использовать сразу два MCP-сервера:
1. **Draw Things MCP** (уже настроен) — для прямой локальной генерации специфичных изображений.
2. **Comic Studio MCP** (предлагаемый) — как агрегатор, движок сборки и менеджер состояний. 
Агент сможет забрать транскрипцию часового фильма с YouTube (используя встроенный в Comic Studio транскрибатор), разбить её на сцены, создать множество черновиков (`create_comic`), закинуть их в **Notion** (через встроенную в Comic Studio интеграцию), проверить верстку и инициировать рендер. 
Всё это будет работать автономно, либо по расписанию (уже реализованный **cron**), создавая большие графические романы без постоянного микроменеджмента со стороны пользователя.

## Proposed Changes

1. **Создание нового компонента `mcp-server`**:
   - Отдельный процесс (Node.js с `@modelcontextprotocol/sdk`).
   - Транспорт: `stdio` (или `SSE` опционально).
   - Действует как API Client к локальному `web/server.js` (порт 3000).

2. **Экспортируемые инструменты (MCP Tools)**:
   - `list_scenarios`: `GET /api/scenarios?status={status}`
   - `get_scenario`: `GET /api/scenarios/{id}`
   - `create_comic`: `POST /api/scenarios` 
   - `approve_scenario`: `POST /api/scenarios/{id}/approve`
   - `revise_scenario`: `POST /api/scenarios/{id}/revise`
   - `render_comic`: `POST /api/scenarios/{id}/render`
   - `restyle_comic`: Добавление эндпоинта `/api/scenarios/{id}/restyle` в `web/routes/scenarios.js` (портирование логики из Telegram-бота).
   - `resolve_intent` (AiPULT): вызов `POST /api/aipult/resolve`
   
3. **Голосовое управление (опционально, Phase 3 AiPULT)**:
   - Согласно `HANDOFF_AiPULT_PHASE_3.md`, транскрибация может происходить на стороне сервера.
   - MCP-сервер может предоставить ИИ-агенту инструмент `transcribe_audio` (передача файла или base64 → `POST /api/aipult/transcribe` → получение текста).

## Acceptance Criteria
- [ ] Пакет `mcp-server` запускается и корректно отвечает на `stdio` сообщения.
- [ ] Все заявленные MCP Tools успешно пробрасывают запросы к `web/server.js`.
- [ ] Ошибка 409 (Conflict) и другие ошибки API корректно транслируются в MCP ошибки (ToolError).
- [ ] Создана спецификация `openspec/specs/mcp-server/spec.md`.

## Open Questions
- Хотим ли мы использовать Python MCP SDK или Node.js MCP SDK? (Node.js предпочтительнее для проксирования HTTP к Express).
- Какой ИИ-клиент вы планируете использовать для отправки голоса? (Claude Desktop, Cursor, кастомный бот, или что-то еще?).
