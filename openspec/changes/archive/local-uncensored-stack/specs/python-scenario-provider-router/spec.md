# python-scenario-provider-router Specification (delta)

## Purpose
Модуль `py/scenario/provider_router.py` выбирает text/image провайдера по сценарию.
Поддерживает: per-scenario override, genre-based default, env fallback, auto-fallback
на MiniMax при недоступности локального провайдера.

## Requirements

### Requirement: Provider selection
Система SHALL предоставлять функции `pick_text_provider(scenario, override=None) -> str`
и `pick_image_provider(scenario, override=None) -> str` в `py/scenario/provider_router.py`.

Алгоритм выбора (от высшего приоритета к низшему):
1. Если `override` не `None` — вернуть его.
2. Если `scenario["text_provider"]` (или `image_provider`) есть — вернуть его.
3. Иначе — посмотреть `scenario.get("genre", "default")` в `GENRE_DEFAULT` таблице.
4. Иначе — `os.environ.get("DEFAULT_TEXT_PROVIDER", "minimax")` (или `IMAGE`).
5. Иначе — `"minimax"` (hardcoded last resort).

#### Scenario: Per-scenario override wins
- **WHEN** `pick_text_provider({"text_provider": "lmstudio"})` вызван
- **THEN** возвращает `"lmstudio"` (без обращения к env или genre table)

#### Scenario: Genre-based default
- **WHEN** `pick_text_provider({"genre": "stalker-horror"})` вызван и `text_provider` отсутствует
- **THEN** возвращает `"lmstudio"` (из `GENRE_DEFAULT["stalker-horror"]["text"]`)

#### Scenario: Default for unknown genre
- **WHEN** `pick_text_provider({"genre": "experimental"})` вызван и genre не в таблице
- **THEN** возвращает `"minimax"` (из `GENRE_DEFAULT["default"]["text"]`)

#### Scenario: Env override at bottom
- **WHEN** env `DEFAULT_TEXT_PROVIDER=lmstudio` и `pick_text_provider({})` вызван
- **THEN** возвращает `"lmstudio"`

### Requirement: Genre default table
Система SHALL определять `GENRE_DEFAULT` константу (dict[str, dict]) в
`py/scenario/provider_router.py` со следующими парами:

| Genre | text | image |
|---|---|---|
| `stalker-horror` | `lmstudio` | `drawthings` |
| `military` | `lmstudio` | `drawthings` |
| `horror` | `lmstudio` | `drawthings` |
| `comedy` | `minimax` | `minimax` |
| `kids` | `minimax` | `minimax` |
| `educational` | `minimax` | `minimax` |
| `sci-fi` | `minimax` | `minimax` |
| `default` | `minimax` | `minimax` |

#### Scenario: GENRE_DEFAULT exported
- **WHEN** `from py.scenario.provider_router import GENRE_DEFAULT`
- **THEN** доступен dict с минимум 7 жанрами + `default`

### Requirement: Auto-fallback на MiniMax
Система SHALL предоставлять `try_with_fallback(fn, *args, primary_provider, fallback_provider="minimax", **kwargs) -> tuple[result, used_provider, fallback_used: bool]`.

- Если `fn(...)` поднял `LMRuntimeError` / `DTRuntimeError` / `requests.exceptions.*` —
  логирует warning и вызывает `fallback_fn` (lazy import of `py.scenario.minimax_chat` /
  `py.render.minimax_client`).
- Возвращает `(result, fallback_provider, True)`.
- Если и `fallback_fn` упал — пробрасывает последнее исключение.

#### Scenario: LM Studio down → MiniMax fallback
- **WHEN** `_call_lmstudio_chat` бросил `LMRuntimeError`
- **THEN** `try_with_fallback` вызывает `_call_minimax_chat` и возвращает `(text, "minimax", True)`

#### Scenario: Both providers down → exception
- **WHEN** и primary, и fallback бросили исключения
- **THEN** последнее исключение пробрасывается вызывающему коду

### Requirement: Logging
Система SHALL логировать все fallback-события через `py.lib.logging_setup.setup(...)`:
`logger.warning(f"Provider {primary} failed, falling back to {fallback}: {e}")`.

#### Scenario: Warning emitted
- **WHEN** `try_with_fallback` сработал с fallback'ом
- **THEN** warning-level запись появляется в `data/logs/<date>.log`
