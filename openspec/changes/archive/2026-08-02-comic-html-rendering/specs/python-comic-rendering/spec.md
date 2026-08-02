## Purpose

Python пакет `py/render/html_renderer/` генерирует HTML-страницу комикса из layout-манифеста. Pillow-путь остаётся для PNG-preview, но HTML — основной артефакт для браузера/шеринга. Шрифты, CSS и шаблоны лежат в пакете и коммитятся в репо напрямую (без LFS, без CDN).

## ADDED Requirements

### Requirement: HTML rendering
Система SHALL предоставлять функцию `html_renderer.render_html(layout, output_path)` которая:
1. Валидирует `layout` через `validate_layout()`;
2. Рендерит jinja2-шаблон `comic.html.j2` с inline-CSS из `static/comic.css`;
3. Записывает результат в `output_path`;
4. Копирует `static/fonts/*.woff2` в `<output_dir>/fonts/` для автономности HTML.

#### Scenario: Valid layout renders HTML
- **WHEN** `render_html(layout, output_path)` вызывается с валидным манифестом (id, layout, panels, captions, bubble_styles, bubble_positions, fonts)
- **THEN** `output_path` существует, содержит валидный HTML с inline-CSS, и `<output_dir>/fonts/*.woff2` присутствуют

#### Scenario: Invalid layout rejected
- **WHEN** `render_html(layout, output_path)` вызывается с невалидным `bubble_style` (например, `"unknown"`)
- **THEN** `render_html` бросает `ValueError` с message `"invalid bubble_style: unknown"` и не пишет файл

#### Scenario: Invalid layout type rejected
- **WHEN** `render_html(layout, output_path)` вызывается с `layout="unknown"`
- **THEN** `render_html` бросает `ValueError` и не пишет файл

#### Scenario: Invalid panel count rejected
- **WHEN** `render_html(layout, output_path)` вызывается с `len(panels) != 3 and != 4`
- **THEN** `render_html` бросает `ValueError` с message `"invalid panel count: N, expected 3 or 4"`

### Requirement: Layout validation
Система SHALL предоставлять функцию `html_renderer.validate_layout(layout)` которая проверяет:
- `id` ∈ `^[A-Za-z0-9_-]{4,64}$`;
- `layout` ∈ `["comic", "grid", "vertical"]`;
- `panels` непустой, `len(panels) in {3, 4}`;
- каждый panel: `image` присутствует, `bubble_style` ∈ `["bubble", "star", "gothic", "boom", "memo", "bar", "none"]`, `bubble_position` ∈ `["bottom-left", "top-right", "bottom-right", "top-left"]`.

#### Scenario: Validate accepts valid layout
- **WHEN** `validate_layout` вызывается с валидным dict (id, layout="comic", 3 panels, valid styles/positions)
- **THEN** функция возвращает `None` (не бросает)

#### Scenario: Validate rejects invalid bubble_style
- **WHEN** `validate_layout` вызывается с `panel.bubble_style = "rainbow"`
- **THEN** функция бросает `ValueError` с указанием невалидного значения

#### Scenario: Validate rejects invalid bubble_position
- **WHEN** `validate_layout` вызывается с `panel.bubble_position = "center"`
- **THEN** функция бросает `ValueError` с указанием невалидного значения

### Requirement: Layout manifest builder
Система SHALL предоставлять функцию `html_renderer.build_layout(scenario, panel_paths, captions, bubble_styles, bubble_positions, layout, fonts)` которая возвращает dict, сериализуемый в `data/comics/<id>/layout.json`.

#### Scenario: Build layout returns correct shape
- **WHEN** `build_layout` вызывается с scenario, 3 panel paths, 3 captions, 3 bubble_styles, 3 bubble_positions, layout="comic", fonts=...
- **THEN** возвращается dict с `id`, `title`, `tone`, `image_style`, `layout`, `created_at`, `fonts`, `panels: [{n, image, caption, bubble_style, bubble_position}, ...]`

#### Scenario: Build layout mismatched lengths rejected
- **WHEN** `build_layout` вызывается с 3 panel_paths но 4 captions
- **THEN** функция бросает `ValueError` с message про несовпадение длин

### Requirement: Static assets bundled
Система SHALL содержать в `py/render/html_renderer/static/`:
- `comic.css` — стили для 6 базовых баблов + responsive layout;
- `fonts/Bangers.woff2`, `fonts/Bangers-Bold.woff2`, `fonts/UnifrakturCook.woff2`, `fonts/Bungee.woff2`, `fonts/Caveat.woff2` — 5 woff2 файлов для 6 стилей (bar использует Bangers);
- `fonts/README.md` — Open Font License (OFL) указания для каждого шрифта.

#### Scenario: Static assets are present
- **WHEN** Python пытается загрузить `py/render/html_renderer/static/comic.css`
- **THEN** файл существует в репо (закоммичен)

#### Scenario: All 5 font files are present
- **WHEN** Python пытается загрузить `py/render/html_renderer/static/fonts/Bangers.woff2` (или любой из 5)
- **THEN** файл существует и не пустой

### Requirement: Jinja2 template
Система SHALL содержать jinja2-шаблон `py/render/html_renderer/templates/comic.html.j2` который:
- Использует inline-CSS в `<style>` блоке (не external stylesheet);
- Использует относительные пути для `<img src="./panel_*.png">` и шрифтов;
- Включает `@font-face` declarations для 5 шрифтов;
- Включает CSS-анимацию `bubble-pop` (OQ-1: да);
- Безопасно авто-эскейпит captions, titles, ids (XSS protection).

#### Scenario: Template renders safe HTML
- **WHEN** jinja2 рендерит шаблон с caption содержащим `<script>alert(1)</script>`
- **THEN** вывод содержит `&lt;script&gt;` (escaped), а не сырой `<script>`

#### Scenario: Template uses relative paths
- **WHEN** jinja2 рендерит шаблон
- **THEN** вывод содержит `src="./panel_1.png"` (relative), а не `src="http://...panel_1.png"` (absolute)

### Requirement: Pillow PNG-preview сохраняется
`py/render/comic_assembler.assemble_comic` MUST по-прежнему генерировать `data/comics/<id>.png` через существующий `_comic_lib.assemble_grid` (с Pillow-overlay баблами или без — параметр `preview_mode`).

#### Scenario: PNG-preview with bubbles (backward-compat)
- **WHEN** `assemble_comic(panel_paths, captions, output_path, preview_mode="with-bubbles")`
- **THEN** `output_path` PNG содержит Pillow-overlay баблы (как в текущем поведении до этого change)

#### Scenario: PNG-preview without bubbles (новый режим)
- **WHEN** `assemble_comic(panel_paths, captions, output_path, preview_mode="panels-only")`
- **THEN** `output_path` PNG содержит только layout панелей, без баблов

### Requirement: Backward compatibility — старые рендеры без layout.json
`html_renderer.render_html` MUST работать для сценариев, у которых `data/comics/<id>/layout.json` отсутствует (старые рендеры до этого change): в этом случае манифест генерируется на лету из scenario record + `panel_paths`.

#### Scenario: Legacy scenario without layout.json
- **WHEN** `render_html` вызывается для сценария, у которого `data/comics/<id>/layout.json` не существует, но есть `data/scenarios/rendered/<id>.json` с `panel_paths` и `panels[].caption`
- **THEN** `render_html` генерирует манифест на лету (panel_paths, captions, default bubble_style="bubble", default bubble_position=cycled) и рендерит HTML
