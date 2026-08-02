# web-comic-rendering Specification

## Purpose
Web API отдаёт HTML-артефакт комикса и сопутствующую статику (CSS, шрифты) с правильными Content-Type, безопасным разрешением путей и без live provider calls. HTML-страница рендерится Python-пакетом `py/render/html_renderer/`, и этот capability описывает **только Web-сторону** доставки.
## Requirements
### Requirement: HTML endpoint
Система SHALL отдавать `GET /comics/<id>.html` с Content-Type `text/html; charset=utf-8` и телом, идентичным `data/comics/<id>.html`, при условии что файл существует и `<id>` проходит `scenarioId` валидацию.

#### Scenario: Valid request for existing HTML
- **WHEN** клиент запрашивает `GET /comics/<id>.html` и `data/comics/<id>.html` существует
- **THEN** server возвращает 200 с `Content-Type: text/html; charset=utf-8` и телом файла

#### Scenario: Missing scenario ID
- **WHEN** клиент запрашивает `GET /comics/<id>.html` с `<id>` вне `^[A-Za-z0-9_-]{4,64}$`
- **THEN** server возвращает 400 `INVALID_SCENARIO_ID` и не обращается к filesystem

#### Scenario: HTML not yet generated
- **WHEN** клиент запрашивает `GET /comics/<id>.html` для сценария, у которого `data/comics/<id>.html` не существует (например, только что импортирован, ещё не рендерен)
- **THEN** server возвращает 404 `COMIC_NOT_FOUND` или 404 `HTML_NOT_GENERATED` (выбор кода — implementation detail)

### Requirement: Static font serving
Система SHALL отдавать `GET /comics/<id>/fonts/<name>.woff2` с Content-Type `font/woff2` из `data/comics/<id>/fonts/<name>.woff2`, при условии что файл существует и путь не выходит за пределы `data/comics/<id>/`.

#### Scenario: Valid font request
- **WHEN** клиент запрашивает `GET /comics/<id>/fonts/Bangers.woff2` и файл существует
- **THEN** server возвращает 200 с `Content-Type: font/woff2` и телом woff2-файла

#### Scenario: Path traversal attempt
- **WHEN** клиент запрашивает `GET /comics/<id>/fonts/../../etc/passwd`
- **THEN** server возвращает 400 `INVALID_PATH` и не обращается к внешним путям

#### Scenario: Missing font
- **WHEN** клиент запрашивает `GET /comics/<id>/fonts/NonExistent.woff2`
- **THEN** server возвращает 404 `FONT_NOT_FOUND`

### Requirement: Backward compatibility with PNG
Система SHALL сохранять `GET /comics/<id>.png` без изменений — PNG-preview остаётся доступным как legacy-артефакт для Telegram, Notion, archive, social адаптеров.

#### Scenario: PNG preview remains available
- **WHEN** клиент запрашивает `GET /comics/<id>.png` (existing endpoint, не HTML)
- **THEN** server возвращает 200 `image/png` с тем же PNG, что и до change

### Requirement: Filesystem safety
Система MUST использовать `safeResolve` для всех путей под `data/comics/<id>/` и MUST отклонять любые попытки path traversal (`..`, encoded separators, абсолютные пути).

#### Scenario: Path traversal rejected
- **WHEN** клиент запрашивает `GET /comics/<id>.html/../../../etc/passwd` или `GET /comics/<id>/fonts/%2e%2e/foo.woff2`
- **THEN** server возвращает 400 `INVALID_PATH` без обращения к filesystem за пределами `dataRoot`

