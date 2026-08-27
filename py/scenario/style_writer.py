"""Author-style prose writer для scenario generation.

Magnum-Picaro-12B это не schema-follower, а **writer's model**. Используем её
по назначению: генерирует prose + dialogue в стиле русских/зарубежных авторов.

Это **первый этап** двухэтапного pipeline:
1. Magnum пишет narrative (prose + dialogue в характере персонажей)
2. MiniMax-Text-01 извлекает структуру (panels, English prompts, captions)

Spec: ComicsMCP.md Phase 2 → creative toolkit (style-driven writing).
"""
from __future__ import annotations

import json
import os
import time
from typing import Optional

import requests

from py.lib.logging_setup import setup

logger = setup("scenario.style_writer")

# LM Studio Magnum-Picaro endpoint. Defaults to вчерашний хардкод для backward-compat,
# но в production читается из env (LM_BASE_URL / LM_API_KEY / LM_MODEL).
DEFAULT_BASE_URL = os.environ.get(
    "LM_BASE_URL", "http://127.0.0.1:49462"
).rstrip("/v1").rstrip("/")
DEFAULT_API_KEY = os.environ.get(
    "LM_API_KEY", "ixYUmhi-_VOMf_pD7In_nF2tDCBtxW9nmn5xf1ab5q0"
)
DEFAULT_MODEL = os.environ.get(
    "LM_MODEL",
    "magnum-picaro-0.7-v3-12b-i1",  # short name accepted by LM Studio API
)

# Author style profiles. Каждый профиль — это system prompt, задающий тон и голос.
STYLE_PROFILES: dict[str, str] = {
    "pelevin": (
        "Ты — Виктор Пелевин, постмодернист. Зона — метафора, не географическое место. "
        "Философские парадоксы, смесь советского и мистического. Ироничный тон. "
        "Диалоги многослойные, с подтекстом. Персонажи говорят загадками, "
        "но не банально — каждая реплика имеет второй смысл."
    ),
    "strugatsky": (
        "Ты — русский писатель в традиции братьев Стругацких. Твёрдая научная фантастика, "
        "философская притча, сдержанный психологизм. Никакого пафоса, никаких клише. "
        "Диалоги — ёмкие, часто неловкие. Люди делают свой выбор в безвыходных ситуациях. "
        "Атмосфера важнее действия."
    ),
    "dovlatov": (
        "Ты — Сергей Довлатов, абсурдистский реализм. Мрачный юмор, человеческая нелепость. "
        "Короткие рубленые фразы, недосказанность, диалоги-пинг-понги. "
        "Никакого морализаторства. Тон — ироничный, отстранённый."
    ),
    "king": (
        "You write like Stephen King meets Sergei Lukyanenko — American horror pacing, "
        "Russian soul. Campfire dialogue, atmospheric dread. Long descriptive passages "
        "but dialogue stays grounded and real."
    ),
    "pelevin-strugatsky": (
        "Ты пишешь как на стыке Пелевина и Стругацких: философская притча с постапокалиптическим "
        "антуражем. Каждый диалог должен работать на двух уровнях — буквальном и метафорическом. "
        "Без клише, без пафоса, но с внутренним напряжением."
    ),
}


def write_narrative(
    context: str,
    style: str = "pelevin",
    *,
    tone: str = "dark",
    num_scenes: int = 3,
    base_url: str = None,
    api_key: str = None,
    model: str = None,
    temperature: float = 0.9,
    max_tokens: int = 3000,
) -> dict:
    """Пишет narrative в стиле автора. Возвращает dict с raw prose.

    Args:
        context: Свободный текст сюжета (статья, описание сцены).
        style: Ключ из STYLE_PROFILES (pelevin, strugatsky, dovlatov, king, ...).
        tone: Тон (dark, funny, epic, ...).
        num_scenes: Сколько сцен/панелей (3-4).
        temperature: Температура генерации (0.7-1.0 для творчества).

    Returns:
        dict {
            "style": str,
            "tone": str,
            "model": str,
            "narrative": str,        # полный текст narrative
            "elapsed_sec": float,
            "tokens_used": int,
        }
    """
    base_url = base_url or DEFAULT_BASE_URL
    api_key = api_key or DEFAULT_API_KEY
    model = model or DEFAULT_MODEL

    if style not in STYLE_PROFILES:
        raise ValueError(f"Unknown style: {style}. Available: {list(STYLE_PROFILES)}")

    system_prompt = f"""{STYLE_PROFILES[style]}

Твоя задача — написать narrative для графического романа. {num_scenes} сцены (scenes).

Формат narrative:
---
Сцена 1: <короткое название>
<проза 3-7 предложений, кинематографично. Диалоги в характере персонажей с подтекстом.>

Сцена 2: ...
Сцена 3: ...

ВАЖНО:
- Каждая сцена — отдельный визуальный момент (1 кадр комикса).
- Диалоги помечай именами персонажей или "Narrator:" для закадрового голоса.
- {tone.upper()} тон. Без воды, без клише.
- Проза на русском (если style не King), диалоги — на русском.
"""

    user_msg = f"""Контекст (на русском):
{context}

Стиль: {style}
Тон: {tone}
Сцен: {num_scenes}

Напиши narrative. {num_scenes} сцены, каждая с диалогами. Без JSON, свободная проза."""

    logger.info(f"Magnum write_narrative: style={style} tone={tone} scenes={num_scenes}")
    start = time.time()

    resp = requests.post(
        f"{base_url}/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        },
        timeout=180,
    )
    resp.raise_for_status()
    data = resp.json()

    elapsed = time.time() - start
    content = data["choices"][0]["message"]["content"]
    usage = data.get("usage", {})

    logger.info(
        f"Magnum done in {elapsed:.1f}s, {usage.get('completion_tokens')} tokens, {len(content)} chars"
    )

    return {
        "style": style,
        "tone": tone,
        "model": "Magnum-Picaro-12B",
        "narrative": content,
        "elapsed_sec": round(elapsed, 2),
        "tokens_used": usage.get("total_tokens", 0),
    }


def list_styles() -> list[str]:
    """Возвращает список доступных author styles."""
    return list(STYLE_PROFILES.keys())
