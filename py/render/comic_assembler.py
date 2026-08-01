"""Сборка финального комикса из PNG-панелей + подписей через Pillow.

Использует движок из minimax-comic skill (`_comic_lib.py`).
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

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


def assemble_comic(
    panel_paths: list[Path | str],
    captions: list[str],
    output_path: Path | str,
    style: str = "star",
    layout: str = "comic",
    cols: int = 2,
) -> Path:
    """Собирает финальный комикс из PNG-панелей.

    panel_paths и captions должны совпадать по длине.
    Возвращает Path к итоговому PNG.
    """
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    if _skill_lib is not None:
        # Load images as PIL Image objects
        images = []
        for p in panel_paths:
            img = Image.open(p)
            images.append(img)

        # Map style name → bubble style for skill library
        bubble_styles = [style] * len(images)
        bubble_positions = ["bottom-left", "top-right", "bottom-right", "top-left"][:len(images)]

        result = _skill_lib.assemble_grid(
            images=images,
            captions=captions,
            cols=cols,
            layout=layout,
            bubble_styles=bubble_styles,
            bubble_positions=bubble_positions,
        )
        result.save(out)
        logger.info(f"Saved comic via skill lib → {out}")
        return out

    # ── Fallback: simple grid without caption overlays ─────────────────────
    logger.warning("Skill lib unavailable, using fallback grid assembly")
    imgs = [Image.open(p).convert("RGB") for p in panel_paths]
    w, h = imgs[0].size
    rows = (len(imgs) + cols - 1) // cols
    grid = Image.new("RGB", (w * cols, h * rows), "black")
    for i, img in enumerate(imgs):
        r, c = divmod(i, cols)
        grid.paste(img, (c * w, r * h))
    grid.save(out)
    return out


if __name__ == "__main__":
    import sys, json

    if len(sys.argv) < 2:
        print("Usage: python -m py.render.comic_assembler <scenario.json> [output.png]")
        sys.exit(1)

    sc = json.loads(Path(sys.argv[1]).read_text())
    out = sys.argv[2] if len(sys.argv) > 2 else f"{sc['id']}.png"
    panels = [p["image_path"] for p in sc["panels"]]
    caps = [p["caption"] for p in sc["panels"]]
    print(assemble_comic(panels, caps, out, sc.get("style", "star"), sc.get("layout", "comic")))
