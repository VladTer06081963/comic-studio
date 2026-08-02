"""Построение layout-манифеста из сценария + собранных панелей.

`build_layout(scenario, panel_paths, captions, bubble_styles, bubble_positions, layout, fonts)`
возвращает dict, сериализуемый в `data/comics/<id>/layout.json`.

Spec: `python-comic-rendering` → Requirement: Layout manifest builder.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

from py.lib.logging_setup import setup

from .layout import BUBBLE_POSITIONS, BUBBLE_STYLES, validate_layout

logger = setup("render.html_renderer.manifest")


def _resolve_filename(panel_path: str | Path) -> str:
    """Возвращает имя файла панели без родительских директорий.

    `data/comics/<id>/panel_1.png` → `panel_1.png`.
    """
    return Path(panel_path).name


def _coerce_panel_path(panel_path: str | Path) -> str:
    """Приводит panel_path к относительной форме (`panel_N.png`)."""
    return _resolve_filename(panel_path)


def _coerce_bubble_position(value: str | None, index: int) -> str:
    """Возвращает позицию для индекса; fallback — цикл по умолчанию."""
    if isinstance(value, str) and value in BUBBLE_POSITIONS:
        return value
    return BUBBLE_POSITIONS[index % len(BUBBLE_POSITIONS)]


def _coerce_bubble_style(value: str | None, default: str) -> str:
    """Возвращает стиль; fallback — дефолт сценария."""
    if isinstance(value, str) and value in BUBBLE_STYLES:
        return value
    return default


def _now_iso() -> str:
    """ISO-8601 timestamp в UTC (например, `2026-08-02T22:30:00+00:00`)."""
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def build_layout(
    scenario: Mapping[str, Any],
    panel_paths: Sequence[str | Path],
    captions: Sequence[str],
    bubble_styles: Sequence[str | None],
    bubble_positions: Sequence[str | None],
    layout: str,
    fonts: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    """Собирает layout-манифест для HTML-рендера.

    Args:
        scenario: scenario dict (id, title, tone, image_style, aspect_ratio обязательны).
        panel_paths: список путей к PNG-панелям.
        captions: список подписей к панелям.
        bubble_styles: per-panel стиль; `None` → дефолт сценария (или `'bubble'`).
        bubble_positions: per-panel позиция; `None` → цикл по дефолту.
        layout: имя layout (`comic`, `grid`, `vertical`).
        fonts: опциональный mapping роль → имя шрифта (например,
            `{"bubble": "Bangers", "gothic": "UnifrakturCook"}`).

    Returns:
        dict с полями: id, title, tone, image_style, layout, aspect_ratio,
        created_at, fonts, panels.

    Raises:
        ValueError: если длины panel_paths/captions/bubble_styles/bubble_positions
        не совпадают или scenario не содержит обязательных полей.
    """
    sid = scenario.get("id")
    if not isinstance(sid, str) or not sid:
        raise ValueError("build_layout: scenario must include non-empty 'id'")

    n = len(panel_paths)
    if len(captions) != n:
        raise ValueError(
            f"build_layout: captions length {len(captions)} != panel_paths length {n}"
        )
    if len(bubble_styles) != n:
        raise ValueError(
            f"build_layout: bubble_styles length {len(bubble_styles)} != panel_paths length {n}"
        )
    if len(bubble_positions) != n:
        raise ValueError(
            f"build_layout: bubble_positions length {len(bubble_positions)} != panel_paths length {n}"
        )

    default_style = scenario.get("style", "bubble")
    if default_style not in BUBBLE_STYLES:
        default_style = "bubble"

    panels: list[dict[str, Any]] = []
    for index in range(n):
        raw_caption = captions[index]
        if not isinstance(raw_caption, str):
            raise ValueError(f"build_layout: panel #{index + 1} caption must be a string")
        panels.append({
            "n": index + 1,
            "image": _coerce_panel_path(panel_paths[index]),
            "caption": raw_caption,
            "bubble_style": _coerce_bubble_style(bubble_styles[index], default_style),
            "bubble_position": _coerce_bubble_position(bubble_positions[index], index),
        })

    manifest: dict[str, Any] = {
        "id": sid,
        "title": scenario.get("title") or "Без названия",
        "tone": scenario.get("tone", "epic"),
        "image_style": scenario.get("image_style", "comic"),
        "layout": layout,
        "aspect_ratio": scenario.get("aspect_ratio", "16:9"),
        "created_at": _now_iso(),
        "fonts": dict(fonts) if fonts else {
            "bubble": "Bangers",
            "star": "Bangers",
            "gothic": "UnifrakturCook",
            "boom": "Bungee",
            "memo": "Caveat",
            "bar": "Bangers",
        },
        "panels": panels,
    }

    # Sanity-check итогового манифеста перед сериализацией
    validate_layout(manifest)
    logger.info(
        f"Built layout for {sid}: layout={layout}, panels={len(panels)}, "
        f"bubble_styles={[p['bubble_style'] for p in panels]}"
    )
    return manifest