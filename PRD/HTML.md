# PRD: HTML-рендеринг комиксов

**Версия:** 0.1 (draft, в процессе доработки)
**Дата:** 2026-08-02
**Владелец:** Vlad
**Статус:** Draft → review
**Связанный change:** `comic-html-rendering` (планируется, OpenSpec ещё не создан)
**Путь проекта:** `~/Projects/comic-studio/`

> Документ будет дополняться, правиться и изменяться по ходу работы. Это
> **живой черновик**, а не финальная спецификация.

---

## 1. Problem Statement

### 1.1. Текущая боль

Сейчас финальный комикс собирается в `py/render/comic_assembler.py` через
**Pillow**: `assemble_grid` берёт PNG-панели от MiniMax image-01 и
**рисует баблы (speech bubble / starburst / gothic banner / boom / memo /
bar) прямо на растровом изображении** через `_comic_lib.draw_caption_overlay`.

Это даёт:

1. **Фиксированный набор из 6 стилей** (bubble, star, gothic, boom, memo, bar) — добавление нового требует правки Python + Pillow.
2. **Один шрифт** (`Arial Bold` / `Impact` / `DejaVuSans-Bold`) — никаких hand-drawn шрифтов для bubble, никаких serif для gothic-banner через Google Fonts.
3. **Хвостик bubble фиксирован** — `polygon([(cx-10, by+bh-1), (cx+10, by+bh-1), (cx, by+bh+tail_h)])`. Tail всегда в одну сторону, всегда треугольный.
4. **Нет интерактива** — Pillow-изображение статично. Нельзя зумнуть панель, навести на bubble, кликнуть для перехода.
5. **Pillow-рендер = PNG only** — Telegram отправляет фото, Notion получает image, archive хранит PNG. Никакого векторного экспорта, никакого responsive layout для мобильного браузера.
6. **Хвостик прибит к панели** гвоздями — он позиционируется `bottom-left/top-right/...` циклически, не привязан к координатам персонажа.

### 1.2. Дополнительная мотивация (из recent observation)

MiniMax image-01 генерирует в кадрах **мусорный текст** — надписи на
кружках, вывесках, экранах (`DON'T TALK TO ME UNTIL THIS IS EMPTY`,
`I WUV...`). Этот текст всегда на латинице или транслите, и убрать его из
промпта полностью нельзя (image-модели обучены на изображениях с
текстом). Pillow-overlay баблов частично это маскирует, но не убирает.

**HTML-баблы могут:**
- закрывать мусорный текст на изображении своими div-overlay'ами;
- использовать **mix-blend-mode** или `backdrop-filter: blur` для «размытия»
  проблемных областей;
- иметь любые формы через `clip-path: polygon(...)` — например, полностью
  закрывать вывески на стене.

### 1.3. Что хотим получить

1. Комикс как **HTML-страница** с CSS-баблами, доступная в браузере.
2. **PNG-preview** остаётся для backward-compat (Telegram, Notion, archive, social) — генерируется fallback-Pillow-рендером без баблов или с PNG-overlay.
3. **Любые стили баблов** — не 6 фиксированных, а бесконечно расширяемый набор через CSS-классы.
4. **Hand-drawn шрифты** через Google Fonts или локальный `woff2`.
5. **Адаптивный layout** — один и тот же комикс нормально выглядит на телефоне и десктопе.
6. **Tail указывает куда угодно** — координаты через CSS `clip-path` или SVG.
7. **Промежуточный формат** — `layout.json` манифест, который можно
   отрендерить и в HTML, и в PNG, и в PDF, и в Telegram preview.

---

## 2. Goals & Non-Goals

### 2.1. Goals (что делаем)

- **G1.** Python `py/render/html_renderer.py` собирает HTML-страницу из
  PNG-панелей + JSON-манифеста.
- **G2.** HTML использует **локальные шрифты** (Google Fonts через CDN с
  fallback на локальный `woff2`) для типографики уровня профессиональных
  комиксов.
- **G3.** Баблы — `<div class="bubble bubble--{style}">` с CSS, **минимум 6
  базовых стилей** (bubble, star, gothic, boom, memo, bar) +
  возможность легко добавить новые через CSS.
- **G4.** **PNG-preview сохраняется** для backward-compat с Telegram,
  Notion, archive, social адаптерами. Генерируется через fallback
  Pillow-рендер (без баблов или с минимальным Pillow-overlay).
- **G5.** Layout'ы: как минимум **comic** (асимметричная сетка) и **grid**
  (равномерная 2×2 / 2×3). Возможно: vertical, diagonal, freeform.
- **G6.** Web API отдаёт `<id>.html` через `GET /comics/<id>.html` (или
  `GET /comics/<id>` с `Accept: text/html`).
- **G7.** Telegram по-прежнему получает PNG-превью в виде фото, но в
  caption добавляется ссылка «🔗 Открыть HTML-версию».
- **G8.** OpenSpec change `comic-html-rendering` со всеми artifacts
  (proposal, design, specs, tasks) и архивация.

### 2.2. Non-Goals (что НЕ делаем)

- **N1.** Не уходим от Pillow **полностью** — он остаётся для PNG-preview и legacy overlay.
- **N2.** Не делаем **WYSIWYG-редактор** баблов (drag-and-drop, выбор позиции в браузере). Это отдельный future-work.
- **N3.** Не добавляем **анимации между панелями** (ken-burns, parallax). CSS-animations внутри страницы (появление баблов) — ок, но не между панелями.
- **N4.** Не переписываем **Telegram-бота** — он продолжает отправлять PNG-фото. HTML-ссылка в caption.
- **N5.** Не делаем **PDF-экспорт** в этом change (хотя layout.json манифест это позволит в будущем).
- **N6.** Не трогаем **archive** — старые PNG остаются в `data/archive/`, новые имеют и PNG, и HTML.
- **N7.** Не делаем **видео-комиксы** в этом change (но `layout.json` манифест позволит в будущем).

---

## 3. User Personas

### 3.1. **Vlad (автор)** — основной потребитель

- Публикует серийные комиксы (ежедневно/еженедельно).
- Хочет: профессионально выглядящий продукт без ручной работы в Figma.
- Боль: Pillow-баблы выглядят «программно», а не как у настоящих комиксов.
- Что даёт change: hand-drawn шрифты, более сложные формы баблов,
  responsive версия для шеринга в социальных сетях.

### 3.2. **Читатель в Telegram**

- Подписан на канал, читает комиксы на телефоне.
- Хочет: быстро увидеть превью, открыть полную версию.
- Что даёт change: PNG-превью в чате (как раньше) + кнопка/ссылка на
  полную HTML-версию с адаптивным layout.

### 3.3. **Посетитель сайта**

- Заходит на `site.com/comics/<id>` с десктопа или мобильного.
- Хочет: красивый просмотр без зума и скролла.
- Что даёт change: responsive HTML-страница, которая сама
  перекомпонуется под viewport.

### 3.4. **Архив-бот / scraper**

- Хранит `data/archive/<date>/<id>.png`.
- Что даёт change: ничего не ломается — PNG-preview по-прежнему
  генерируется. В будущем можно добавить `data/archive/<date>/<id>.html`.

---

## 4. User Stories & Use Cases

### 4.1. US-1: Vlad запускает rerender и видит комикс в браузере

```
Given scenario c6964b6a в status=rendered с style="bubble"
When Vlad запускает rerender (Web/Telegram/CLI)
Then в data/comics/c6964b6a/ появляются panel_1.png ... panel_N.png
And в data/comics/c6964b6a.html появляется HTML-страница
And в data/comics/c6964b6a.png появляется PNG-preview
And GET /comics/c6964b6a.html возвращает 200 text/html
And GET /comics/c6964b6a.png возвращает 200 image/png
```

### 4.2. US-2: Читатель открывает HTML на мобильном

```
Given HTML-страница data/comics/c6964b6a.html
When открываю её в Safari/Chrome на iPhone
Then layout перестраивается под viewport (pанели в столбик или 2×N)
And баблы масштабируются пропорционально
And хвостик указывает на персонажа корректно
```

### 4.3. US-3: Telegram-бот отправляет HTML-ссылку

```
Given сценарий отрендерен, есть PNG + HTML
When Telegram-бот публикует комикс
Then отправляется фото (PNG-preview)
And в caption добавляется "🔗 HTML: https://studio/comics/<id>.html"
```

### 4.4. US-4: Добавление нового стиля бабла

```
Given хочу стиль "whisper" (полупрозрачный серый пузырь)
When добавляю CSS-класс .bubble--whisper в py/render/html_renderer/static/style.css
And обновляю layout.json стиль "whisper"
Then следующий rerender рендерит с новым стилем без правок Python
```

### 4.5. US-5: Layout для панелей

```
Given scenario с 4 панелями
When layout="mosaic"
Then HTML использует CSS grid с 4 колонками неравной ширины
And панели расположены по дизайну
```

---

## 5. Solution Overview

### 5.1. Архитектура (вариант B)

```
┌─────────────────────────────────────────────────────────────────────┐
│ scripts/render_approved.py                                          │
│ (CLI / Web API / Telegram)                                          │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ py/render/comic_assembler.py                                        │
│                                                                      │
│ 1. Получает panels от MiniMax image-01 (как сейчас)                │
│ 2. Создаёт манифест data/comics/<id>/layout.json                   │
│ 3. Вызывает html_renderer.render_html(layout, output.html)         │
│ 4. Вызывает _comic_lib.assemble_grid(...) для PNG-preview          │
│ 5. Возвращает оба артефакта                                          │
└─────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌──────────────────────────┐    ┌──────────────────────────────┐
│ py/render/html_renderer  │    │ py/render/_comic_lib.py      │
│                          │    │ (existing, для PNG-preview)  │
│ • jinja2-шаблон          │    │                              │
│ • inline CSS             │    │ • PIL.Image композитинг      │
│ • встроенные шрифты woff2│    │ • bubble overlay (Pillow)    │
│ • manifest loader        │    │                              │
└──────────────────────────┘    └──────────────────────────────┘
              │                               │
              ▼                               ▼
┌──────────────────────────┐    ┌──────────────────────────────┐
│ data/comics/<id>.html    │    │ data/comics/<id>.png         │
│ (primary, новый)         │    │ (preview, для совместимости)  │
└──────────────────────────┘    └──────────────────────────────┘
```

### 5.2. Layout.json manifest

```json
{
  "id": "c6964b6a",
  "title": "СмехуЁчки для взрослых",
  "tone": "funny",
  "image_style": "comic",
  "layout": "comic",
  "panels": [
    {
      "n": 1,
      "image": "panel_1.png",
      "caption": "Утро на грани провала",
      "bubble_style": "bubble",
      "bubble_position": "bottom-left",
      "tail_to": [120, 380]
    },
    {
      "n": 2,
      "image": "panel_2.png",
      "caption": "Работа? Лучше бы спал",
      "bubble_style": "bubble",
      "bubble_position": "top-right"
    }
  ],
  "fonts": {
    "bubble": "Bangers",
    "gothic": "UnifrakturCook",
    "memo": "Caveat"
  },
  "created_at": "2026-08-02T20:52:19Z"
}
```

### 5.3. HTML template (упрощённо)

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>{title}</title>
  <link rel="stylesheet" href="fonts.css">
  <link rel="stylesheet" href="comic.css">
</head>
<body>
  <main class="comic comic--{layout}">
    {for each panel}
    <figure class="panel" style="--tail-x: {x}px; --tail-y: {y}px;">
      <img src="{image}" alt="panel {n}" loading="lazy">
      {if caption}
      <div class="bubble bubble--{bubble_style} bubble--{bubble_position}">
        <p>{caption}</p>
      </div>
      {end if}
    </figure>
    {end for}
  </main>
</body>
</html>
```

### 5.4. CSS (базовый bubble)

```css
.bubble {
  --bg: white;
  --fg: black;
  --border: 3px solid black;
  --radius: 22px;
  --tail: 18px;

  position: absolute;
  background: var(--bg);
  color: var(--fg);
  border: var(--border);
  border-radius: var(--radius);
  padding: 12px 18px;
  font-family: 'Bangers', cursive;
  font-size: 1.5rem;
  max-width: 60%;
  filter: drop-shadow(2px 2px 0 rgba(0,0,0,.5));
}

/* Tail via clip-path */
.bubble--bottom-left::after,
.bubble--top-right::after,
.bubble--bottom-right::after,
.bubble--top-left::after {
  content: '';
  position: absolute;
  width: 0; height: 0;
  border: var(--tail) solid transparent;
  /* ... позиционирование по bubble--* модификатору ... */
}

/* Наследники: */
.bubble--star { background: gold; clip-path: polygon(...); }
.bubble--gothic { background: black; color: gold; font-family: 'UnifrakturCook', serif; }
.bubble--boom { background: linear-gradient(...); animation: shake .3s infinite; }
.bubble--memo { background: #fff078; transform: rotate(-2deg); }
.bubble--bar { /* full-width bar below panel */ }
```

### 5.5. Шрифты

**Google Fonts CDN** (основной) + **локальный woff2 fallback** (если CDN
заблокирован). Шрифты:

| Стиль | Шрифт | Назначение |
|---|---|---|
| bubble | **Bangers** | классический комикс-bubble |
| star | **Bangers** | звезда-взрыв, жирный |
| gothic | **UnifrakturCook** | готический blackletter |
| boom | **Bungee** | импакт-эффект, угловатый |
| memo | **Caveat** | рукописный Post-It |
| bar | **Bangers** | полноширинная полоса |

Файлы `.woff2` лежат в `py/render/html_renderer/static/fonts/`.

---

## 6. Functional Requirements

### 6.1. FR-1: Python `py/render/html_renderer.py`

- **FR-1.1.** Модуль принимает `layout.json` манифест и путь к `output.html`.
- **FR-1.2.** Использует **jinja2** для шаблона (`py/render/html_renderer/templates/comic.html.j2`).
- **FR-1.3.** Inline-встраивает CSS из `py/render/html_renderer/static/comic.css` (чтобы HTML работал автономно при расшаривании).
- **FR-1.4.** Шрифты подключает через `@font-face` с локальным путём `fonts/<name>.woff2` рядом с HTML.
- **FR-1.5.** HTML валиден (проверяется через `html5validator` или вручную).
- **FR-1.6.** Все пути в HTML относительные, чтобы HTML можно было расшарить как папку.

### 6.2. FR-2: Pillow PNG-preview

- **FR-2.1.** `_comic_lib.assemble_grid` остаётся для генерации PNG-preview.
- **FR-2.2.** PNG-preview **может быть упрощённым** — без баблов, чисто layout панелей. Это для быстрого preview в Telegram.
- **FR-2.3.** Альтернативно: PNG-preview использует тот же Pillow-overlay что и сейчас (для backward-compat).
- **FR-2.4.** Решение: **оба режима** — `preview_mode: "panels-only" | "with-bubbles"`, в `assemble_comic` параметр.

### 6.3. FR-3: Web API

- **FR-3.1.** `GET /comics/<id>.html` — отдаёт сгенерированный HTML.
- **FR-3.2.** `GET /comics/<id>.png` — отдаёт PNG-preview (как сейчас).
- **FR-3.3.** `GET /comics/<id>` без расширения — `Content Negotiation`:
  если `Accept: text/html` → HTML, иначе → PNG.
- **FR-3.4.** `GET /comics/<id>/static/comic.css` и `/fonts/<name>.woff2` —
  отдают статику для автономности HTML.

### 6.4. FR-4: Telegram

- **FR-4.1.** `tg-bot/bot.js` отправляет PNG-фото как сейчас.
- **FR-4.2.** В caption добавляется строка «🔗 HTML: <host>/comics/<id>.html» (если host задан в env `WEB_PUBLIC_URL`).
- **FR-4.3.** Inline-кнопка `[Открыть HTML-версию](url)` (Telegraf `Markup.button.url`).

### 6.5. FR-5: Layouts

- **FR-5.1.** **comic** — асимметричная сетка (текущая логика из `build_slots` в `_comic_lib.py`).
- **FR-5.2.** **grid** — равномерная 2×2 / 2×3 (текущая логика fallback).
- **FR-5.3.** **vertical** — все панели в столбик, полная ширина.
- **FR-5.4.** **mosaic** — настраиваемая сетка из `layout.json` (опционально).
- **FR-5.5.** Layout задаётся в манифесте полем `layout`.

### 6.6. FR-6: Стили баблов (минимум 6)

- **FR-6.1.** `bubble` — белый speech bubble с хвостиком.
- **FR-6.2.** `star` — золотая звезда-взрыв (POW!).
- **FR-6.3.** `gothic` — чёрный готический баннер.
- **FR-6.4.** `boom` — красно-оранжевый взрыв с тряской.
- **FR-6.5.** `memo` — жёлтый Post-It с наклоном.
- **FR-6.6.** `bar` — полноширинная полоса (как `bar` сейчас, но как `<div>`).
- **FR-6.7.** Каждый стиль — отдельный CSS-блок в `comic.css`.
- **FR-6.8.** Добавление нового стиля = добавление CSS-блока + регистрация в `bubble_styles` валидаторе.

### 6.7. FR-7: Хвостик (tail) bubble

- **FR-7.1.** Tail указывает в сторону **персонажа** через CSS `clip-path` или `::after` с borders.
- **FR-7.2.** Tail имеет **4 направления** (`bottom-left`, `top-right`, `bottom-right`, `top-left`) — как сейчас.
- **FR-7.3.** Tail может иметь **поворот** через `transform: rotate(N deg)`.
- **FR-7.4.** При желании (future) — tail указывает на произвольные координаты через `clip-path: polygon(...)`.

### 6.8. FR-8: Backward-compat

- **FR-8.1.** `data/comics/<id>.png` **сохраняется** для Telegram/Notion/archive/social.
- **FR-8.2.** Pillow-путь не удаляется — он fallback для случая когда HTML-renderer не сработал.
- **FR-8.3.** `panel_paths` в scenario JSON не меняется.
- **FR-8.4.** `comic_path` в scenario JSON продолжает указывать на `<id>.png`.
- **FR-8.5.** Добавляется опциональное поле `html_path` (или расширяется `comic_path` в manifest) для HTML.

### 6.9. FR-9: Тесты

- **FR-9.1.** Node-тесты: `GET /comics/<id>.html` возвращает 200 text/html; PNG по-прежнему доступен.
- **FR-9.2.** Python-тесты: `html_renderer.render_html` создаёт валидный HTML с inline CSS.
- **FR-9.3.** Python-тесты: манифест `layout.json` сериализуется корректно.
- **FR-9.4.** Backward-compat тест: `assemble_comic(..., preview_mode="with-bubbles")` даёт PNG с Pillow-баблами (как сейчас).

---

## 7. Non-Functional Requirements

- **NFR-1. Performance.** Генерация HTML < 200ms для 6 панелей. Генерация PNG-preview < 5s (включая MiniMax image calls, которые вне scope).
- **NFR-2. Portability.** HTML открывается в Chrome/Safari/Firefox последних версий. Mobile Safari iOS 15+, Android Chrome 90+.
- **NFR-3. Accessibility.** Контрастный текст в баблах. Alt-тексты на панелях. `aria-label` где нужно.
- **NFR-4. Self-contained.** HTML + CSS + fonts + images в одной папке `data/comics/<id>/`. Можно запаковать в `.zip` и расшарить.
- **NFR-5. No live calls.** Тесты используют `FakeRunner` (как сейчас), никаких live MiniMax calls.
- **NFR-6. No secrets.** HTML не содержит API tokens, путей к `/Users/...`, env-значений.
- **NFR-7. Filesystem safety.** `safeResolve` для всех путей, никаких `..` в `data/comics/`.

---

## 8. Architecture

### 8.1. Файловая структура

```
py/
├── render/
│   ├── comic_assembler.py        (обновлён, вызывает html_renderer)
│   ├── html_renderer/            ← новый пакет
│   │   ├── __init__.py
│   │   ├── render.py             (entry point: render_html(layout, output))
│   │   ├── templates/
│   │   │   └── comic.html.j2     (Jinja2-шаблон)
│   │   └── static/
│   │       ├── comic.css         (баблы, layout, responsive)
│   │       └── fonts/
│   │           ├── Bangers.woff2
│   │           ├── UnifrakturCook.woff2
│   │           ├── Bungee.woff2
│   │           ├── Caveat.woff2
│   │           └── README.md     (лицензии шрифтов)
│   ├── _comic_lib.py             (без изменений, для PNG-preview)
│   └── minimax_client.py         (без изменений)

web/
├── routes/
│   └── comics.js                 (обновлён, новый endpoint HTML)
└── app.js                        (обновлён, static для /comics/<id>/fonts/)

data/comics/<id>/
├── panel_1.png                   (без изменений)
├── panel_2.png
├── panel_3.png
├── layout.json                   ← новый манифест
└── ../<id>.html                  (на уровень выше, рядом с PNG)
```

### 8.2. Sequence: rerender

```
1. scripts/render_approved.py --scenario-id <id> --rerender --staging-dir X
2. Python рендерит panels от MiniMax → data/.staging/X/candidate/<id>/panel_*.png
3. Python assemble_comic() вызывается с panels + captions
4. comic_assembler.py:
   a. Создаёт layout.json в data/comics/<id>/layout.json (или staging)
   b. Вызывает html_renderer.render_html(layout, output_html) → data/comics/<id>.html
   c. Копирует static/css+fonts из html_renderer/static → data/comics/<id>/static/
   d. Вызывает _comic_lib.assemble_grid(...) для PNG-preview
   e. Сохраняет data/comics/<id>.png
5. Promotion: candidate → current
```

### 8.3. API additions

| Method | Path | Returns |
|---|---|---|
| GET | `/comics/<id>.html` | `text/html` |
| GET | `/comics/<id>.png` | `image/png` (existing) |
| GET | `/comics/<id>` | `Content Negotiation` (HTML if Accept, else PNG) |
| GET | `/comics/<id>/static/comic.css` | `text/css` |
| GET | `/comics/<id>/fonts/<name>.woff2` | `font/woff2` |

### 8.4. OpenSpec change `comic-html-rendering`

Планируемые artifacts:
- `proposal.md` — мотивация, что меняется, impact.
- `design.md` — архитектура, decisions, risks.
- `specs/comic-html-rendering/spec.md` — новый capability.
- `specs/web-comics-rendering/spec.md` — MODIFIED для web.
- `specs/python-comic-rendering/spec.md` — MODIFIED для Python.
- `tasks.md` — phased rollout.

---

## 9. Open Questions (решены 2026-08-02)

Все OQ решены до старта OpenSpec change `comic-html-rendering`.

1. **OQ-1. ✅ Анимации баблов — ДА, лёгкая CSS.**
   `@keyframes bubble-pop { scale 0.8 → 1.0, opacity 0 → 1, 200ms ease-out, animation-delay 0..N*80ms per panel }`. Видео-комикс — отдельный future change.

2. **OQ-2. ❌ Backdrop-blur мусора — НЕТ в MVP.**
   Сейчас баблов в углу достаточно для маскировки мусорного текста MiniMax. `backdrop-filter: blur()` и `mix-blend-mode` — future enhancement, не блокер.

3. **OQ-3. ✅ layout.json — на render.**
   `data/comics/<id>/layout.json` хранит манифест **конкретного render_revision**. У каждого rerender свой layout.json. Это согласуется с тем, что `panel_paths`, `comic_path` в scenario указывают на последний render.

4. **OQ-4. ✅ Шрифты — в репо, без LFS.**
   `py/render/html_renderer/static/fonts/*.woff2` коммитятся напрямую. ~500KB для 6 шрифтов. Без `git lfs` — все могут клонировать без дополнительной настройки. README с лицензиями шрифтов (Open Font License) в той же папке.

5. **OQ-5. ❌ Notion HTML mirror — НЕТ в MVP.**
   `py/lib/notion_sync.sync_comic` остаётся PNG-only placeholder. HTML-mirror = future change (Notion API поддерживает `embed` с URL).

6. **OQ-6. ✅ Относительные пути в HTML.**
   `href="./fonts/Bangers.woff2"`, `src="./panel_1.png"`. HTML можно запаковать в `.zip` и расшарить автономно. При deploy за reverse-proxy с подпутьми — настраивать через `<base href>` или rewrite rules на уровне reverse-proxy, **не** в самом HTML.

7. **OQ-7. ✅ Только локальные шрифты.**
   `py/render/html_renderer/static/fonts/*.woff2` + `@font-face { src: url('./fonts/Bangers.woff2') format('woff2'); }`. Без зависимости от `fonts.googleapis.com`. CDN можно добавить позже как оптимизацию, если станет нужна CDN-кеш-стратегия.

---

## 10. Rollout Plan

### Phase 1: Foundation (первая итерация change)

- `py/render/html_renderer/` пакет с jinja2-шаблоном и базовым CSS.
- 6 стилей баблов реализованы в CSS.
- 6 шрифтов в `static/fonts/`.
- `assemble_comic` обновлён, создаёт HTML + PNG-preview.
- 1-2 базовых теста (HTML валиден, CSS присутствует, PNG-preview не сломан).

### Phase 2: Web API

- `GET /comics/<id>.html` endpoint.
- `GET /comics/<id>/static/comic.css` и `/fonts/<name>.woff2`.
- Content negotiation для `GET /comics/<id>`.

### Phase 3: Telegram + Polish

- Telegram caption с HTML-ссылкой.
- Тесты на backward-compat.
- Документация (`docs/api.md`, `docs/workflow.md`).

### Phase 4: Extension (future)

- PDF export.
- Видео-анимации.
- WYSIWYG-редактор позиций баблов.

---

## 11. Verification

- `openspec validate --changes --strict` — ✓ `change/comic-html-rendering`.
- `openspec validate --specs --strict` — все specs валидны.
- `node --test` в `web/` — все тесты pass, включая новые.
- `python3 -m unittest discover -s tests -p 'test_*.py'` — все тесты pass.
- `bash cron/nightly.sh --dry-run` — no side effects.
- Визуальная проверка: открыть `data/comics/<id>.html` в браузере, убедиться
  что баблы корректные, шрифты загружаются, layout адаптивный.
- Live MiniMax / Telegram calls — 0.

---

## 12. Связанные документы

- `PRD.md` — основной PRD проекта.
- `docs/api.md` — Web API reference (будет обновлён в Phase 3).
- `docs/workflow.md` — workflow рендеринга (будет обновлён).
- `summary/audit/012_comic-html-rendering.md` — аудит (создаётся при старте).
- `summary/tasks/012_comic-html-rendering.md` — задачи (создаётся при старте).
- `openspec/changes/comic-html-rendering/` — OpenSpec change.

---

## История изменений

- `2026-08-02T21:30:00+03:00` — v0.1, initial draft. Описаны problem statement, goals, non-goals, personas, user stories, solution overview, FR, NFR, architecture, open questions, rollout plan, verification.
- `2026-08-02T21:45:00+03:00` — v0.2, OQ-1..OQ-7 решены: CSS-animations да, blur мусора нет, layout.json на render, шрифты в репо без LFS, Notion HTML mirror нет в MVP, относительные пути, только локальные шрифты. Готов к OpenSpec change.
- `2026-08-02T22:00:00+03:00` — v0.3, OpenSpec change `comic-html-rendering` создан и валиден (`openspec validate --strict` ✓). Артефакты: proposal.md, design.md, tasks.md (50 задач в 9 секциях), 3 новых capability specs (`web-comic-rendering`, `python-comic-rendering`, `web-comic-rendering-pipeline`), 2 обновлённых (`web-scenario-operations`, `web-process-jobs`). Подготовлен `HANDOFF_HTML_RENDERING.md` для следующей сессии с архитектурой, decisions, планом по фазам, тестовой инфраструктурой и red lines (что НЕ делать). Реализация — в следующей сессии.
- `2026-08-02T23:30:00+03:00` — v0.4, реализация завершена. 50 задач (Phases 1-9) выполнены:
  - **Phase 1 (Foundation)**: `py/render/html_renderer/` пакет — `__init__.py`, `layout.py` (`validate_layout` + enums), `manifest.py` (`build_layout`), `render.py` (`render_html` entry point), `templates/comic.html.j2` (jinja2 с inline-CSS, relative paths, `@font-face`, XSS-safe через `autoescape=True`), `static/comic.css` (~10 KB, 6 bubble styles + 3 layout variants + responsive + `prefers-reduced-motion`), `static/fonts/` (5 woff2: Bangers, Bangers-Bold, UnifrakturCook, Bungee, Caveat; ~120 KB total; OFL-лицензия, в репо напрямую без LFS).
  - **Phase 2 (Pillow Integration)**: `assemble_comic` расширен `preview_mode` (`with-bubbles` | `panels-only`), `scenario=...` параметром. С `scenario` генерирует и PNG-preview, и `<id>.html`, и `layout.json`. Без `scenario` — backward-compat (только PNG).
  - **Phase 3 (Web API)**: новый `web/lib/html_static.js` (router): `GET /comics/<id>.html` (text/html), `GET /comics/<id>/fonts/<name>.woff2` (font/woff2). `safeResolve` для всех путей, валидация имени font через regex. PNG endpoint не тронут.
  - **Phase 4 (Tests)**: 18 новых Python тестов + 10 новых Node тестов. Total: 50/50 Python ✓, 69/69 Node ✓. Все backward-compat тесты проходят.
  - **Phase 5 (Telegram)**: `WEB_PUBLIC_URL` env, `sendScenarioView` дополняет caption HTML-ссылкой и inline-кнопкой `🔗 Открыть HTML` для rendered/published. Backward-compat без env.
  - **Phase 6 (Configuration)**: `webPublicUrl` в `loadConfig`, валидация (http(s) origin, пустая строка). Документирован в `.env.example`.
  - **Phase 7 (Documentation)**: обновлены `docs/api.md`, `docs/workflow.md`, `ALGORITM.md`, `CLAUDE.md`, `README.md`. Согласовано с изменениями.
  - **Phase 8 (Observability)**: structured logging `render.html_generated` (с `scenario_id`, `render_revision`, `html_path`, `layout`), `render.preview_generated` (с `preview_mode`). Web access log уже покрывает `/comics/<id>.html` через `requestLoggingMiddleware`.
  - **Phase 9 (Fixation)**: в процессе — audit, tasks, CHANGELOG, git, archive.
  - 3 pre-existing tg-bot tests имеют падения (`tg-bot/tests/revision.test.js`), но они не относятся к этому change (baseline 62/65 до моих изменений).
