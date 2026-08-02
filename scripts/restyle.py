"""Restyle rendered comics — change bubble style без регенерации панелей.

Используется когда нужно поменять стиль баблов (bubble → gothic, star → boom, ...)
без вызова MiniMax image-01. Быстро, дёшево, без потери character consistency.

Pipeline:
1. Загрузить scenario из rendered/ или published/
2. Обновить поле `style`
3. Вызвать `assemble_comic()` с теми же panel_paths и новым style
   → Pillow-overlay PNG-preview с новым стилем + HTML с новым bubble_style
4. Сохранить обновлённый scenario JSON

Никаких вызовов MiniMax image-01. Никаких revise + re-approval + re-render.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from py.lib.config import comics_dir, scenarios_dir
from py.lib.logging_setup import setup
from py.render.comic_assembler import assemble_comic

logger = setup("scripts.restyle")

VALID_STYLES = ("bubble", "star", "gothic", "boom", "memo", "bar")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Restyle a rendered comic — change bubble style without regenerating panels"
    )
    parser.add_argument("--scenario-id", required=True, help="ID сценария в rendered/ или published/")
    parser.add_argument(
        "--style",
        required=True,
        choices=list(VALID_STYLES),
        help="Новый стиль баблов (bubble, star, gothic, boom, memo, bar)",
    )
    parser.add_argument("--json-result", action="store_true", help="Машино-читаемый вывод")
    args = parser.parse_args()

    # 1) Найти сценарий
    scenario = None
    source_status = None
    for status in ("rendered", "published"):
        path = scenarios_dir(status) / f"{args.scenario_id}.json"
        if path.exists():
            scenario = json.loads(path.read_text(encoding="utf-8"))
            source_status = status
            break

    if not scenario:
        error = f"{args.scenario_id}: not found in rendered/ or published/"
        logger.error(error)
        if args.json_result:
            print(json.dumps({"ok": False, "error": error}))
        return 1

    if scenario.get("status") not in ("rendered", "published"):
        error = f"{args.scenario_id}: status is {scenario.get('status')}, expected rendered/published"
        logger.error(error)
        if args.json_result:
            print(json.dumps({"ok": False, "error": error}))
        return 1

    # 2) Найти панели
    panels_dir = comics_dir() / args.scenario_id
    panel_paths = sorted(panels_dir.glob("panel_*.png"))
    if not panel_paths:
        error = f"No panels found at {panels_dir}"
        logger.error(error)
        if args.json_result:
            print(json.dumps({"ok": False, "error": error}))
        return 1

    # 3) Обновить style
    old_style = scenario.get("style", "bubble")
    scenario["style"] = args.style
    captions = [panel.get("caption", "") for panel in scenario["panels"]]

    # 4) Регенерировать PNG + HTML + layout.json (без вызова MiniMax)
    out_png = comics_dir() / f"{args.scenario_id}.png"
    html_path = comics_dir() / f"{args.scenario_id}.html"

    assemble_comic(
        panel_paths=panel_paths,
        captions=captions,
        output_path=out_png,
        style=args.style,
        layout=scenario.get("layout", "comic"),
        scenario=scenario,
        preview_mode="with-bubbles",
    )

    # 5) Сохранить обновлённый scenario JSON (style + стилевой timestamp)
    scenario["restyled_at"] = __import__("datetime").datetime.now().isoformat()
    if source_status:
        path = scenarios_dir(source_status) / f"{args.scenario_id}.json"
        path.write_text(
            json.dumps(scenario, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    logger.info(f"Restyled {args.scenario_id}: {old_style} → {args.style}")

    result = {
        "ok": True,
        "id": args.scenario_id,
        "old_style": old_style,
        "new_style": args.style,
        "png_path": str(out_png),
        "html_path": str(html_path),
        "panels_used": [str(p) for p in panel_paths],
    }
    if args.json_result:
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(f"✅ Restyled {args.scenario_id}: {old_style} → {args.style}")
        print(f"   PNG:  {out_png}")
        print(f"   HTML: {html_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())