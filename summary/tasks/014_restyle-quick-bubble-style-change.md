# Tasks: Restyle — Quick Bubble Style Change

> Companion к `summary/audit/014_restyle-quick-bubble-style-change.md`.

**Дата:** 2026-08-02  
**Branch:** main  
**Commits:** 3 (`f9e6ef5`, `7258ddb`, `cf5bbc6`)

## Phase 1: Character Reference (commit `f9e6ef5`)

- [x] **1.1** `scripts/render_approved.py`: panel #1 генерируется последовательно (anchor)
- [x] **1.2** `encode_image_b64(panel_1.png)` после генерации первой панели
- [x] **1.3** Передача `subject_reference_b64` в `generate_image()` для panels 2-N
- [x] **1.4** Параллельный ThreadPool для panels 2-N (reference уже готов)
- [x] **1.5** Логирование: "anchor for character reference" / "with character reference"
- [x] **1.6** Smoke-test: imports OK, 50/50 Python tests pass

## Phase 2: Restyle CLI (commit `7258ddb`)

- [x] **2.1** `scripts/restyle.py` создан (4.4 KB)
- [x] **2.2** Загрузка scenario из `rendered/` или `published/` (статус required)
- [x] **2.3** Поиск `panel_*.png` в `data/comics/<id>/`
- [x] **2.4** Обновление `scenario.style` + `restyled_at` timestamp
- [x] **2.5** Вызов `assemble_comic()` с теми же панелями + новым `style`
- [x] **2.6** Сохранение обновлённого scenario JSON
- [x] **2.7** Валидация: статус должен быть `rendered` или `published`
- [x] **2.8** Валидация: `--style` ∈ {bubble, star, gothic, boom, memo, bar}
- [x] **2.9** Smoke-test: `python3 scripts/restyle.py --scenario-id 566ae498 --style gothic` → ✅ restyled
- [x] **2.10** `--json-result` для machine-readable output

## Phase 3: Telegram /restyle command (commit `7258ddb`)

- [x] **3.1** `bot.command('restyle', ...)` handler
- [x] **3.2** Парсинг `<id> <style>` из message text
- [x] **3.3** Валидация: 2 аргумента, ID существует, статус rendered/published, стиль валидный
- [x] **3.4** Skip if `oldStyle === style` (no-op optimization)
- [x] **3.5** Progress message во время `execAsync(scripts/restyle.py)`
- [x] **3.6** Success: HTML link (использует `WEB_PUBLIC_URL` если задан)
- [x] **3.7** Error handling: stderr/show errors as `❌` message
- [x] **3.8** Добавлено в `setMyCommands` (Telegram menu)

## Phase 4: Help expansion (commit `cf5bbc6`)

- [x] **4.1** Добавлена секция «🎨 Restyle» в `/help` команду
- [x] **4.2** Добавлена секция «📁 HTML комикс и его редактирование» в `/help`
- [x] **4.3** Аналогичные секции в Help-кнопке меню (`getMainMenu()`)
- [x] **4.4** Документация по ручной правке HTML:
  - Где текст caption'ов (внутри `<p>` баблов)
  - Как менять класс бабла (`bubble--bubble` → `bubble--gothic`)
  - Как менять позицию (`bubble--top-right` и т.д.)
- [x] **4.5** Предупреждение: ручные правки перезаписываются при rerender

## Phase 5: Verification

- [x] **5.1** `node -c tg-bot/bot.js` — синтаксис OK
- [x] **5.2** Node tests: 72/72 ✓
- [x] **5.3** Python tests: 50/50 ✓
- [x] **5.4** Smoke-test: restyle на 566ae498 успешно (bubble → gothic)
- [x] **5.5** Smoke-test: restyle с уже-нужным стилем → `ℹ️` no-op
- [x] **5.6** Все 3 коммита запушены в main

## Файлы

### Созданы

- `scripts/restyle.py` (4.4 KB)
- `summary/audit/014_restyle-quick-bubble-style-change.md` (этот аудит)
- `summary/tasks/014_restyle-quick-bubble-style-change.md` (этот файл)

### Изменены

- `scripts/render_approved.py` (character reference, +30 lines)
- `tg-bot/bot.js` (restyle command + help expansion, +90 lines)
- `CHANGELOG.md` (запись)

## Сравнение flows

| Операция | Time | Cost | Side effects |
|----------|------|------|--------------|
| Revision (full LLM) | 3-5 мин | 3-4 MiniMax calls | revoke + LLM + re-approval + re-render |
| Re-render (новый seed) | 1-2 мин | 3-4 MiniMax calls | staging + backup + новые панели |
| **Restyle** | **2-5 сек** | **0** | **PNG overlay + HTML регенерация** |
| **HTML ручная правка** | **0 сек** | **0** | **до следующего rerender** |

## Итог

✅ **Все 23 задачи выполнены.** Character consistency улучшена (subject_reference), restyle flow работает в 100x быстрее чем revision, help расширен.

Telegram-бот после рестарта подхватит `/restyle` команду и обновлённый `/help`. Пользователь увидит обе новые секции в `ℹ️ Помощь`.