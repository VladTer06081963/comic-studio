"""LM Studio client (OpenAI-совместимый).

Зеркалит интерфейс `_call_minimax_chat` из `py.scenario.writer:81` чтобы
`provider_router` мог переключаться без изменения вызывающего кода.

Использует OpenAI-совместимый API LM Studio (`/v1/chat/completions`).
LM Studio игнорирует auth header, но OpenAI-клиенты требуют — поэтому
`LM_API_KEY` default = "lm-studio".

Env:
  LM_BASE_URL  default "http://192.168.55.1:1234"
  LM_API_KEY   default "lm-studio"
  LM_MODEL     default "magnum-picaro-0.7-v3-12b-i1"

См. `summary/audit/027_local-uncensored-stack.md` и
`openspec/changes/local-uncensored-stack/specs/python-scenario-lmstudio-client/spec.md`.
"""
from __future__ import annotations

import os
from typing import Optional

import requests

from py.lib.logging_setup import setup

logger = setup("scenario.lmstudio_client")


class LMRuntimeError(Exception):
    """Бросается при любой ошибке LM Studio клиента.

    `provider_router.try_with_fallback` ловит этот тип и переключается
    на MiniMax. Не наследуемся от requests.exceptions.* чтобы
    избежать случайной ловли в чужом коде.
    """


def _get_env(key: str, default: str) -> str:
    """Читает env var с default'ом и логированием при отсутствии."""
    val = os.environ.get(key, default)
    if key not in os.environ:
        logger.debug(f"Env {key!r} not set, using default: {default!r}")
    return val


def _call_lmstudio_chat(
    system: str,
    user: str,
    model: Optional[str] = None,
) -> str:
    """OpenAI-совместимый chat completion через LM Studio.

    Args:
        system: system prompt
        user: user prompt
        model: имя модели (default: env LM_MODEL или "magnum-picaro-0.7-v3-12b-i1")

    Returns:
        Текст ответа модели.

    Raises:
        LMRuntimeError: при недоступности LM Studio, HTTP != 200, или malformed response.
    """
    base_url = _get_env("LM_BASE_URL", "http://192.168.55.1:1234")
    api_key = _get_env("LM_API_KEY", "lm-studio")
    model = model or _get_env("LM_MODEL", "magnum-picaro-0.7-v3-12b-i1")

    url = f"{base_url}/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.8,
        "max_tokens": 2048,
    }

    logger.info(f"LM Studio chat → {url} model={model}")
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=120)
    except requests.exceptions.ConnectionError as e:
        raise LMRuntimeError(f"LM Studio unavailable at {base_url}: {e}") from e
    except requests.exceptions.Timeout as e:
        raise LMRuntimeError(f"LM Studio timeout after 120s: {e}") from e
    except requests.exceptions.RequestException as e:
        raise LMRuntimeError(f"LM Studio request error: {e}") from e

    if resp.status_code != 200:
        body = resp.text[:500] if resp.text else "(empty)"
        raise LMRuntimeError(
            f"LM Studio HTTP {resp.status_code}: {body}"
        )

    try:
        data = resp.json()
    except ValueError as e:
        raise LMRuntimeError(f"LM Studio returned non-JSON: {resp.text[:500]}") from e

    choices = data.get("choices")
    if not choices:
        raise LMRuntimeError(f"LM Studio response has no 'choices': {data}")

    message = choices[0].get("message")
    if not message or "content" not in message:
        raise LMRuntimeError(f"LM Studio choice has no message.content: {choices[0]}")

    return message["content"]


if __name__ == "__main__":
    # Smoke test: подключается к LM Studio и пингует модель
    import sys
    if len(sys.argv) < 3:
        print("Usage: python -m py.scenario.lmstudio_client <system> <user>")
        sys.exit(1)
    print(_call_lmstudio_chat(sys.argv[1], sys.argv[2]))
