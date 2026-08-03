# Задачи: MCP Server Integration (ИИ-Агрегатор)

## Статус: ✅ Done

## Контекст
Цель — дать локальному ИИ-сценаристу (LM Studio) машинный интерфейс управления пайплайном Comic Studio. Для этого создается MCP (Model Context Protocol) сервер на Node.js, который будет транслировать команды от ИИ в HTTP запросы к `web/server.js`.

| ID | Задача | Статус |
|---|---|---|
| 1 | Создать пакет `mcp-server` с зависимостями `@modelcontextprotocol/sdk` | ✅ Done |
| 2 | Реализовать проксирование базовых API: `list_scenarios`, `get_scenario` | ✅ Done |
| 3 | Реализовать инструменты управления: `create_comic`, `approve_scenario`, `revise_scenario`, `render_comic` | ✅ Done |
| 4 | Добавить эндпоинт `POST /api/scenarios/:id/restyle` в `web/routes/scenarios.js` (перенос из бота) | ✅ Done |
| 5 | Реализовать инструмент `restyle_comic` в MCP | ✅ Done |
| 6 | Добавить интеграцию с AiPULT: инструмент `resolve_intent` | ✅ Done |
| 7 | Написать тесты и запустить MCP сервер для ручной проверки через инспектор | ✅ Done |
| 8 | (Опционально) Интеграция `transcribe_audio` из Phase 3, если ИИ-агенту нужен прямой парсинг аудиофайлов | ⬜ Skipped |

## Ограничения
- MCP сервер должен общаться с `web/server.js` по HTTP, чтобы переиспользовать всю логику `JobManager` и валидаций.
- Не дублировать логику работы с файловой системой `data/scenarios/` внутри MCP сервера.
- Использовать `stdio` транспорт для удобной интеграции с локальными агентами.
