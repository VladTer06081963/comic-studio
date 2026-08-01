"""HTTP клиент к MiniMax image-01 API."""
from __future__ import annotations

import base64
import os
from pathlib import Path
from typing import Optional

import requests

from py.lib.config import MINIMAX_API_KEY, MINIMAX_BASE_URL
from py.lib.logging_setup import setup

logger = setup("render.minimax_client")


def generate_image(
    prompt: str,
    output_path: str | Path,
    aspect_ratio: str = "16:9",
    seed: Optional[int] = None,
    subject_reference_b64: Optional[str] = None,
) -> Path:
    """Генерирует одну картинку через MiniMax image-01. Сохраняет в output_path.

    Возвращает Path к сохранённому файлу.
    """
    if not MINIMAX_API_KEY:
        raise RuntimeError("MINIMAX_API_KEY not set in .env")

    base = MINIMAX_BASE_URL or "https://api.minimax.io"
    url = f"{base}/v1/image_generation"
    headers = {
        "Authorization": f"Bearer {MINIMAX_API_KEY}",
        "Content-Type": "application/json",
    }

    payload: dict = {
        "model": "image-01",
        "prompt": prompt,
        "aspect_ratio": aspect_ratio,
        "n": 1,
        "response_format": "base64",
        "prompt_optimizer": True,
    }
    if seed is not None:
        payload["seed"] = seed
    if subject_reference_b64:
        payload["subject_reference"] = [{
            "type": "character",
            "image_file": f"data:image/jpeg;base64,{subject_reference_b64}",
        }]

    logger.info(f"Generating image → {output_path}")
    resp = requests.post(url, headers=headers, json=payload, timeout=180)
    resp.raise_for_status()
    data = resp.json()

    # Проверяем base_resp.status_code (MiniMax возвращает 200 даже при ошибках)
    base_resp = data.get("base_resp", {})
    if base_resp.get("status_code", 0) != 0:
        raise RuntimeError(
            f"MiniMax API error {base_resp.get('status_code')}: "
            f"{base_resp.get('status_msg')}"
        )

    images = data.get("data", {}).get("image_base64") or data.get("data", {}).get("image_urls")
    if not images:
        raise RuntimeError(f"No images in response: {data}")

    img_b64 = images[0]
    if img_b64.startswith("http"):
        # Если вернулся URL, скачиваем
        img_resp = requests.get(img_b64, timeout=60)
        img_resp.raise_for_status()
        img_bytes = img_resp.content
    else:
        img_bytes = base64.b64decode(img_b64)

    out_path = Path(output_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(img_bytes)
    logger.info(f"Saved {len(img_bytes)} bytes → {out_path}")
    return out_path


def encode_image_b64(path: str | Path) -> str:
    """Кодирует локальный файл в base64 (для subject_reference)."""
    return base64.b64encode(Path(path).read_bytes()).decode("ascii")


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: python -m py.render.minimax_client <prompt> <output>")
        sys.exit(1)
    print(generate_image(sys.argv[1], sys.argv[2]))