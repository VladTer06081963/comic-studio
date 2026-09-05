"""Provider router: выбор text/image провайдера по сценарию.

Архитектура (от высшего приоритета к низшему):
  1. CLI override (аргумент `override` функции)
  2. scenario["text_provider"] / scenario["image_provider"]
  3. scenario["genre"] → GENRE_DEFAULT table
  4. env DEFAULT_TEXT_PROVIDER / DEFAULT_IMAGE_PROVIDER
  5. hardcoded "minimax" (last resort)

Auto-fallback: при runtime-ошибке primary клиента — вызывает fallback
(MiniMax). Помечает scenario JSON `*_provider_fallback: "minimax"`.

См. `summary/audit/027_local-uncensored-stack.md` для обоснования и
`openspec/changes/local-uncensored-stack/specs/python-scenario-provider-router/spec.md`
для формальной спеки.
"""
from __future__ import annotations

import os
from typing import Any, Callable, Optional

from py.lib.logging_setup import setup

logger = setup("scenario.provider_router")


# ── Genre default table ───────────────────────────────────────────────────────
# "stalker-horror"/"military"/"horror" → Magnum + Draw Things (uncensored)
# "comedy"/"kids"/"educational"/"sci-fi" → MiniMax (нейтрально, цензура не мешает)
# "default" — last resort, MiniMax

GENRE_DEFAULT: dict[str, dict[str, str]] = {
    "stalker-horror": {"text": "lmstudio", "image": "drawthings"},
    "military":       {"text": "lmstudio", "image": "drawthings"},
    "horror":         {"text": "lmstudio", "image": "drawthings"},
    "comedy":         {"text": "minimax",  "image": "minimax"},
    "kids":           {"text": "minimax",  "image": "minimax"},
    "educational":    {"text": "minimax",  "image": "minimax"},
    "sci-fi":         {"text": "minimax",  "image": "minimax"},
    "default":        {"text": "minimax",  "image": "minimax"},
}


# ── Public API ────────────────────────────────────────────────────────────────

def pick_text_provider(scenario: Optional[dict] = None, override: Optional[str] = None) -> str:
    """Возвращает text provider для сценария. Один из 'lmstudio' | 'minimax'.

    Приоритет: override > scenario['text_provider'] > genre > env > 'minimax'.
    """
    return _pick("text", scenario, override)


def pick_image_provider(scenario: Optional[dict] = None, override: Optional[str] = None) -> str:
    """Возвращает image provider для сценария. Один из 'drawthings' | 'minimax'.

    Приоритет: override > scenario['image_provider'] > genre > env > 'minimax'.
    """
    return _pick("image", scenario, override)


def _pick(kind: str, scenario: Optional[dict], override: Optional[str]) -> str:
    """Общая логика выбора для text/image.

    `kind` определяет, какое поле смотрим в scenario ('text_provider' / 'image_provider'),
    какой env читаем ('DEFAULT_TEXT_PROVIDER' / 'DEFAULT_IMAGE_PROVIDER'),
    и какое значение берём из GENRE_DEFAULT (['text'] / ['image']).
    """
    scenario_field = f"{kind}_provider"
    env_var = f"DEFAULT_{kind.upper()}_PROVIDER"
    genre_key = kind  # 'text' или 'image'

    # 1. CLI/programmatic override
    if override is not None:
        return override

    # 2. Per-scenario field
    if scenario and scenario.get(scenario_field):
        return scenario[scenario_field]

    # 3. Genre table
    if scenario:
        genre = scenario.get("genre", "default")
        mapping = GENRE_DEFAULT.get(genre, GENRE_DEFAULT["default"])
        return mapping[genre_key]

    # 4. Env override
    env_val = os.environ.get(env_var)
    if env_val:
        return env_val

    # 5. Last resort
    return "minimax"


# ── Auto-fallback wrapper ────────────────────────────────────────────────────

# Lazy imports — fallback'и грузятся только при ошибке primary
def _import_text_fallback():
    """Lazy import: MiniMax text client (тот же, что в writer.py)."""
    from py.scenario.writer import _call_minimax_chat
    return _call_minimax_chat


def _import_image_fallback():
    """Lazy import: MiniMax image client."""
    from py.render.minimax_client import generate_image
    return generate_image


def try_with_fallback(
    primary_fn: Callable,
    fallback_fn: Callable,
    primary_provider: str,
    fallback_provider: str = "minimax",
    *args,
    **kwargs,
) -> tuple[Any, str, bool]:
    """Вызывает primary_fn, при ошибке — fallback_fn.

    Возвращает (result, used_provider, fallback_used: bool).
    Fallback срабатывает на:
      - LMRuntimeError (from py.scenario.lmstudio_client)
      - DTRuntimeError (from py.render.drawthings_client)
      - requests.exceptions.* (network/timeout)

    Если и fallback упал — пробрасывает последнее исключение.
    """
    try:
        result = primary_fn(*args, **kwargs)
        return result, primary_provider, False
    except Exception as e:
        if _is_fallback_trigger(e):
            logger.warning(
                f"Provider {primary_provider} failed, falling back to {fallback_provider}: {e}"
            )
            try:
                result = fallback_fn(*args, **kwargs)
                return result, fallback_provider, True
            except Exception as e2:
                # Fallback тоже упал — пробрасываем последнюю ошибку
                logger.error(f"Fallback provider {fallback_provider} also failed: {e2}")
                raise
        else:
            # Не network/provider ошибка — не пытаемся fallback'ить
            raise


def _is_fallback_trigger(exc: BaseException) -> bool:
    """Проверяет, является ли исключение сигналом для fallback'а."""
    # Lazy import — избегаем circular imports
    try:
        from py.scenario.lmstudio_client import LMRuntimeError
    except ImportError:
        LMRuntimeError = None
    try:
        from py.render.drawthings_client import DTRuntimeError
    except ImportError:
        DTRuntimeError = None

    # requests.exceptions импортируем через модуль, не класс (version-agnostic)
    import requests
    network_errors = (
        requests.exceptions.ConnectionError,
        requests.exceptions.Timeout,
        requests.exceptions.HTTPError,
    )

    fallback_types = []
    if LMRuntimeError is not None:
        fallback_types.append(LMRuntimeError)
    if DTRuntimeError is not None:
        fallback_types.append(DTRuntimeError)
    fallback_types.extend(network_errors)

    return isinstance(exc, tuple(fallback_types))


# ── Scenario mutation helper ─────────────────────────────────────────────────

def mark_fallback(scenario: dict, kind: str, fallback_provider: str) -> None:
    """Помечает scenario JSON при срабатывании fallback'а.

    `kind` = 'text' или 'image'. Записывает в scenario поле
    `{kind}_provider_fallback: fallback_provider` (если ещё не было).
    """
    if not scenario:
        return
    key = f"{kind}_provider_fallback"
    if key not in scenario:
        scenario[key] = fallback_provider
        logger.info(f"Scenario marked: {key}={fallback_provider}")
