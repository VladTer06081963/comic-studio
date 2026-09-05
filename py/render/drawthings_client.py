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
import json
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


# Draw Things хранит свои LoRA triggers в custom_lora.json (рядом с моделями).
# Каждый LoRA имеет trigger-prefix, который DT автоматически распознаёт в prompt
# и активирует соответствующую модель. Это НЕ A1111 API — <lora:filename:weight>
# Draw Things НЕ понимает, и возвращает 422 или игнорирует.
_DT_MODELS_DIR: Optional[Path] = None
_DT_LORA_CACHE: Optional[dict[str, str]] = None


def _resolve_dt_models_dir() -> Optional[Path]:
    """Возвращает путь к Draw Things Models/.

    Default: ~/Library/Containers/com.liuliu.draw-things/Data/Documents/Models/
    Override: env DRAWTHINGS_MODELS_DIR.
    """
    global _DT_MODELS_DIR
    if _DT_MODELS_DIR is not None:
        return _DT_MODELS_DIR
    env_dir = os.environ.get("DRAWTHINGS_MODELS_DIR")
    if env_dir:
        _DT_MODELS_DIR = Path(env_dir)
        return _DT_MODELS_DIR
    default = Path.home() / "Library" / "Containers" / "com.liuliu.draw-things" / "Data" / "Documents" / "Models"
    if default.exists():
        _DT_MODELS_DIR = default
        return _DT_MODELS_DIR
    return None


def _load_dt_lora_triggers() -> dict[str, str]:
    """Читает custom_lora.json и возвращает map: filename → trigger prefix.

    Если файл не найден или malformed — возвращает пустой dict (fallback на A1111-стиль).
    """
    global _DT_LORA_CACHE
    if _DT_LORA_CACHE is not None:
        return _DT_LORA_CACHE
    cache: dict[str, str] = {}
    models_dir = _resolve_dt_models_dir()
    if not models_dir:
        _DT_LORA_CACHE = cache
        return cache
    cfg_path = models_dir / "custom_lora.json"
    if not cfg_path.exists():
        _DT_LORA_CACHE = cache
        return cache
    try:
        with cfg_path.open(encoding="utf-8") as f:
            entries = json.load(f)
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            fname = entry.get("file")
            prefix = entry.get("prefix", "")
            if fname and prefix and "[" in prefix:
                # trigger like "industrial apocalypse style [1.0] " — weight in brackets
                cache[fname] = prefix
        logger.debug(f"Loaded {len(cache)} DT LoRA triggers from {cfg_path}")
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Failed to load DT custom_lora.json from {cfg_path}: {e}")
    _DT_LORA_CACHE = cache
    return cache


def _get_dt_lora_trigger(lora_filename: Optional[str]) -> Optional[str]:
    """Возвращает DT trigger-prefix для LoRA, или None если не найден.

    LoRA без trigger-prefix в custom_lora.json нельзя активировать через
    A1111 API — DT не подхватит её. Возвращаем None, и caller может попробовать
    fallback на `<lora:filename:0.7>` (но он скорее всего тоже не сработает).
    """
    if not lora_filename:
        return None
    triggers = _load_dt_lora_triggers()
    return triggers.get(lora_filename)


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

    # LoRA: Draw Things использует НЕ A1111 API. Свой формат — `trigger prefix`
    # из custom_lora.json, который DT автоматически распознаёт в prompt и
    # активирует соответствующий LoRA. inline `<lora:filename:weight>` (как у
    # A1111) DT НЕ понимает и возвращает 422 или просто игнорирует.
    #
    # Пример trigger: "industrial apocalypse style [1.0] " (для stalker_sdxl_lora)
    full_prompt = prompt
    full_negative = negative_prompt
    if lora:
        trigger = _get_dt_lora_trigger(lora)
        if trigger:
            full_prompt = f"{trigger}{prompt}"
            logger.info(f"DT LoRA '{lora}' activated via trigger prefix: {trigger!r}")
        else:
            # Fallback: попробуем A1111-стиль (на случай, если custom_lora.json
            # не обновлялся, или LoRA добавлен вручную без trigger). DT скорее
            # всего проигнорирует, но попытка не повредит.
            full_prompt = f"{prompt} <lora:{lora}:0.7>"
            logger.warning(
                f"DT LoRA '{lora}' не найдена в custom_lora.json, fallback на "
                f"A1111-inline-тег (может не сработать)"
            )

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
