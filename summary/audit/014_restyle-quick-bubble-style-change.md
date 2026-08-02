# Аудит: Restyle — Quick Bubble Style Change

## 1. Контекст

После архивации `comic-html-rendering` (013) пользователь обнаружил две UX-проблемы:

1. **Character inconsistency** — каждый вызов MiniMax image-01 генерирует персонажа независимо; без явного anchor между панелями персонаж «плавает» (другой цвет волос, телосложение, одежда).
2. **Смена стиля баблов = full revision** — пользователь нажал Revision → LLM переписал сценарий → re-approval → re-render (3-5 минут, MiniMax cost). Это избыточно когда нужно поменять только CSS-стиль баблов (`bubble → gothic`), не затрагивая сюжет и панели.

Этот change решает обе проблемы:

- **Character reference** (commit `f9e6ef5`): первая панель становится anchor'ом, передаётся как `subject_reference_b64` для panels 2-N. Консистентность улучшается.
- **Restyle** (commit `7258ddb`): отдельная команда `/restyle <id> <style>` для смены баблов без ре-рендера панелей. Быстро, дёшево, без потери character consistency.
- **Help expansion** (commit `cf5bbc6`): `/help` дополнен секциями про Restyle и ручное редактирование HTML.

## 2. Что реализовано

### Character reference (commit `f9e6ef5`)

- `scripts/render_approved.py`: Panel #1 генерируется без reference (это anchor), затем `encode_image_b64(panel_1.png)` → `subject_reference_b64` для panels 2-N
- API MiniMax уже поддерживает `subject_reference: [{ type: 'character', image_file: <base64> }]` (`minimax_client.py:43-46`), render-скрипт теперь его использует
- Параллельный pool для panels 2-N (быстрая часть pipeline)

### Restyle (commit `7258ddb`)

- **CLI**: `scripts/restyle.py --scenario-id ID --style STYLE`
  - Загружает scenario из `rendered/` или `published/`
  - Обновляет `scenario.style`
  - Вызывает `assemble_comic()` с теми же `panel_paths` и новым `style` → регенерирует PNG-overlay (Pillow) + HTML (`html_renderer`)
  - Сохраняет обновлённый scenario JSON с `restyled_at` timestamp
  - **Никаких вызовов MiniMax**
- **Telegram**: `bot.command('restyle', ...)` с валидацией стиля
  - Доступно для `rendered` и `published` (не для draft/approved/rejected)
  - Возвращает ссылку на обновлённый HTML
  - Добавлено в `setMyCommands` (Telegram bot menu)

### Help expansion (commit `cf5bbc6`)

Две новые секции в `/help` команде и в Help-кнопке меню:

1. **🎨 Restyle** — описание `/restyle` команды с примерами, time/cost comparison vs Revision
2. **📁 HTML комикс и его редактирование**:
   - Где лежат файлы (`data/comics/<id>.html`, `data/comics/<id>/`)
   - Как открыть (open в терминале, через Web UI)
   - Что такое self-contained (inline-CSS, относительные пути)
   - **Как редактировать вручную:**
     - Caption текст: внутри `<p>` тегов баблов
     - Стиль бабла: `class="bubble bubble--bubble"` → `bubble--gothic`
     - Позиция: `bubble--top-right|top-left|bottom-right|bottom-left`
   - ⚠️ Предупреждение: ручные правки перезаписываются при rerender

## 3. Решения и trade-offs

### Character reference

**Pro:**
- Бесплатное улучшение консистентности (использует существующий API parameter)
- Простая интеграция (одна точка изменения в pipeline)
- Поддерживает параллелизм для panels 2-N

**Con:**
- API может не гарантировать 100% консистентность — модель может частично «плавать»
- Один reference (panel #1) не покрывает multi-character сцены — это **out of scope** для MVP
- Anchor зависит от качества panel #1 — если первая панель плохая, остальные тоже плохие

### Restyle

**Pro:**
- 2-5 секунд vs 3-5 минут revision+rerender (100x быстрее)
- 0 MiniMax calls vs 3-4 calls (~$0.02-0.05 экономия на рест)
- Не теряет character consistency (панели не трогаем)
- Можно прыгать между 6 стилями сколько угодно раз
- Статус сценария остаётся `rendered`/`published` — не нужен re-approval

**Con:**
- Ограничено только стилями баблов (bubble/star/gothic/boom/memo/bar)
- Не позволяет менять текст caption'ов — для этого нужен Revision
- Не позволяет менять позиции баблов — пока нет UI для этого
- Не работает для `draft`/`approved` (нужен рендер сначала)

### Help expansion

**Pro:**
- Пользователь может найти команды без чтения кода
- Inline-документация прямо в Telegram
- Примеры ручной правки HTML для пользователей которые хотят fine-tune

**Con:**
- Увеличивает размер `/help` сообщения (может превысить Telegram limit для очень длинных help)
- Дублирование с `docs/` — но Help нужен для быстрого доступа в Telegram

## 4. Метрики

| Метрика | Значение |
|---------|----------|
| Commits | 3 (`f9e6ef5`, `7258ddb`, `cf5bbc6`) |
| New files | 1 (`scripts/restyle.py`, 4.4 KB) |
| Modified files | 1 (`tg-bot/bot.js`, +60 lines; `scripts/render_approved.py`, +30 lines) |
| Tests pass rate | 122/122 (Node 72 + Python 50) |
| Live provider calls | 0 в тестах |

## 5. Сравнение flows

| Операция | Time | Cost | Side effects |
|----------|------|------|--------------|
| Revision (full) | 3-5 мин | 3-4 MiniMax calls | atomic revoke, LLM regen, re-approval, re-render |
| Re-render | 1-2 мин | 3-4 MiniMax calls | staging dir, backup, new panels |
| **Restyle** | **2-5 сек** | **0 MiniMax calls** | **Только Pillow-overlay + HTML** |

## 6. Что дальше (out of scope)

- Multi-character reference (panel 1 + accumulated characters)
- Позиции баблов per-panel (UI для drag-and-drop в HTML)
- Bubble caption text editor (отдельный endpoint `/api/scenarios/:id/captions`)
- Шрифтовой picker (выбор шрифта не из 6 дефолтных)
- Стиль бабла per-panel (через layout.json + отдельная команда)

## 7. Ссылки

- `tg-bot/bot.js` — `/restyle` command, expanded `/help`
- `scripts/restyle.py` — CLI restyle
- `scripts/render_approved.py` — character reference pipeline
- `verification.md` — test results
- `summary/tasks/014_restyle-quick-bubble-style-change.md` — companion