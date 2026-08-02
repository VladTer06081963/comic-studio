# web-comic-rendering-pipeline Specification

## Purpose
End-to-end pipeline от scenario до готового HTML+PNG комикса: scenario в `data/scenarios/<status>/<id>.json` → `comic_assembler.assemble_comic` → `data/comics/<id>.html` + `data/comics/<id>.png` + `data/comics/<id>/layout.json` + `data/comics/<id>/fonts/*.woff2`. Описывает контракт между Python-рендерером и Web-сервером, а также observability события.
## Requirements
### Requirement: Pipeline integrity
При initial render или rerender `py/render/comic_assembler.assemble_comic` MUST:
1. Сгенерировать `data/comics/<id>/layout.json` (манифест);
2. Скопировать `py/render/html_renderer/static/fonts/*.woff2` в `data/comics/<id>/fonts/`;
3. Вызвать `html_renderer.render_html(layout, data/comics/<id>.html)` для HTML;
4. Сгенерировать `data/comics/<id>.png` (PNG-preview) через `_comic_lib.assemble_grid`;
5. Вернуть `Path` к PNG (backward-compat).

#### Scenario: Initial render produces all artifacts
- **WHEN** `assemble_comic(panel_paths, captions, output_png, preview_mode="with-bubbles", style="bubble", layout="comic", scenario=...)`
- **THEN** создаются: `data/comics/<id>.png`, `data/comics/<id>.html`, `data/comics/<id>/layout.json`, `data/comics/<id>/fonts/Bangers.woff2` (5 шрифтов)

#### Scenario: Rerender preserves old artifacts
- **WHEN** rerender сценария `c6964b6a` создаёт новые `data/comics/c6964b6a.html` и `data/comics/c6964b6a.png`
- **THEN** новые файлы **перезаписывают** старые (т.к. это тот же render_revision), и `data/comics/c6964b6a/` панели + `data/comics/c6964b6a/layout.json` обновлены

### Requirement: Manifest content
`data/comics/<id>/layout.json` MUST содержать:
- `id` (string, scenario id);
- `title` (string, scenario title);
- `tone` (string, scenario tone);
- `image_style` (string, scenario image_style);
- `layout` (string, layout type);
- `created_at` (ISO-8601 timestamp);
- `fonts` (dict: bubble_style → font_name);
- `panels` (list of 3-4 dicts с `n`, `image`, `caption`, `bubble_style`, `bubble_position`).

#### Scenario: Manifest has required fields
- **WHEN** `layout.json` создаётся
- **THEN** JSON содержит все обязательные поля: id, title, tone, image_style, layout, created_at, fonts, panels

#### Scenario: Manifest panels have correct shape
- **WHEN** `layout.json` создаётся для сценария с 3 панелями
- **THEN** `panels` это list из 3 dicts, каждый с полями `n`, `image`, `caption`, `bubble_style`, `bubble_position`

### Requirement: HTML self-containment
`data/comics/<id>.html` MUST быть self-contained:
- inline-CSS в `<style>` блоке (не external `comic.css` ссылка);
- относительные пути для `<img src="./panel_*.png">`;
- относительные пути для `@font-face { src: url('./fonts/*.woff2') }`;
- никаких абсолютных URL (нет `http://...` или `/Users/...` в HTML).

#### Scenario: HTML is self-contained
- **WHEN** HTML создан
- **THEN** HTML не содержит external `comic.css` ссылок, и все `src`/`url()` относительные (`./...`)

#### Scenario: HTML contains no secrets
- **WHEN** HTML создан
- **THEN** HTML не содержит API tokens, путей вроде `/Users/...`, или env-значений

### Requirement: Observability events
`py/render/comic_assembler.assemble_comic` MUST эмитить структурированные log events:
- `comic.html_generated` (после успешного `render_html`) с `scenario_id`, `render_revision`, `html_path`, `layout`;
- `comic.preview_generated` (после успешного PNG-preview) с `scenario_id`, `preview_mode`, `preview_path`;
- `comic.manifest_generated` (после создания `layout.json`) с `scenario_id`, `manifest_path`.

#### Scenario: comic.html_generated emitted
- **WHEN** `assemble_comic` успешно генерирует HTML
- **THEN** в логах появляется запись `comic.html_generated` с scenario_id, render_revision, html_path, layout

#### Scenario: comic.preview_generated emitted
- **WHEN** `assemble_comic` успешно генерирует PNG-preview
- **THEN** в логах появляется запись `comic.preview_generated` с scenario_id, preview_mode, preview_path

### Requirement: Telegram caption linking
Telegram-бот (`tg-bot/bot.js`) MUST добавлять HTML-ссылку в caption при отправке фото, если задан env `WEB_PUBLIC_URL`:
- Caption формат: `"🎨 Комикс <title>... 🔗 HTML: <WEB_PUBLIC_URL>/comics/<id>.html"`;
- Inline-кнопка `[Открыть HTML](<WEB_PUBLIC_URL>/comics/<id>.html)` (Telegraf `Markup.button.url`).

#### Scenario: Telegram caption with HTML link
- **WHEN** Telegram-бот отправляет фото комикса, и `WEB_PUBLIC_URL=https://studio.example.com`
- **THEN** caption содержит `🔗 HTML: https://studio.example.com/comics/<id>.html`, и inline-кнопка `Открыть HTML` присутствует

#### Scenario: Telegram caption without HTML link (backward-compat)
- **WHEN** Telegram-бот отправляет фото комикса, и `WEB_PUBLIC_URL` НЕ задан (пустая строка)
- **THEN** caption НЕ содержит HTML-ссылку (как до этого change), и inline-кнопка не показывается

### Requirement: Configuration
`web/lib/config.js` MUST предоставлять env `WEB_PUBLIC_URL` (string, optional, default `''`):
- если пустая строка — Telegram-бот работает без HTML-ссылки (backward-compat);
- если URL — Telegram-бот добавляет HTML-ссылку в caption.

#### Scenario: WEB_PUBLIC_URL validation
- **WHEN** `loadConfig` вызывается с `WEB_PUBLIC_URL='https://studio.example.com'`
- **THEN** config содержит `webPublicUrl: 'https://studio.example.com'`

#### Scenario: WEB_PUBLIC_URL empty (default)
- **WHEN** `loadConfig` вызывается без `WEB_PUBLIC_URL`
- **THEN** config содержит `webPublicUrl: ''` (default, backward-compat)

