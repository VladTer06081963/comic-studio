"""Сборка финального комикса из PNG-панелей + подписей.

Генерирует два артефакта (variant B из PRD):
1. PNG-preview — для backward-compat (Telegram, Notion, archive, social).
   Через `_comic_lib.assemble_grid` (Pillow overlay с баблами или без).
2. HTML-страница — основной артефакт для браузера/шеринга.
   Через `py.render.html_renderer.render_html`.

См. spec `python-comic-rendering` → Requirement: Pillow PNG-preview сохраняется
и Backward compatibility — старые рендеры без layout.json.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping, Optional, Sequence

# pyrefly: ignore [missing-import]
from PIL import Image

from py.lib.logging_setup import setup

logger = setup("render.comic_assembler")

# ── Load comic library ────────────────────────────────────────────────────────
_skill_lib = None
try:
    from py.render import _comic_lib as _skill_lib  # type: ignore
    logger.info("Local py.render._comic_lib loaded")
except Exception as e:
    logger.warning(f"Could not load py.render._comic_lib: {e}")

# Lazy import: html_renderer может быть недоступен в самых минимальных средах
_html_renderer_module = None


def _get_html_renderer():
    global _html_renderer_module
    if _html_renderer_module is None:
        try:
            from py.render import html_renderer  # type: ignore
            _html_renderer_module = html_renderer
        except Exception as exc:
            logger.warning(f"Could not load html_renderer: {exc}")
            _html_renderer_module = False  # cache failure
    return _html_renderer_module if _html_renderer_module else None


def _default_bubble_positions(n: int) -> list[str]:
    """Циклический список позиций: bottom-left, top-right, bottom-right, top-left."""
    cycle = ["bottom-left", "top-right", "bottom-right", "top-left"]
    return [cycle[i % len(cycle)] for i in range(n)]


def _build_html_layout(
    *,
    scenario: Optional[Mapping[str, Any]],
    panel_paths: Sequence[str | Path],
    captions: Sequence[str],
    bubble_styles: Sequence[str],
    bubble_positions: Sequence[str],
    layout: str,
    fonts: Optional[Mapping[str, str]] = None,
) -> dict[str, Any]:
    """Строит layout-манифест для HTML-рендера.

    Если scenario не передан — собирает минимальный dict из переданных аргументов
    (для backward-compat со старыми рендерами, у которых нет scenario в JSON).
    """
    html_renderer = _get_html_renderer()
    if html_renderer is None:
        raise RuntimeError("html_renderer module unavailable")

    if scenario is None:
        # Backward-compat: минимальный scenario из аргументов
        scenario = {
            "id": Path(panel_paths[0]).parent.name if panel_paths else "unknown",
            "title": "Без названия",
            "tone": "epic",
            "image_style": "comic",
            "aspect_ratio": "16:9",
            "style": bubble_styles[0] if bubble_styles else "bubble",
        }

    return html_renderer.build_layout(
        scenario=scenario,
        panel_paths=panel_paths,
        captions=captions,
        bubble_styles=bubble_styles,
        bubble_positions=bubble_positions,
        layout=layout,
        fonts=fonts,
    )


def assemble_comic(
    panel_paths: list[Path | str],
    captions: list[str],
    output_path: Path | str,
    style: str = "star",
    layout: str = "comic",
    cols: int = 2,
    *,
    scenario: Optional[Mapping[str, Any]] = None,
    preview_mode: str = "with-bubbles",
    html_output_path: Optional[Path | str] = None,
) -> Path:
    """Собирает финальный комикс: PNG-preview + HTML (опционально).

    Args:
        panel_paths: список путей к PNG-панелям.
        captions: список подписей к панелям (parallel к panel_paths).
        output_path: путь к итоговому PNG-preview (например, `data/comics/<id>.png`).
        style: caption style ('bubble'|'star'|'gothic'|'boom'|'memo'|'bar').
        layout: layout ('comic'|'grid'|'vertical').
        cols: число колонок (для `grid`).
        scenario: scenario dict (id, title, tone, image_style...). Если передан —
            дополнительно создаются `data/comics/<id>/layout.json` и `<id>.html`.
        preview_mode: режим PNG-preview.
            - `"with-bubbles"` (default, backward-compat) — Pillow-overlay баблов.
            - `"panels-only"` — без баблов, только layout панелей.
        html_output_path: опциональный override для пути HTML (по умолчанию —
            `<output_path_parent>/<id>.html` если задан scenario).

    Returns:
        Path к итоговому PNG-файлу (как раньше).

    Raises:
        ValueError: если `preview_mode` не из допустимых.
    """
    if preview_mode not in ("with-bubbles", "panels-only"):
        raise ValueError(
            f"invalid preview_mode: {preview_mode!r}; expected 'with-bubbles' or 'panels-only'"
        )

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    bubble_positions = _default_bubble_positions(len(panel_paths))

    # ── PNG-preview через Pillow (legacy path) ─────────────────────────────
    if _skill_lib is not None:
        images = [Image.open(p) for p in panel_paths]
        if preview_mode == "panels-only":
            # Без баблов: передаём стиль 'none' для каждой панели
            png_bubble_styles = ["none"] * len(images)
        else:
            # Backward-compat: Pillow-overlay баблов (старое поведение)
            png_bubble_styles = [style] * len(images)

        result = _skill_lib.assemble_grid(
            images=images,
            captions=captions,
            cols=cols,
            layout=layout,
            bubble_styles=png_bubble_styles,
            bubble_positions=bubble_positions,
        )
        result.save(out)
        logger.info(
            f"Saved PNG-preview via skill lib → {out} "
            f"(preview_mode={preview_mode}, panels={len(images)})"
        )
    else:
        # Fallback: simple grid (только panels-only)
        logger.warning("Skill lib unavailable, using fallback grid assembly")
        imgs = [Image.open(p).convert("RGB") for p in panel_paths]
        w, h = imgs[0].size
        rows = (len(imgs) + cols - 1) // cols
        grid = Image.new("RGB", (w * cols, h * rows), "black")
        for i, img in enumerate(imgs):
            r, c = divmod(i, cols)
            grid.paste(img, (c * w, r * h))
        grid.save(out)

    # ── HTML-страница (variant B — primary artifact) ──────────────────────
    if scenario is not None:
        html_renderer = _get_html_renderer()
        if html_renderer is not None:
            sid = scenario.get("id") or out.stem
            try:
                # Собираем bubble_styles по панелям: используем scenario.style
                scenario_style = scenario.get("style", style)
                html_bubble_styles = [scenario_style] * len(panel_paths)
                manifest = _build_html_layout(
                    scenario=scenario,
                    panel_paths=panel_paths,
                    captions=captions,
                    bubble_styles=html_bubble_styles,
                    bubble_positions=bubble_positions,
                    layout=layout,
                )

                # Сохраняем манифест рядом с PNG-preview (или staging)
                manifest_dir = out.parent / sid
                manifest_dir.mkdir(parents=True, exist_ok=True)
                manifest_path = manifest_dir / "layout.json"
                manifest_path.write_text(
                    json.dumps(manifest, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )

                # Генерируем HTML рядом с PNG-preview
                if html_output_path is None:
                    html_path = out.parent / f"{sid}.html"
                else:
                    html_path = Path(html_output_path)
                html_renderer.render_html(manifest, html_path)

                # Structured event для observability (spec → Requirement: HTML rendering)
                logger.info(
                    f"comic.html_generated "
                    f"scenario_id={sid} "
                    f"render_revision={scenario.get('render_revision', 1)} "
                    f"html_path={html_path} "
                    f"layout={layout} "
                    f"panels={len(panel_paths)} "
                    f"fonts={len(manifest.get('fonts', {}))}"
                )
                logger.info(
                    f"comic.preview_generated "
                    f"scenario_id={sid} "
                    f"preview_mode={preview_mode} "
                    f"png_path={out} "
                    f"layout={layout}"
                )
            except Exception as exc:
                # HTML failure не должен ломать PNG-preview (best-effort)
                logger.warning(f"HTML render failed (PNG-preview preserved): {exc}")
        else:
            logger.warning(
                "html_renderer module not available; skipping HTML generation"
            )

    return out


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python -m py.render.comic_assembler <scenario.json> [output.png]")
        sys.exit(1)

    sc = json.loads(Path(sys.argv[1]).read_text())
    out = sys.argv[2] if len(sys.argv) > 2 else f"{sc['id']}.png"
    panels = [p["image_path"] for p in sc["panels"]]
    caps = [p["caption"] for p in sc["panels"]]
    print(
        assemble_comic(
            panels, caps, out,
            sc.get("style", "star"),
            sc.get("layout", "comic"),
            scenario=sc,
        )
    )