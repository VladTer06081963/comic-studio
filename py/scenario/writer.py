"""Генерация сценария комикса из контекста через LLM.

Использует MiniMax chat API (та же компания, что и image-01). По умолчанию
провайдер можно переопределить через переменную SCENARIO_LLM_PROVIDER.
"""
from __future__ import annotations

import json
import os
import re
import uuid
from datetime import datetime
from typing import Optional

from py.lib.config import MINIMAX_API_KEY, MINIMAX_BASE_URL, scenarios_dir
from py.lib.logging_setup import setup

logger = setup("scenario.writer")

SYSTEM_PROMPT = """Ты креативный сценарист коротких кинематографичных комиксов (3-4 панели).
Тебе дают контекст (статья, транскрипт видео, свободный текст).
Твоя задача — придумать визуальную мини-историю.

ПРАВИЛА:
- 3 или 4 панели (не больше, не меньше).
- Каждая панель — конкретная визуальная сцена, описанная как кинематографист.
- **ПОДПИСИ (captions) — ТОЛЬКО НА РУССКОМ ЯЗЫКЕ.** Краткие, дерзкие, ≤6 слов.
- Стиль подписей: по умолчанию 'star' (взрыв-POW!), можно 'bubble', 'gothic', 'boom', 'memo', 'bar'.
- Если контекст серьёзный — tone='epic'. Если юмор — tone='funny'. Если обучение — tone='educational'.
- Верни СТРОГО JSON без markdown-обёртки.

Формат ответа:
{
  "title": "Название комикса",
  "tone": "epic|funny|educational|dark|whimsical",
  "style": "star|bubble|gothic|boom|memo|bar",
  "layout": "comic|grid",
  "aspect_ratio": "16:9",
  "panels": [
    {"n": 1, "prompt": "детальное визуальное описание сцены на английском, ≤1500 chars", "caption": "подпись на РУССКОМ, ≤6 слов"},
    {"n": 2, "prompt": "...", "caption": "..."},
    {"n": 3, "prompt": "...", "caption": "..."}
  ]
}
"""


def _call_minimax_chat(system: str, user: str) -> str:
    """Минимальный вызов MiniMax chat API (compatible mode)."""
    import requests

    if not MINIMAX_API_KEY:
        raise RuntimeError("MINIMAX_API_KEY not set")

    base = MINIMAX_BASE_URL or "https://api.minimax.io"
    url = f"{base}/v1/text/chatcompletion_v2"
    headers = {
        "Authorization": f"Bearer {MINIMAX_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "MiniMax-Text-01",
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.8,
        "max_tokens": 2048,
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=120)
    resp.raise_for_status()
    data = resp.json()

    # Поддержка обоих форматов
    if "choices" in data and data["choices"]:
        return data["choices"][0]["message"]["content"]
    if "base_resp" in data and data["base_resp"].get("status_code") != 0:
        raise RuntimeError(f"API error: {data['base_resp']}")
    raise RuntimeError(f"Unexpected response: {data}")


def _extract_json(text: str) -> dict:
    """Извлекает JSON из ответа LLM, даже если обёрнут в ```json ... ```."""
    text = text.strip()
    # Удаляем markdown fence
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


MAX_CONTEXT_CHARS = 8_000


def generate_scenario(
    context: str,
    tone: Optional[str] = None,
    style: Optional[str] = None,
    num_panels: int = 3,
) -> dict:
    """Генерирует сценарий комикса из текстового контекста.

    Возвращает dict со всеми полями сценария + id, created_at, status, source.
    """
    # Enforce spec drafting context bound
    bounded = context[:MAX_CONTEXT_CHARS]
    if len(context) > MAX_CONTEXT_CHARS:
        logger.info(f"Context {len(context)} chars exceeds {MAX_CONTEXT_CHARS}, truncating to {MAX_CONTEXT_CHARS}")
    user_msg = (
        f"Контекст:\n\n{bounded}\n\n"
        f"Требования: {num_panels} панели."
        + (f" Тон: {tone}." if tone else "")
        + (f" Стиль подписей: {style}." if style else "")
    )

    logger.info(f"Generating scenario ({num_panels} panels, {len(context)} chars context)")
    raw = _call_minimax_chat(SYSTEM_PROMPT, user_msg)
    scenario = _extract_json(raw)

    # Обогащаем метаданными
    scenario["id"] = str(uuid.uuid4())[:8]
    scenario["created_at"] = datetime.now().isoformat()
    scenario["status"] = "draft"
    scenario["source"] = "context"
    scenario["context"] = context[:2000]  # хранить первые 2k как превью

    # Дефолты
    scenario.setdefault("tone", tone or "epic")
    scenario.setdefault("style", style or "star")
    scenario.setdefault("layout", "comic")
    scenario.setdefault("aspect_ratio", "16:9")

    # Проверка структуры
    if not isinstance(scenario.get("panels"), list) or not scenario["panels"]:
        raise ValueError(f"Invalid scenario structure: {scenario}")

    logger.info(f"Generated scenario id={scenario['id']} title={scenario['title']!r}")
    return scenario


def save_scenario(scenario: dict, status: str = "draft") -> str:
    """Сохраняет сценарий в data/scenarios/<status>/<id>.json."""
    out_dir = scenarios_dir(status)
    out_path = out_dir / f"{scenario['id']}.json"
    out_path.write_text(
        json.dumps(scenario, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    logger.info(f"Saved scenario → {out_path}")
    return str(out_path)


if __name__ == "__main__":
    import sys
    text = sys.stdin.read() if not sys.argv[1:] else " ".join(sys.argv[1:])
    s = generate_scenario(text)
    save_scenario(s)
    print(json.dumps(s, ensure_ascii=False, indent=2))