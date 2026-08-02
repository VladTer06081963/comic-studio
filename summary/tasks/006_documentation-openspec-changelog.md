# Задачи: Синхронизация документации, OpenSpec и CHANGELOG

## Статус: 🟡 Ready for OpenSpec proposal

| ID | Задача | Статус |
|---|---|---|
| 1 | Провести аудит документации, кода, PRD, summary и OpenSpec | ✅ Done |
| 2 | Создать накопительный `CHANGELOG.md` и восстановить историю по Git | ✅ Done |
| 3 | Добавить обновление `CHANGELOG.md` в обязательную процедуру фиксации | ✅ Done |
| 4 | Создать OpenSpec change для согласования контрактов и документации | ⬜ Todo |
| 5 | Решить: approval только через Telegram или также через Web UI | ⬜ Todo |
| 6 | Решить lifecycle для re-render из `rendered`/`published` | ⬜ Todo |
| 7 | Определить семантику edit: feedback-only или регенерация сценария | ⬜ Todo |
| 8 | Восстановить канонические capability specs в `openspec/specs/` | ⬜ Todo |
| 9 | Исправить publication contract: site success, `published`, social и Notion | ⬜ Todo |
| 10 | Согласовать cron ordering, per-ID publication, exit codes, archive names и Telegram summary | ⬜ Todo |
| 11 | Добавить automated tests для approval gate, lifecycle, publication и cron | ⬜ Todo |
| 12 | Обновить `.env.example`, `README.md`, `ALGORITM.md`, `docs/architecture.md` и `docs/workflow.md` | ⬜ Todo |
| 13 | Синхронизировать OpenSpec delta specs, пройти validation и выполнить отдельную фиксацию | ⬜ Todo |

## Ограничения

- Не рендерить и не публиковать при выполнении документационной задачи.
- Не изменять существующие файлы в `data/archive/`.
- Не считать archived OpenSpec change доказательством завершённости без проверки кода и acceptance criteria.
- Новые записи `CHANGELOG.md` добавлять в конец в хронологическом порядке с ISO-8601 timestamp.
