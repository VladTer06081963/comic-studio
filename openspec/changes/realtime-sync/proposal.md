# Proposal: Real-time Sync Bot ↔ UI

## Проблема
Изменения в Telegram боте не сразу видны в Web UI и наоборот.

## Решение
WebSocket для мгновенной синхронизации.

## Архитектура
- Web Server публикует события при изменениях
- Web UI подписывается на события
- Telegram бот вызывает API → API публикует событие → UI обновляется

## События
- `scenario.created` — новый сценарий
- `scenario.updated` — изменение (approve/reject/feedback/edit)
- `scenario.deleted` — удаление
- `comic.rendered` — готовый комикс

## Impact
- Мгновенная синхронизация
- Без polling