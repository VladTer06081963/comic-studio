# HANDOFF: AiPULT — Voice/Chat Command Cards для Comic Studio

> **Этот файл — точка входа для новой сессии.** Прочитай его полностью
> перед стартом работы. Здесь зафиксирован контекст, текущее состояние,
> PRD и план — чтобы агент не терял время на разведку.

---

## 1. Что это

AiPULT — это **чат-бот в Web UI (и будущем Telegram MiniApp)**, который:
- Принимает голосовые/текстовые команды от пользователя на естественном языке
- Резолвит сценарий по **названию** (не по ID — пользователь помнит "Кот в одиночестве", а не "8eaa57cc")
- Генерирует **CommandCard** — карточку с терминальной командой для проверки
- AI **никогда не выполняет команды сам** — пользователь видит, может отредактировать и нажать ▶️ Run

**Паттерн proven:** GitHub Copilot suggestions, AWS Q command approval, Cursor diff review.

**Связанный документ:** `PRD/AiPULT.md` v0.3 (точка входа для дизайна).

---

## 2. Ключевые решения (зафиксированы)

| Решение | Значение |
|---------|----------|
| **Интерфейс** | Web UI chat panel (не Telegram bot — он co-exists как legacy) |
| **AI role** | Советчик, не executor. Генерирует команды, не выполняет |
| **User input** | Голос (Whisper local) или текст |
| **Scenario resolution** | Title fuzzy match (rapidfuzzy), не ID |
| **Card content** | id + title + status для визуальной проверки |
| **Recency fallback** | "последний rendered" → latest by created_at |
| **Disambiguation** | Если 2+ кандидата с score > 0.6 → warning |
| **LLM** | MiniMax Text-01 (уже в проекте), prompt cookbook |
| **Storage** | localStorage (Web) + Telegram CloudStorage (MiniApp) |
| **Theme** | Standalone Web + Telegram MiniApp CSS variables |
| **Actions** | Read / Edit / Run / Reject — все через UI buttons |
| **Backward-compat** | Telegram bot + CLI скрипты продолжают работать |

---

## 3. Текущее состояние (что сделано в последней сессии)

### Зафиксированные изменения (в main)

```
218ea6b chore(fixation): archive restyle + character reference change (014)
cf5bbc6 docs(tg-bot): expand /help with restyle command and HTML editing tips
7258ddb feat(restyle): quick bubble-style change без ре-рендера панелей
f9e6ef5 feat(render): use first panel as character reference for consistency
3fde8f0 fix(css): balanced desktop grid layout for comic--comic
43fbc21 fix(web): simplify panel endpoint to /comics/:id/:name (no /panels/ segment)
84b53a6 fix(html-renderer): correct relative paths for panels and fonts
5f71be7 chore(openspec): archive comic-html-rendering change
bc5fe5d feat: comic HTML rendering (variant B, comic-html-rendering change)
```

**Функционал:**
- ✅ Comic HTML rendering (variant B) — архивирован в OpenSpec
- ✅ Character reference (Panel #1 как anchor для MiniMax)
- ✅ `/restyle` команда (быстрая смена стиля баблов)
- ✅ Desktop layout fix (Panel 1 не гигантский)

### Новый артефакт

- ✅ `PRD/AiPULT.md` v0.3 — 626 строк, 28.7 KB. Полный PRD с:
  - Title-first resolution pattern
  - CommandCard schema (TypeScript interface)
  - COMMAND_COOKBOOK (system prompt)
  - MiniApp compatibility
  - 4-phase rollout plan

### Тесты

- ✅ **72/72 Node** ✓ (`web/`)
- ✅ **50/50 Python** ✓ (`tests/`)
- ✅ Live provider calls в тестах: 0

---

## 4. PRD (обязательно к прочтению)

**Файл:** `PRD/AiPULT.md` v0.3

**Структура:**
1. Problem (IDs незапоминаемые)
2. Solution (title-first cards + MiniApp)
3. Goals G1-G10 + Non-Goals N1-N6
4. 6 User Stories (title-restyle, discovery, recency, voice, ambiguity, MiniApp)
5. FR (8 групп)
6. NFR (5 групп)
7. Architecture (sequence, schema, COMMAND_COOKBOOK)
8. 4 Open Questions
9. Rollout (4 фазы)
10. Verification
11. История
12. Ссылки

**Ключевые секции для имплементации:**
- §7 Architecture — файловая структура, sequence diagram
- §7.3 CommandCard schema — TypeScript interface
- §7.4 COMMAND_COOKBOOK — полный system prompt для MiniMax

---

## 5. План: Phase 1 (с чего начать)

Из `PRD/AiPULT.md` §9 Rollout:

### Phase 1: Resolution + Backend (2-3 дня)

1. **`py/lib/scenario_resolver.py`** — fuzzy title/context match
   - `resolve_scenario(phrase) -> [candidates]`
   - Title: `fuzz.partial_ratio()`
   - Context: weighted 0.7x
   - Recency fallback
   - Disambiguation (score > 0.6 → list)
2. **`py/lib/aipult_client.py`** — MiniMax wrapper с COMMAND_COOKBOOK
3. **`web/lib/aipult/resolver.js`** — exposes via /api/aipult/resolve
4. **`web/routes/aipult.js`** — /api/aipult/chat endpoint
5. **`web/lib/aipult/validator.js`** — whitelist + regex проверка
6. **`web/lib/aipult/runner.js`** — subprocess execution с timeout
7. **10-15 тестов** (resolver, validator, runner, MiniMax wrapper)

### Phase 2: UI Chat Panel + Cards (1-2 дня)

1. `ui/index.html` — chat panel + Telegram theme variables
2. `ui/aipult.js` — vanilla JS: fetch, render cards с **title + id + status**
3. Inline edit mode
4. Card actions: Read / Edit / Run / Reject
5. Chat history в localStorage
6. Mobile-first responsive

### Phase 3: Voice + MiniApp (1-2 дня)

1. `py/ingest/voice.py` — Whisper endpoint
2. Browser MediaRecorder + 🎤 button
3. `web/lib/miniapp.js` — Telegram WebApp detection
4. CloudStorage fallback

### Phase 4: Polish (1 день)

1. SSE streaming для execution output
2. Cost dashboard
3. Documentation (`docs/aipult.md`)

---

## 6. Что НЕ делать

- ❌ Не использовать Telegram bot как primary interface — Web UI chat panel
- ❌ Не делать AI executor (auto-execute без подтверждения) — всегда card + user action
- ❌ Не заставлять пользователя диктовать ID по буквам — title-first
- ❌ Не использовать external CDNs (MiniApp их блочит)
- ❌ Не дублировать COMMAND_COOKBOOK между Python и Node — single source в `py/lib/aipult/cookbook.py`

---

## 7. Архитектурные подсказки

### Где искать похожий код

- **`py/scenario/writer.py`** — паттерн MiniMax chat call (`_call_minimax_chat`)
- **`py/lib/lifecycle.py`** — scenario loading patterns
- **`py/ingest/youtube.py`** — Whisper integration pattern (для voice)
- **`scripts/restyle.py`** — пример CLI команды (для cookbook)
- **`web/lib/validation.js`** — whitelist + regex валидация patterns
- **`web/lib/scenario_store.js`** — пример scenario access patterns
- **`web/tests/helpers.js`** — testing infrastructure
- **`ui/index.html`** — existing dashboard (расширяется chat panel)

### Storage paths

- `data/scenarios/{draft,approved,rendered,published,rejected}/<id>.json` — scenarios
- `data/comics/<id>.{png,html}` — rendered artifacts
- `data/comics/<id>/{panel_*.png,layout.json,fonts/}` — render assets
- `data/logs/aipult-YYYY-MM-DD.log` — audit log (new)

### Минимальные зависимости

- `rapidfuzzy` (fuzzy string matching) — нужно добавить в `py/requirements.txt`
- Whisper base — уже в зависимостях (`openai-whisper`)
- MiniMax Text-01 — уже используется в `py/scenario/writer.py`

---

## 8. Команды для верификации

```bash
# Baseline тесты (должны проходить)
cd web && node --test tests/*.test.js    # 72/72 ✓
cd .. && .venv/bin/python3 -m unittest discover -s tests -p 'test_*.py'  # 50/50 ✓

# Регенерация cookbook при изменениях
.venv/bin/python3 -c "
from py.lib.aipult_client import COMMAND_COOKBOOK
print(len(COMMAND_COOKBOOK), 'chars in cookbook')
"

# MiniMax routing test (требует API key)
.venv/bin/python3 -c "
from py.lib.aipult_client import route_command
card = route_command('поменяй стиль у кота на gothic')
print(card)
"

# Cron dry-run (sanity check)
bash cron/nightly.sh --dry-run

# Lint (no new errors)
node --check web/lib/aipult/*.js
.venv/bin/python3 -m py_compile py/lib/aipult_client.py py/lib/scenario_resolver.py
```

---

## 9. OpenSpec change (когда будешь готов)

Перед Phase 1 создать `openspec/changes/aipult-command-cards/`:

```bash
mkdir -p openspec/changes/aipult-command-cards/specs/{web-aipult-chat,python-aipult-router,web-aipult-runner}
```

**Артефакты:**
- `proposal.md` — motivation, impact, out of scope
- `design.md` — architecture, decisions, risks, migration
- `tasks.md` — phased rollout (4 фазы из PRD §9)
- `specs/web-aipult-chat/spec.md` — `/api/aipult/chat`, `/api/aipult/resolve`
- `specs/python-aipult-router/spec.md` — `scenario_resolver.py` + COMMAND_COOKBOOK
- `specs/web-aipult-runner/spec.md` — subprocess execution + audit log

После реализации → `openspec validate --strict` → `openspec archive`.

---

## 10. Скоуп

**В этом change (делаем):**
- `py/lib/scenario_resolver.py` — fuzzy match
- `py/lib/aipult_client.py` — MiniMax wrapper с cookbook
- `web/lib/aipult/` — resolver, validator, runner
- `web/routes/aipult.js` — chat endpoint
- `ui/aipult.js` + chat panel в `ui/index.html`
- `py/ingest/voice.py` — Whisper endpoint
- `web/lib/miniapp.js` — Telegram WebApp detection
- 20-25 тестов

**НЕ в этом change (out of scope):**
- Auto-execution без подтверждения
- Multi-step command chains
- Memory across conversations
- Custom commands per user
- Real-time collaboration (multi-user)

---

## 11. Контекст проекта

- **Репозиторий:** `/Users/vladteresena/Projects/comic-studio/`
- **Remote:** `https://github.com/VladTer06081963/comic-studio.git`
- **Branch:** `main` (up-to-date)
- **Владелец:** Vlad (solo dev)
- **Стек:** Python 3.x (jinja2, PIL, MiniMax), Node.js (Express), Telegram (Telegraf), OpenSpec
- **OpenSpec CLI:** `openspec` (см. `openspec list`, `openspec validate`, `openspec archive`)
- **Active changes:** none (последний archived: 014 restyle)
- **Main specs:** 9 (см. `openspec/list --specs`)

---

## 12. Связанные артефакты

- `PRD/AiPULT.md` v0.3 — **главный документ**, читай первым
- `PRD/HTML.md` v0.4 — HTML rendering (завершён, change archived)
- `PRD.md` — основной PRD проекта
- `HANDOFF_HTML_RENDERING.md` — паттерн handoff (как этот файл, но для предыдущего change)
- `CLAUDE.md` — главные правила для AI-агентов
- `summary/audit/013_comic-html-rendering.md` — реализация HTML
- `summary/audit/014_restyle-quick-bubble-style-change.md` — реализация restyle
- `scripts/restyle.py` — пример cached command (restyle)

---

## 13. Начало работы

```bash
# 1. Прочитай контекст
cat HANDOFF_AiPULT.md           # ← ты здесь
cat PRD/AiPULT.md              # главный PRD, 626 строк

# 2. Проверь текущее состояние
git status                      # should be clean
git log --oneline -5            # 218ea6b ...
openspec list                   # No active changes
cd web && node --test tests/*.test.js    # 72/72 ✓
cd .. && .venv/bin/python3 -m unittest discover -s tests -p 'test_*.py'  # 50/50 ✓

# 3. Создай OpenSpec change
mkdir -p openspec/changes/aipult-command-cards/specs/{web-aipult-chat,python-aipult-router,web-aipult-runner}
# Напиши proposal.md, design.md, tasks.md, 3 specs

# 4. Phase 1: Resolution + Backend
mkdir -p py/lib/aipult web/lib/aipult
# py/lib/scenario_resolver.py
# py/lib/aipult_client.py
# web/lib/aipult/{resolver,validator,runner}.js
# web/routes/aipult.js
# + tests

# 5. По завершении каждой фазы — отмечай в tasks.md
# 6. По завершении всех фаз — фиксация (audit, tasks, CHANGELOG, git push, archive)
```

Удачи! Vlad проснётся и захочет увидеть готовый Phase 1.