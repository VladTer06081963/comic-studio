"""Рендер утверждённого сценария в PNG.

Использование:
    python scripts/render_approved.py --scenario-id abc123
    python scripts/render_approved.py --all
    python scripts/render_approved.py --all --dry-run
"""
from __future__ import annotations

import argparse
import shutil
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from py.lib.config import comics_dir, scenarios_dir
from py.lib.lifecycle import mark_rendered, validate_approved
from py.lib.logging_setup import setup
from py.render.minimax_client import generate_image
from py.render.comic_assembler import assemble_comic

logger = setup("scripts.render_approved")


def render_one(scenario: dict) -> Path:
    """Рендерит один сценарий: параллельная генерация панелей → сборка → rendered transition."""
    sid = scenario["id"]
    out_comic = comics_dir() / f"{sid}.png"
    panels_dir = comics_dir() / sid
    panels_dir.mkdir(exist_ok=True)

    seed = scenario.get("seed")

    # Параллельно генерируем все панели
    def _render_panel(panel: dict) -> tuple[int, Path]:
        img_path = panels_dir / f"panel_{panel['n']}.png"
        if img_path.exists():
            logger.info(f"Panel {panel['n']} already exists, skipping")
            return panel["n"], img_path
        prompt = panel["prompt"]
        generate_image(
            prompt=prompt,
            output_path=img_path,
            aspect_ratio=scenario.get("aspect_ratio", "16:9"),
            seed=seed,
        )
        return panel["n"], img_path

    with ThreadPoolExecutor(max_workers=min(4, len(scenario["panels"]))) as ex:
        futures = [ex.submit(_render_panel, p) for p in scenario["panels"]]
        for f in as_completed(futures):
            try:
                n, _ = f.result()
                logger.info(f"Panel {n} rendered")
            except Exception as e:
                logger.error(f"Panel render failed: {e}")
                raise

    # Сборка финала
    panel_paths = [panels_dir / f"panel_{p['n']}.png" for p in scenario["panels"]]
    captions = [p["caption"] for p in scenario["panels"]]
    final = assemble_comic(
        panel_paths=panel_paths,
        captions=captions,
        output_path=out_comic,
        style=scenario.get("style", "star"),
        layout=scenario.get("layout", "comic"),
    )

    # Копия в raw/
    archive_raw = comics_dir() / "raw"
    archive_raw.mkdir(exist_ok=True)
    shutil.copy(final, archive_raw / f"{sid}.png")

    # ── Commit rendered state (atomic move to rendered/ queue) ──────────────
    updated = mark_rendered(sid, comic_path=str(final))
    if not updated:
        raise RuntimeError(f"Failed to commit rendered state for {sid}")

    logger.info(f"Rendered → {final}")
    return final


def main():
    ap = argparse.ArgumentParser(description="Render approved scenarios to PNG")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--scenario-id", help="ID конкретного сценария")
    src.add_argument("--all", action="store_true", help="Все утверждённые")
    ap.add_argument("--dry-run", action="store_true", help="Показать план без рендера")
    ap.add_argument("--archive", action="store_true", help="Также архивировать после рендера")
    args = ap.parse_args()

    # ── Collect scenarios ────────────────────────────────────────────────────
    scenarios = []
    if args.scenario_id:
        # Gate: must be approved
        sc = validate_approved(args.scenario_id)
        if not sc:
            logger.error(f"{args.scenario_id}: not in approved status")
            sys.exit(1)
        scenarios = [sc]
    else:
        approved_dir = scenarios_dir("approved")
        for sp in sorted(approved_dir.glob("*.json")):
            sc = __import__("json").loads(sp.read_text(encoding="utf-8"))
            if sc.get("status") != "approved":
                continue
            scenarios.append(sc)
        if not scenarios:
            logger.warning("No approved scenarios to render")
            return

    if args.dry_run:
        print("=== DRY RUN — no side effects ===")
        for sc in scenarios:
            print(f"  Would render: {sc['id']} — {sc.get('title', 'untitled')} "
                  f"({len(sc['panels'])} panels, {sc.get('style', 'star')})")
        return

    for sc in scenarios:
        sid = sc["id"]
        try:
            render_one(sc)
            logger.info(f"✅ {sid} rendered successfully")
        except Exception as e:
            logger.error(f"❌ {sid} failed: {e}")
            # Continue with next scenario (failure isolation)


if __name__ == "__main__":
    main()
