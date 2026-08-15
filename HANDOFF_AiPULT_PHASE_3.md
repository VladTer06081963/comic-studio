# HANDOFF: AiPULT Phase 3 — Voice Input + Telegram MiniApp

> **Этот файл — точка входа для новой сессии.** Прочитай его полностью
> перед стартом работы. Здесь зафиксирован контекст, текущее состояние
> Phase 1 + 2 + 2.5, и план Phase 3 — чтобы агент не терял время на разведку.

---

## 1. Что это

AiPULT — это **чат-бот советник** в Web UI, который:
- Резолвит сценарий по **title** (не по ID — пользователь помнит "Кот в одиночестве")
- Генерирует **CommandCard** с командой для пользователя
- AI **никогда не выполняет команды сам** — пользователь видит ▶️ Run

**Phase 1 (зафиксирована 015):** backend — Python fuzzy resolver, MiniMax Text-01
wrapper с COMMAND_COOKBOOK, Node validator, subprocess runner, Express endpoints.

**Phase 2 (зафиксирована 016):** UI chat panel в `ui/index.html` (новый таб 🤖 AiPULT),
vanilla ES module, localStorage history, 4 action buttons, inline edit, mobile-first,
Telegram theme CSS variables. **+ 9 smoke-test bugfixes** (см. audit 016).

**Phase 2.5 (зафиксирована 017):** `?focus=<id>` deep-link from chat — подсвечивает
нужную карточку в dashboard (orange outline + pulse animation + auto-scroll + 3s
auto-cleanup).

**Phase 3 (TODO):** 🎤 Voice input + Telegram MiniApp.

---

## 2. Phase 3 scope (per PRD/AiPULT.md §9)

### 3.1 Voice input (🎤)
- Browser MediaRecorder → opus/ogg blob
- POST `/api/aipult/transcribe` (multipart)
- Backend: Whisper base (local, ~150MB модель, уже в `py/requirements.txt`)
- Russian + English support
- Latency < 3 sec для 30-sec audio
- Show transcription в input field до отправки (можно edit перед Enter)

### 3.2 Telegram MiniApp full integration
- Detect `window.Telegram?.WebApp` на load
- `initData` + HMAC validation (для security)
- `themeParams` → применяется к `--tg-theme-*` CSS variables (уже определены в `ui/aipult.css`)
- `CloudStorage` fallback для localStorage (если MiniApp открыт без браузерного storage)
- `WebApp.expand()` для fullscreen
- `Telegram.WebApp.BackButton` → назад в чате
- `MainButton` → submit message

### 3.3 Backward-compat
- Standalone Web UI (без Telegram) — продолжает работать как раньше
- Voice button в чат-панели — появляется ТОЛЬКО если `MediaRecorder` поддерживается
- Telegram theme — fallback к существующей dark/light палитре если не MiniApp

---

## 3. Ключевые решения (зафиксированы)

| Решение | Значение |
|---------|----------|
| **AI role** | Советчик, не executor. Генерирует команды, не выполняет |
| **Heuristic PRIMARY** | Node-side `parseHeuristic` для clear simple commands. LLM только для ambiguous |
| **Card style** | title-first presentation (primary → id+status → command → meta) |
| **Run gate** | `EXECUTABLE = new Set(['restyle'])` в Phase 1-2.5. Phase 3 может добавить `approve`/`delete` |
| **Storage** | localStorage PRIMARY, Telegram CloudStorage fallback (MiniApp) |
| **Theme** | CSS variables `--tg-theme-*` в `ui/aipult.css` (Phase 2 готовы, Phase 3 apply) |
| **Tests** | 110/110 Node ✓ + 69/69 Python ✓. Smoke-test выявил 9 bugs в Phase 2 — manual verification ОБЯЗАТЕЛЬНА |

---

## 4. Текущее состояние (Phase 1+2+2.5 зафиксировано)

### 4.1 OpenSpec specs (main)

```
openspec/specs/
├── python-aipult-router/      (Phase 1, 4 requirements)
├── web-aipult-chat/           (Phase 1, 4 requirements)
├── web-aipult-runner/         (Phase 1, 6 requirements)
└── web-aipult-ui/             (Phase 1+2+2.5, 7 requirements) ← ADDED focus highlight в 2.5
```

### 4.2 File structure (ключевые файлы)

**Python backend:**
- `py/lib/scenario_resolver.py` — fuzzy match + STOP_WORDS + best_score (whole+tokens+bigrams)
- `py/lib/aipult_client.py` — MiniMax Text-01 wrapper + COMMAND_COOKBOOK (~3 KB) + 4 typed exceptions
- `py/lib/scenario_resolver.py` — `extract_keywords` (drop ~80 stop words), `_best_score` (regex ≥3 chars)
- `scripts/restyle.py` — CLI для bubble style change (bubble→star→gothic etc.)

**Node backend:**
- `web/lib/aipult/resolver.js` — Node mirror of Python resolver (browser-safe)
- `web/lib/aipult/validator.js` — BROWSER-SAFE. Inline ID_RE, no imports from `web/lib/`
- `web/lib/aipult/ui_format.js` — 9 pure functions (formatCard, escapeHtml, etc.) — browser-safe
- `web/lib/aipult/heuristic.js` — Instant intent parser (9 intents × 6 styles), no LLM subprocess
- `web/lib/aipult/runner.js` — AipultRunner, defense-in-depth validation, audit log
- `web/lib/html_static.js` — `no-cache, must-revalidate` for HTML+PNG
- `web/routes/aipult.js` — 4 endpoints + `tryHeuristic` PRIMARY path + `parseHeuristic` for needsStyle hint
- `web/app.js` — static route `app.use('/web/lib/aipult', ...)` for browser-safe modules

**UI:**
- `ui/index.html` — 7 tabs (Create/Draft/Approved/Rendered/Comics/🤖 AiPULT/Help)
- `ui/aipult.js` — chat panel vanilla ES module (~520 строк, localStorage history 50, action handlers)
- `ui/aipult.css` — chat panel + cards + Telegram theme variables
- `ui/app.js` — `data-scenario-id` на cards, `loadTab()` focus logic, `activateTab()` для `?tab=`
- `ui/style.css` — `.card--focused` + `@keyframes pulse-focus`

**Tests:**
- `web/tests/aipult.test.js` (21) + `web/tests/aipult_ui_format.test.js` (11)
- `tests/test_scenario_resolver.py` (12) + `tests/test_aipult_client.py` (7)

### 4.3 Cache fix (Phase 2 lesson)
PNG/HTML cache headers: `no-cache, must-revalidate` (был `max-age=3600, immutable`).
Cache-busting в UI: `?t=${Date.now()}` на ссылках.

---

## 5. Phase 3 implementation plan

### 5.1 Voice input — file structure

```
py/
├── ingest/
│   └── voice.py              ← NEW: Whisper transcription endpoint
└── requirements.txt          ← has openai-whisper>=20231117 ✓

web/
├── routes/aipult.js          ← MODIFIED: add /transcribe endpoint
└── lib/aipult/
    └── (existing)

ui/
├── aipult.js                 ← MODIFIED: add 🎤 button + MediaRecorder
└── aipult.css                ← MODIFIED: style for 🎤 button
```

### 5.2 MiniApp — file structure

```
web/
├── lib/
│   └── miniapp.js            ← NEW: Telegram.WebApp wrapper
└── routes/aipult.js          ← MODIFIED: add /init endpoint for HMAC validation

ui/
├── aipult.js                 ← MODIFIED: detect MiniApp, use CloudStorage
└── aipult.css                ← (CSS variables already defined, just apply)
```

### 5.3 OpenSpec plan

Создать `openspec/changes/aipult-phase-3-voice-miniapp/`:
- `proposal.md` — motivation, scope, out-of-scope
- `design.md` — voice flow, MiniApp integration, security (HMAC)
- `tasks.md` — phased rollout
- `specs/web-aipult-voice/spec.md` — voice input requirements
- `specs/web-aipult-miniapp/spec.md` — MiniApp integration requirements

### 5.4 Key files to read first

1. `HANDOFF_AiPULT.md` (Phase 1+2 entry point) — architectural overview
2. `PRD/AiPULT.md` v0.3 — design doc
3. `summary/audit/016_aipult-phase-2-ui-chat-panel.md` — 9 bugs found + fixes (avoid same mistakes)
4. `ui/aipult.js` — current chat panel structure
5. `web/lib/aipult/heuristic.js` — pattern for new pure functions

### 5.5 Patterns to follow

- **Pure functions browser-safe** (no Node imports) — like `ui_format.js`, `validator.js`
- **Static route for browser-safe modules** — `app.use('/web/lib/aipult', ...)`
- **CSS.escape for user input** — security
- **Cache-Control: no-cache, must-revalidate** — avoid 1h cache trap
- **Instant path for common commands** (heuristic), LLM fallback for ambiguous
- **Tests without live provider calls** (mock LLM, mock subprocess)
- **Manual smoke test ОБЯЗАТЕЛЕН** — 9 bugs found in Phase 2 came from real usage

### 5.6 Voice input design

**Browser side (ui/aipult.js):**
```js
// 🎤 button in chat input area
const micBtn = document.createElement('button');
micBtn.textContent = '🎤';
micBtn.addEventListener('click', startRecording);

async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream, { mimeType: 'audio/ogg;codecs=opus' });
  const chunks = [];
  recorder.ondataavailable = e => chunks.push(e.data);
  recorder.onstop = async () => {
    const blob = new Blob(chunks, { type: 'audio/ogg' });
    const form = new FormData();
    form.append('audio', blob, 'recording.ogg');
    const resp = await fetch('/api/aipult/transcribe', { method: 'POST', body: form });
    const { text } = await resp.json();
    inputEl.value = text; // user can edit before send
  };
  recorder.start();
  // ... stop button UI
}
```

**Backend (py/ingest/voice.py):**
```python
from fastapi import FastAPI, File, UploadFile  # or use existing Express multipart parser
import whisper

_model = None

def _get_model():
    global _model
    if _model is None:
        _model = whisper.load_model("base")  # ~150MB
    return _model

def transcribe(audio_path: str) -> str:
    model = _get_model()
    result = model.transcribe(audio_path, language="ru", fp16=False)
    return result["text"]
```

**Route (web/routes/aipult.js):**
```js
import multer from 'multer'; // or use busboy
const upload = multer({ dest: '/tmp/aipult-audio' });

router.post('/transcribe', upload.single('audio'), asyncRoute(async (req, res) => {
  // Spawn Python: py/ingest/voice.py
  const result = await runner.run(config.pythonBin, ['py/ingest/voice.py', req.file.path], {
    timeoutMs: 30_000,  // Whisper can be slow
  });
  const text = result.stdout.trim();
  res.json({ text, duration_ms: ... });
}));
```

### 5.7 MiniApp design

**web/lib/miniapp.js:**
```js
// Browser-safe module (no Node imports)
export function initMiniApp() {
  if (!window.Telegram?.WebApp) return { isMiniApp: false };
  const tg = window.Telegram.WebApp;
  tg.ready();
  tg.expand(); // fullscreen

  // Apply theme
  if (tg.themeParams) {
    const p = tg.themeParams;
    if (p.bg_color) document.documentElement.style.setProperty('--bg', p.bg_color);
    if (p.text_color) document.documentElement.style.setProperty('--text', p.text_color);
    if (p.button_color) document.documentElement.style.setProperty('--accent', p.button_color);
    // ... etc
  }

  return { isMiniApp: true, tg, initData: tg.initData };
}

export function useCloudStorage(key) {
  const tg = window.Telegram?.WebApp;
  if (tg?.CloudStorage) {
    // Wrap Telegram CloudStorage as Promise-based localStorage-like API
    return {
      getItem: (k) => new Promise((res) => tg.CloudStorage.getItem(k, (e, v) => res(v))),
      setItem: (k, v) => new Promise((res) => tg.CloudStorage.setItem(k, v, res)),
    };
  }
  return null; // fallback to localStorage
}
```

**ui/aipult.js modification:**
```js
import { initMiniApp, useCloudStorage } from '../web/lib/miniapp.js';

const miniApp = initMiniApp();
const storage = useCloudStorage('aipult:history') || {
  getItem: (k) => Promise.resolve(localStorage.getItem(k)),
  setItem: (k, v) => Promise.resolve(localStorage.setItem(k, v)),
};

// Use storage instead of localStorage directly
```

### 5.8 Security

- **MiniApp HMAC validation**: server-side validate `initData` with bot token to prevent spoofing
- **Voice endpoint**: rate limit (5/min), max file size (10MB), max duration (60s)
- **File cleanup**: delete temp audio file after transcription
- **Whisper model**: load once at startup, cache globally

---

## 6. Что НЕ делать (out of scope)

- ❌ SSE streaming для execution output (Phase 4)
- ❌ Cost dashboard (Phase 4)
- ❌ `docs/aipult.md` full documentation (Phase 4)
- ❌ Real LLM subprocess fix (MiniMax API hangs — separate investigation)
- ❌ Inline HTML editor в чат-панели (отдельный change)
- ❌ Visual bubble style picker (отдельный change)
- ❌ Per-panel re-render (отдельный change)

---

## 7. Команды для верификации

```bash
# Baseline (должны проходить)
cd web && node --test --test-concurrency=1 tests/*.test.js
# → 110/110 ✓

cd .. && .venv/bin/python3 -m unittest discover -s tests -p 'test_*.py'
# → 69/69 ✓

# Регенерация cookbook при изменениях
.venv/bin/python3 -c "from py.lib.aipult_client import COMMAND_COOKBOOK; print(len(COMMAND_COOKBOOK), 'chars')"

# MiniMax routing test (требует API key)
.venv/bin/python3 -c "from py.lib.aipult_client import route_command; print(route_command('покажи 8eaa57cc'))"

# Cron dry-run (sanity check)
bash cron/nightly.sh --dry-run

# Lint (no new errors)
node --check web/lib/aipult/*.js web/routes/aipult.js
.venv/bin/python3 -m py_compile py/lib/scenario_resolver.py py/lib/aipult_client.py py/ingest/voice.py

# Whisper test (после установки модели)
.venv/bin/python3 -c "import whisper; model = whisper.load_model('base'); print(model.transcribe('/path/to/test.wav')['text'])"
```

---

## 8. Smoke test ОБЯЗАТЕЛЕН

Phase 2 нашёл 9 багов в smoke-тесте. **Перед фиксацией Phase 3** запусти:

1. **Voice input:**
   - [ ] Открыть 🤖 AiPULT, кликнуть 🎤 → записать "поменяй стиль у кота на star" → отпустить → текст в input
   - [ ] Edit текст → Send → card появляется
   - [ ] Записать тишину → 5+ секунд → handle gracefully (no error)
   - [ ] Записать > 60 сек → 413 Payload Too Large

2. **MiniApp:**
   - [ ] Открыть `https://your-domain.com/?focus=b16e0660` внутри Telegram MiniApp
   - [ ] Theme применяется (background, text, button colors)
   - [ ] CloudStorage работает (chat history persists across sessions)
   - [ ] WebApp.expand() → fullscreen
   - [ ] BackButton → назад в Telegram bot

---

## 9. Скоуп

**В этом change (Phase 3):**
- `py/ingest/voice.py` — Whisper transcription
- `web/lib/miniapp.js` — Telegram WebApp wrapper
- `web/routes/aipult.js` — add /transcribe + /init endpoints
- `ui/aipult.js` — 🎤 button + MediaRecorder + MiniApp init
- `ui/aipult.css` — 🎤 button style
- `web/tests/aipult_*.test.js` — 10-15 тестов
- 20-25 manual smoke test scenarios

**НЕ в этом change (out of scope):**
- SSE streaming (Phase 4)
- Cost dashboard (Phase 4)
- `docs/aipult.md` (Phase 4)
- LLM subprocess fix (separate investigation)
- Inline HTML editor (separate change)
- Visual bubble style picker (separate change)
- Per-panel re-render (separate change)

---

## 10. Контекст проекта

- **Репозиторий:** `/Users/vladteresena/Projects/comic-studio/`
- **Remote:** `https://github.com/VladTer06081963/comic-studio.git`
- **Branch:** `main` (up-to-date, commits f460a42, 63f1aea, 00a744f)
- **Владелец:** Vlad (solo dev)
- **Стек:** Python 3.x (jinja2, PIL, MiniMax, Whisper), Node.js (Express), Telegram (Telegraf), OpenSpec
- **OpenSpec CLI:** `openspec` (см. `openspec list`, `openspec validate`, `openspec archive`)
- **Active changes:** none (last archived: 017)
- **Main specs:** 4 (python-aipult-router, web-aipult-chat, web-aipult-runner, web-aipult-ui)

---

## 11. Связанные артефакты

- `HANDOFF_AiPULT.md` — entry point для Phase 1+2 (architectural overview)
- `PRD/AiPULT.md` v0.3 — design doc, 626 строк
- `HANDOFF_HTML_RENDERING.md` — pattern для handoff documents
- `CLAUDE.md` — главные правила для AI-агентов
- `summary/audit/013_*.md` — comic HTML rendering (завершён)
- `summary/audit/014_*.md` — restyle + character reference (завершён)
- `summary/audit/015_*.md` — Phase 1 backend (завершён)
- `summary/audit/016_*.md` — Phase 2 UI + 9 bugfixes
- `summary/audit/017_*.md` — Phase 2.5 focus highlight
- `CHANGELOG.md` — записи `2026-08-03T11:22:12+03:00`, `2026-08-03T13:27:27+03:00`, `2026-08-04T00:00:10+03:00`

---

## 12. Начало работы

```bash
# 1. Прочитай контекст
cat HANDOFF_AiPULT_PHASE_3.md            # ← ты здесь
cat HANDOFF_AiPULT.md                    # Phase 1+2 entry point
cat PRD/AiPULT.md                       # design doc

# 2. Проверь текущее состояние
git status                               # should be clean
git log --oneline -5                     # f460a42, 63f1aea, 00a744f
openspec list                            # No active changes
cd web && node --test tests/*.test.js    # 110/110 ✓
cd .. && .venv/bin/python3 -m unittest discover -s tests -p 'test_*.py'  # 69/69 ✓

# 3. Создай OpenSpec change
mkdir -p openspec/changes/aipult-phase-3-voice-miniapp/specs/{web-aipult-voice,web-aipult-miniapp}
# Напиши proposal.md, design.md, tasks.md, 2 specs

# 4. Phase 3 implementation (по tasks.md)
# - py/ingest/voice.py (Whisper)
# - web/lib/miniapp.js (Telegram WebApp wrapper)
# - web/routes/aipult.js (add /transcribe + /init)
# - ui/aipult.js (🎤 button + MediaRecorder + MiniApp init)
# + tests + manual smoke test

# 5. По завершении — фиксация (audit + tasks + CHANGELOG + git push + archive)
```

Удачи! Если найдёшь баги в smoke-тесте (а их будет несколько) — фиксируй в
том же change, как было в Phase 2 (9 багов → 9 фиксов → 1 commit).
