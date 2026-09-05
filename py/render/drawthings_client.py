"""HTTP клиент к локальному Draw Things (Stable Diffusion WebUI API).

Зеркалит интерфейс `generate_image` из `py.render.minimax_client:17` чтобы
`provider_router` мог переключаться без изменения вызывающего кода.
Дополнительно поддерживает LoRA (для Stalker, Pixar, и т.д.) и фиксированный
seed для consistency.

Endpoint: `POST {DRAWTHINGS_BASE_URL}/sdapi/v1/txt2img`
Возвращает: base64-encoded PNG в `response.json()["images"][0]`

Env:
  DRAWTHINGS_BASE_URL  default "http://192.168.55.1:7860"
  DRAWTHINGS_TIMEOUT   default "120" (seconds)

См. `summary/audit/027_local-uncensored-stack.md` и
`openspec/changes/local-uncensored-stack/specs/python-render-drawthings-client/spec.md`.
"""
from __future__ import annotations

import base64
import os
from pathlib import Path
from typing import Optional

import requests

from py.lib.logging_setup import setup

logger = setup("render.drawthings_client")


class DTRuntimeError(Exception):
    """Бросается при любой ошибке Draw Things клиента.

    `provider_router.try_with_fallback` ловит этот тип и переключается
    на MiniMax. Не наследуемся от requests.exceptions.* чтобы
    избежать случайной ловли в чужом коде.
    """


# ── Aspect ratio mapping ──────────────────────────────────────────────────────
# Стандартные SDXL-разрешения. Draw Things умеет любые, но эти чаще всего
# используются в comic pipeline.

ASPECT_RATIO_SIZES: dict[str, tuple[int, int]] = {
    "16:9": (1024, 576),
    "9:16": (576, 1024),
    "1:1":  (1024, 1024),
    "4:3":  (1024, 768),
    "3:4":  (768, 1024),
    "3:2":  (1024, 683),
    "2:3":  (683, 1024),
}


def _get_env(key: str, default: str) -> str:
    val = os.environ.get(key, default)
    if key not in os.environ:
        logger.debug(f"Env {key!r} not set, using default: {default!r}")
    return val


def _parse_int_env(key: str, default: int) -> int:
    raw = os.environ.get(key)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        logger.warning(f"Env {key}={raw!r} is not an int, using default {default}")
        return default


def _resolve_size(aspect_ratio: str) -> tuple[int, int]:
    """Возвращает (width, height) для данного aspect ratio."""
    if aspect_ratio in ASPECT_RATIO_SIZES:
        return ASPECT_RATIO_SIZES[aspect_ratio]
    logger.warning(
        f"Unknown aspect_ratio {aspect_ratio!r}, falling back to 16:9 (1024x576). "
        f"Known: {sorted(ASPECT_RATIO_SIZES.keys())}"
    )
    return ASPECT_RATIO_SIZES["16:9"]


def generate_image(
    prompt: str,
    output_path: str | Path,
    aspect_ratio: str = "16:9",
    seed: Optional[int] = None,
    lora: Optional[str] = None,
    sampler: str = "DPM++ SDE Karras",
    steps: int = 20,
    cfg_scale: float = 7.0,
    negative_prompt: str = "blurry, low quality, text, watermark, signature",
) -> Path:
    """Генерирует одну картинку через Draw Things. Сохраняет в output_path.

    Args:
        prompt: позитивный промпт (английский, ≤1500 chars по convention)
        output_path: путь для PNG
        aspect_ratio: один из "16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"
        seed: фиксированный seed (None → Draw Things выберет случайный, -1)
        lora: имя LoRA-файла в Models/ (например "stalker_sdxl_lora_f16.ckpt")
        sampler: имя сэмплера (default DPM++ SDE Karras)
        steps: количество шагов (default 20)
        cfg_scale: guidance scale (default 7.0)
        negative_prompt: что НЕ рисовать

    Returns:
        Path к сохранённому PNG.

    Raises:
        DTRuntimeError: при недоступности Draw Things, HTTP != 200, или malformed response.
    """
    base_url = _get_env("DRAWTHINGS_BASE_URL", "http://192.168.55.1:7860")
    timeout = _parse_int_env("DRAWTHINGS_TIMEOUT", 120)

    width, height = _resolve_size(aspect_ratio)
    url = f"{base_url}/sdapi/v1/txt2img"

    # LoRA: Draw Things (как и A1111) принимает LoRA через prompt tag `<lora:name:weight>`.
    # Поле `override_settings.sd_model_lora` (которое я пробовал раньше) Draw Things
    # интерпретирует как `lora_<name>` и возвращает HTTP 422 "Missing file: lora_<name>".
    # Inline-тег — самый совместимый способ.
    full_prompt = prompt
    full_negative = negative_prompt
    if lora:
        # Weight по умолчанию 0.7 (см. character sheet рекомендации).
        # Если в имени уже есть `.ckpt` / `.safetensors` — оставляем как есть.
        lora_filename = lora  # e.g. "stalker_sdxl_lora_f16.ckpt"
        full_prompt = f"{prompt} <lora:{lora_filename}:0.7>"

    payload: dict = {
        "prompt": full_prompt,
        "negative_prompt": full_negative,
        "seed": seed if seed is not None else -1,
        "sampler_name": sampler,
        "steps": steps,
        "cfg_scale": cfg_scale,
        "width": width,
        "height": height,
    }

    logger.info(
        f"Draw Things → {url} {width}x{height} seed={payload['seed']} "
        f"steps={steps} cfg={cfg_scale} lora={lora or '(none)'}"
    )

    try:
        resp = requests.post(url, json=payload, timeout=timeout)
    except requests.exceptions.ConnectionError as e:
        raise DTRuntimeError(f"Draw Things unavailable at {base_url}: {e}") from e
    except requests.exceptions.Timeout as e:
        raise DTRuntimeError(f"Draw Things timeout after {timeout}s: {e}") from e
    except requests.exceptions.RequestException as e:
        raise DTRuntimeError(f"Draw Things request error: {e}") from e

    if resp.status_code != 200:
        body = resp.text[:500] if resp.text else "(empty)"
        raise DTRuntimeError(
            f"Draw Things HTTP {resp.status_code}: {body}"
        )

    try:
        data = resp.json()
    except ValueError as e:
        raise DTRuntimeError(
            f"Draw Things returned non-JSON: {resp.text[:500]}"
        ) from e

    images = data.get("images")
    if not images or not images[0]:
        raise DTRuntimeError(f"Draw Things response has no 'images': {list(data.keys())}")

    img_b64 = images[0]
    try:
        img_bytes = base64.b64decode(img_b64)
    except Exception as e:
        raise DTRuntimeError(
            f"Draw Things returned invalid base64 image: {e}"
        ) from e

    out_path = Path(output_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(img_bytes)
    logger.info(f"Saved {len(img_bytes)} bytes → {out_path}")
    return out_path


if __name__ == "__main__":
    # Smoke test: генерирует одну картинку
    import sys
    if len(sys.argv) < 3:
        print("Usage: python -m py.render.drawthings_client <prompt> <output>")
        sys.exit(1)
    print(generate_image(sys.argv[1], sys.argv[2]))
