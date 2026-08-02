"""Генерация сценария комикса из контекста через LLM.

Использует MiniMax chat API (та же компания, что и image-01). По умолчанию
провайдер можно переопределить через переменную SCENARIO_LLM_PROVIDER.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from py.lib.config import MINIMAX_API_KEY, MINIMAX_BASE_URL, scenarios_dir
from py.lib.logging_setup import setup

logger = setup("scenario.writer")

# Стили изображений для MiniMax image-01
STYLE_TEMPLATES = {
    "cartoon": "cartoon style, vibrant colors, animated, fun, expressive characters, bold outlines",
    "anime": "anime style, Japanese animation, cel shaded, detailed background, dramatic lighting",
    "comic": "comic book style, bold outlines, halftone dots, pop art colors, dramatic shadows",
    "realistic": "photorealistic, 8K, detailed, cinematic lighting, high contrast, sharp focus",
    "watercolor": "watercolor painting style, soft edges, artistic, paper texture, gentle colors",
}

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
MAX_REVISION_HISTORY = 10
MAX_FEEDBACK_FOR_REVISION = 20
MAX_PROMPT_CHARS = 1_500
MAX_CAPTION_WORDS = 6
ACCEPTED_PANEL_COUNTS = (3, 4)

REVISION_SYSTEM_PROMPT = """Ты редактор комикс-сценария, который обновляет существующий JSON-сценарий, применяя отзыв автора.

ПРАВИЛА:
- Сохрани все ранее зафиксированные метаданные: title, tone, style, image_style, layout, aspect_ratio, seed.
- Допускается 3 или 4 панели; используй количество панелей, ближайшее к прежнему, если в feedback не указано иное.
- Каждая панель: prompt ≤1500 символов, caption ≤6 слов, только на русском.
- Не добавляй markdown-обёртку; верни только валидный JSON.
- Учитывай source context, исходные panels и всю feedback history; не игнорируй явные замечания автора.
- Не повторяй panels без необходимости; изменяй только то, что вытекает из feedback.

Формат ответа:
{
  "title": "Название комикса",
  "tone": "epic|funny|educational|dark|whimsical",
  "style": "star|bubble|gothic|boom|memo|bar",
  "layout": "comic|grid",
  "aspect_ratio": "16:9",
  "panels": [
    {"n": 1, "prompt": "≤1500 chars", "caption": "≤6 слов на русском"},
    ...
  ]
}
"""


def generate_scenario(
    context: str,
    tone: Optional[str] = None,
    style: Optional[str] = None,
    image_style: Optional[str] = None,
    num_panels: int = 3,
) -> dict:
    """Генерирует сценарий комикса из текстового контекста.

    Args:
        context: Текстовый контекст для сценария
        tone: Тон комикса (epic, funny, educational, dark, whimsical)
        style: Стиль подписей (star, bubble, gothic, boom, memo, bar)
        image_style: Стиль изображений (cartoon, anime, comic, realistic, watercolor)
        num_panels: Количество панелей

    Returns:
        dict со всеми полями сценария + id, created_at, status, source
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
        + (f" Стиль картинок: {image_style}." if image_style else "")
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
    scenario.setdefault("image_style", image_style or "comic")
    scenario.setdefault("layout", "comic")
    scenario.setdefault("aspect_ratio", "16:9")

    # Добавляем стиль к промптам панелей
    style_suffix = STYLE_TEMPLATES.get(scenario["image_style"], STYLE_TEMPLATES["comic"])
    for panel in scenario.get("panels", []):
        if "prompt" in panel:
            panel["prompt"] = f"{panel['prompt']}, {style_suffix}"

    # Проверка структуры
    if not isinstance(scenario.get("panels"), list) or not scenario["panels"]:
        raise ValueError(f"Invalid scenario structure: {scenario}")

    logger.info(f"Generated scenario id={scenario['id']} title={scenario['title']!r}, image_style={scenario['image_style']}")
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


def _format_feedback_history(feedback_history: list[dict]) -> str:
    lines = []
    for index, item in enumerate(feedback_history, start=1):
        text = str(item.get("text", "")).strip()
        if not text:
            continue
        lines.append(f"{index}. {text}")
    return "\n".join(lines)


def _validate_revision_response(payload: dict) -> None:
    if not isinstance(payload, dict):
        raise ValueError("revise_scenario: LLM response is not a JSON object")
    if not isinstance(payload.get("panels"), list) or not payload["panels"]:
        raise ValueError("revise_scenario: response has no panels")
    if len(payload["panels"]) not in ACCEPTED_PANEL_COUNTS:
        raise ValueError(f"revise_scenario: panel count must be {ACCEPTED_PANEL_COUNTS}")
    for index, panel in enumerate(payload["panels"], start=1):
        if not isinstance(panel, dict):
            raise ValueError(f"revise_scenario: panel #{index} is not an object")
        prompt = str(panel.get("prompt", "")).strip()
        caption = str(panel.get("caption", "")).strip()
        if not prompt:
            raise ValueError(f"revise_scenario: panel #{index} has empty prompt")
        if len(prompt) > MAX_PROMPT_CHARS:
            raise ValueError(f"revise_scenario: panel #{index} prompt exceeds {MAX_PROMPT_CHARS} chars")
        if not caption:
            raise ValueError(f"revise_scenario: panel #{index} has empty caption")
        if len(caption.split()) > MAX_CAPTION_WORDS:
            raise ValueError(f"revise_scenario: panel #{index} caption exceeds {MAX_CAPTION_WORDS} words")


def revise_scenario(
    current_scenario: dict,
    feedback_history: list[dict],
    source_context: str = "",
    image_style: Optional[str] = None,
) -> dict:
    """Регенерирует сценарий, применяя bounded feedback history.

    Args:
        current_scenario: текущий canonical record (draft/approved/rendered).
        feedback_history: ограниченная история правок автора.
        source_context: bounded исходный контекст (статья, YouTube, freeform).
        image_style: стиль изображений для style suffix.

    Returns:
        dict со revised panels, prompts, captions и сохранёнными метаданными.
    """
    if not isinstance(current_scenario, dict) or not current_scenario.get("id"):
        raise ValueError("revise_scenario: current_scenario must include id")
    if not isinstance(feedback_history, list) or not feedback_history:
        raise ValueError("revise_scenario: feedback_history must be a non-empty list")
    if len(feedback_history) > MAX_FEEDBACK_FOR_REVISION:
        raise ValueError(f"revise_scenario: feedback history exceeds {MAX_FEEDBACK_FOR_REVISION}")

    bounded_context = (source_context or "")[:MAX_CONTEXT_CHARS]
    formatted_feedback = _format_feedback_history(feedback_history)
    panels_summary = json.dumps(current_scenario.get("panels", []), ensure_ascii=False)[:2000]
    image_style = image_style or current_scenario.get("image_style", "comic")

    user_msg = (
        f"Исходный контекст:\n\n{bounded_context}\n\n"
        f"Текущий сценарий (id={current_scenario.get('id')}):\n"
        f"title={current_scenario.get('title', '')}\n"
        f"tone={current_scenario.get('tone', 'epic')}\n"
        f"style={current_scenario.get('style', 'star')}\n"
        f"image_style={image_style}\n"
        f"layout={current_scenario.get('layout', 'comic')}\n"
        f"aspect_ratio={current_scenario.get('aspect_ratio', '16:9')}\n"
        f"panels={panels_summary}\n\n"
        f"История правок автора:\n{formatted_feedback}\n\n"
        f"Примени ВСЕ отзывы и верни revised JSON."
    )

    logger.info(
        f"Revising scenario id={current_scenario.get('id')} with {len(feedback_history)} feedback items"
    )
    raw = _call_minimax_chat(REVISION_SYSTEM_PROMPT, user_msg)
    revised = _extract_json(raw)
    _validate_revision_response(revised)

    revised.setdefault("title", current_scenario.get("title"))
    revised.setdefault("tone", current_scenario.get("tone", "epic"))
    revised.setdefault("style", current_scenario.get("style", "star"))
    revised.setdefault("image_style", image_style)
    revised.setdefault("layout", current_scenario.get("layout", "comic"))
    revised.setdefault("aspect_ratio", current_scenario.get("aspect_ratio", "16:9"))

    style_suffix = STYLE_TEMPLATES.get(revised["image_style"], STYLE_TEMPLATES["comic"])
    for panel in revised["panels"]:
        if "prompt" in panel and style_suffix not in panel["prompt"]:
            panel["prompt"] = f"{panel['prompt']}, {style_suffix}"

    revised["id"] = current_scenario["id"]
    revised["status"] = "draft"
    revised["revision_of"] = current_scenario["id"]
    revised["revision_at"] = datetime.now().isoformat()
    return revised


def _read_feedback_file(path: str) -> list[dict]:
    raw = Path(path).read_text(encoding="utf-8")
    parsed = json.loads(raw)
    if not isinstance(parsed, list):
        raise ValueError("--feedback-file must be a JSON array")
    return parsed


def _read_source_context_file(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Revise an existing scenario via LLM")
    parser.add_argument("--scenario-id", required=True, help="ID of the scenario to revise")
    parser.add_argument("--scenario-path", required=True, help="Path to the canonical scenario JSON")
    parser.add_argument("--feedback-file", help="Path to JSON array of feedback items")
    parser.add_argument("--feedback", help="Inline JSON array of feedback items")
    parser.add_argument("--source-context-file", help="Optional file with source context")
    parser.add_argument("--source-context", help="Optional inline source context")
    parser.add_argument("--image-style", choices=list(STYLE_TEMPLATES.keys()), help="Override image style")
    parser.add_argument("--json-result", action="store_true", help="Print machine-readable result")
    parser.add_argument("--out", help="Path to write revised scenario JSON")
    args = parser.parse_args()

    if bool(args.feedback_file) == bool(args.feedback):
        parser.error("Provide exactly one of --feedback-file or --feedback")

    scenario_path = Path(args.scenario_path)
    current = json.loads(scenario_path.read_text(encoding="utf-8"))
    if current.get("id") != args.scenario_id:
        raise SystemExit(f"--scenario-id {args.scenario_id!r} does not match record id {current.get('id')!r}")

    if args.feedback_file:
        feedback = _read_feedback_file(args.feedback_file)
    else:
        feedback = json.loads(args.feedback)
    if not isinstance(feedback, list) or not feedback:
        raise SystemExit("feedback list must be non-empty")

    source_context = args.source_context or ""
    if args.source_context_file:
        source_context = _read_source_context_file(args.source_context_file)

    try:
        revised = revise_scenario(current, feedback, source_context=source_context, image_style=args.image_style)
    except Exception as error:
        result = {"ok": False, "error": str(error)}
        if args.json_result:
            print(json.dumps(result, ensure_ascii=False))
        else:
            print(f"❌ {error}", file=sys.stderr)
        return 1

    out_path = Path(args.out) if args.out else scenario_path
    out_path.write_text(json.dumps(revised, ensure_ascii=False, indent=2), encoding="utf-8")

    result = {
        "ok": True,
        "id": revised["id"],
        "status": revised["status"],
        "path": str(out_path),
        "revision_at": revised["revision_at"],
        "feedback_count": len(feedback),
    }
    if args.json_result:
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(f"✅ Revised → {out_path}")
    return 0


if __name__ == "__main__":
    import sys
    text = sys.stdin.read() if not sys.argv[1:] else " ".join(sys.argv[1:])
    s = generate_scenario(text)
    save_scenario(s)
    print(json.dumps(s, ensure_ascii=False, indent=2))