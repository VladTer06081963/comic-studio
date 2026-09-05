# web-render-provider-passthrough Specification (delta)

## Purpose
Web API и MCP-сервер должны принимать `provider` в render-запросах и пробрасывать
его в Python-пайплайн. Без этого change'а `provider_router` не получает override от
пользователя через Web/Telegram.

## Requirements

### Requirement: Web API provider override
`POST /api/scenarios/:id/render` SHALL принимать опциональный `provider: "image" | "text" | "both"` в JSON body. Если передан, значение пробрасывается в `render_approved.py` через env (`TEXT_PROVIDER_OVERRIDE` / `IMAGE_PROVIDER_OVERRIDE`) или CLI-флаг.

#### Scenario: No provider in body
- **WHEN** `POST /api/scenarios/abc12345/render` без `provider` в body
- **THEN** render использует provider из scenario.json или genre-default (без изменений)

#### Scenario: Provider override passed
- **WHEN** `POST /api/scenarios/abc12345/render {"provider": "image"}` вызван
- **THEN** `comic_assembler.assemble_comic()` получает `image_provider_override="drawthings"`

### Requirement: MCP tool provider override
MCP-сервер tool `render_comic` SHALL принимать `provider` в `arguments` (snake_case: `provider: "image" | "text" | "both"`). Если передан, пробрасывается в Web API.

#### Scenario: MCP with provider
- **WHEN** агент вызывает `render_comic({"id": "abc12345", "provider": "image"})`
- **THEN** Web API получает `POST /api/scenarios/abc12345/render {"provider": "image"}`
- **AND** комикс рендерится через `image_provider_override`

### Requirement: render_approved.py CLI flags
`scripts/render_approved.py` SHALL поддерживать CLI-флаги:
- `--text-provider <lmstudio|minimax>`
- `--image-provider <drawthings|minimax>`

Флаги перекрывают scenario.json и env defaults.

#### Scenario: CLI override
- **WHEN** `python scripts/render_approved.py --scenario-id abc12345 --image-provider drawthings`
- **THEN** используется `image_provider_override="drawthings"` независимо от scenario.json

#### Scenario: No override
- **WHEN** `python scripts/render_approved.py --scenario-id abc12345` без флагов
- **THEN** провайдер берётся из scenario.json → genre → env (стандартная логика)
