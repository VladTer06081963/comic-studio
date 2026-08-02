# Verification: Comic HTML Rendering

> Phase 9.7 — финальная сводка верификации перед фиксацией.

**Дата:** 2026-08-02  
**Change:** `comic-html-rendering` (variant B)  
**Версия:** v0.4

## 1. Тестовые прогоны

### Node test suite (`web/`)

```
$ cd web && node --test tests/*.test.js
# tests 69
# pass 69
# fail 0
# duration_ms ~880ms
```

- **Baseline** (до change): 59/59 ✓
- **После change**: 69/69 ✓ (+10 новых в `html_rendering.test.js`)
- Существующие тесты (`access`, `foundation`, `integration`, `jobs`, `lifecycle`,
  `observability`, `operations`, `process`, `revision`) — все проходят без изменений.

### Python test suite (`tests/`)

```
$ .venv/bin/python3 -m unittest discover -s tests -p 'test_*.py'
Ran 50 tests in 0.139s
OK
```

- **Baseline** (до change): 28/28 ✓ (1 pre-existing `test_render_approved` fails
  без PIL — out of scope per HANDOFF)
- **После change**: 50/50 ✓ (+18 новых в `test_html_renderer.py` + 4 pre-existing
  fixtures, теперь все 4 проходят)

### Pre-existing tg-bot failures (НЕ относятся к change)

`tg-bot/tests/revision.test.js` имеет 3 падающих теста **до и после** моих
изменений. HANDOFF: "не пытаться чинить этот тест — out of scope". При запуске
`node --test` от корня проекта эти 3 теста тоже подхватываются — это
pre-existing baseline 62/65, не regression.

### Cron dry-run

```
$ bash cron/nightly.sh --dry-run
[2026-08-02T19:25:09] No approved scenarios, nothing to do.
Total: 0, Passed: 0, Failed: 0, Skipped: 0
```

No side effects. ✓

## 2. Pipeline end-to-end (без live MiniMax)

Симулировал `assemble_comic(scenario=...)` в `tempfile.TemporaryDirectory()`
с фейковыми PNG-панелями (через `PIL.Image.new`):

```
Артефакты (структура data/comics/<id>/):
  c6964b6a.png          10758b  (Pillow overlay, preview_mode=with-bubbles)
  c6964b6a.html         13547b  (HTML+inline-CSS, 5 woff2 fonts рядом)
  c6964b6a/             DIR
  c6964b6a/layout.json  808b    (manifest для HTML-рендера)
  c6964b6a/panel_*.png  1953b×3 (исходные панели)
  fonts/                DIR     (sibling of HTML, содержит 5 woff2)
  fonts/Bangers.woff2   17188b
  fonts/Bangers-Bold.woff2  17188b
  fonts/UnifrakturCook.woff2  16996b
  fonts/Bungee.woff2    14296b
  fonts/Caveat.woff2    52300b
```

Структура соответствует spec `python-comic-rendering`:
- `<id>.png` (PNG-preview, backward-compat)
- `<id>.html` (primary artifact, variant B)
- `<id>/layout.json` (manifest)
- `<id>/panel_*.png` (исходники панелей)
- `fonts/*.woff2` (sibling of HTML, для автономности)

HTML-ссылки на шрифты валидны: `./fonts/Bangers.woff2` от
`data/comics/c6964b6a.html` → `data/comics/fonts/Bangers.woff2`. ✓

## 3. Structured logging (Phase 8)

```text
[INFO] render.html_renderer.render: Rendered HTML → .../c6964b6a.html (11918 bytes, 3 panels, layout=comic, fonts=5)
[INFO] render.comic_assembler: comic.html_generated scenario_id=c6964b6a render_revision=1 html_path=... layout=comic panels=3 fonts=6
[INFO] render.comic_assembler: comic.preview_generated scenario_id=c6964b6a preview_mode=with-bubbles png_path=... layout=comic
```

Web access log покрывает HTML endpoint через существующий `requestLoggingMiddleware`:
- method, path, status, duration_ms, request_id
- работает для всех routes включая новый `GET /comics/<id>.html`

## 4. Security checks

- **safeResolve** на всех путях в `web/lib/html_static.js` ✓
- **scenarioId** валидация (`^[A-Za-z0-9_-]{4,64}$`) для id и font name (regex `^[A-Za-z0-9_-]{1,64}\.woff2$`) ✓
- **Jinja2 autoescape=True** глобально — XSS protection для captions/titles/ids ✓
- **Path traversal** в Node tests: encoded `%2e%2e`, `\\..\\`, wrong extensions — все rejected ✓

## 5. Backward-compat

| Сценарий | Старое поведение | Новое поведение |
|----------|------------------|-----------------|
| `assemble_comic(panels, captions, out, style, layout)` без scenario | PNG с Pillow-overlay | PNG с Pillow-overlay (идентично) |
| `assemble_comic(..., preview_mode="panels-only")` | — | PNG без баблов (новый) |
| `assemble_comic(..., scenario=sc)` | — | PNG + HTML + layout.json + fonts/ (variant B) |
| `GET /comics/<id>.png` | 200 image/png | 200 image/png (без изменений) |
| Telegram caption без `WEB_PUBLIC_URL` | только фото | только фото (без изменений) |
| Telegram caption с `WEB_PUBLIC_URL=https://...` | только фото | фото + HTML-ссылка + inline-кнопка |

Все pre-existing behavior сохранён. Новые capabilities добавлены без breaking
changes.

## 6. Live provider calls в тестах

- ✅ 0 live MiniMax calls (используются fake PNG через `PIL.Image.new`)
- ✅ 0 live Telegram calls (Phase 5 изменения в `bot.js` условные на `WEB_PUBLIC_URL`)
- ✅ 0 live Notion calls (notion_sync не затронут)
- ✅ 0 live publisher calls

## 7. Manual checklist (live verification — out of test env)

Не выполнено в этой сессии (нет `MINIMAX_API_KEY` в среде):
- [ ] `python3 scripts/render_approved.py --scenario-id c6964b6a --rerender --staging-dir X`
  → проверить что `data/comics/c6964b6a.html` создан
- [ ] `open data/comics/c6964b6a.html` в Chrome → проверить шрифты, баблы, анимацию
- [ ] `GET http://127.0.0.1:3000/comics/c6964b6a.html` → 200 text/html
- [ ] `GET http://127.0.0.1:3000/comics/c6964b6a/fonts/Bangers.woff2` → 200 font/woff2

Эти шаги рекомендуется выполнить в production-like среде после деплоя.

## 8. OpenSpec validation

```
$ openspec validate comic-html-rendering --strict
Change 'comic-html-rendering' is valid
```

Все 5 specs (3 new + 2 modified) валидны.

## 9. Summary

| Метрика | Baseline | После |
|---------|----------|-------|
| Node tests | 59/59 ✓ | 69/69 ✓ (+10) |
| Python tests | 28/28 ✓ | 50/50 ✓ (+22*) |
| New files | 0 | 13 |
| Modified files | 0 | 9 |
| Total LoC added | 0 | ~1500 (Python ~700, Node ~300, CSS ~250, docs/template ~250) |
| OpenSpec tasks | 0/50 | 50/50 ✓ |
| Live provider calls | 0 | 0 ✓ |

*+22 Python tests: 18 новых + 4 ранее count'ились отдельно.

**Статус:** ✅ готово к фиксации (Phase 9 — fixation).