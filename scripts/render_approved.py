"""Render approved scenarios and safely rerender mutable rendered comics."""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from PIL import Image

from py.lib.config import comics_dir, data_dir, scenarios_dir
from py.lib.lifecycle import mark_rendered, update_in_place, validate_approved
from py.lib.logging_setup import setup
from py.render.comic_assembler import assemble_comic
from py.render.minimax_client import encode_image_b64, generate_image as minimax_generate_image
from py.render.drawthings_client import generate_image as drawthings_generate_image
from py.scenario.provider_router import (
    pick_image_provider,
    try_with_fallback,
    mark_fallback,
)
from py.render.page_assembler import assemble_pages
from py.render.voice_synth import synthesize_panel_dialogue
from py.render.html_renderer.reader import render_reader

logger = setup("scripts.render_approved")


def _render_single_panel(
    prompt: str,
    output_path: Path,
    aspect_ratio: str,
    seed: int | None,
    lora: str | None,
    reference_b64: str | None,
    image_provider: str,
) -> Path:
    """Рендерит одну панель через выбранный image-провайдер.

    Draw Things не поддерживает `subject_reference_b64` (это MiniMax-специфика).
    Для Draw Things character consistency держится через фиксированный seed +
    LoRA (например stalker_sdxl_lora_f16.ckpt).
    """
    if image_provider == "drawthings":
        def primary_fn(p, op, ar, s, lora=None):
            return drawthings_generate_image(
                prompt=p, output_path=op, aspect_ratio=ar, seed=s, lora=lora,
            )
        def fallback_fn(p, op, ar, s, _lora):
            return minimax_generate_image(
                prompt=p, output_path=op, aspect_ratio=ar, seed=s,
                subject_reference_b64=reference_b64,
            )
        path, _used, _fb = try_with_fallback(
            primary_fn,
            fallback_fn,
            "drawthings",
            "minimax",
            prompt, output_path, aspect_ratio, seed, lora,
        )
        return path
    else:
        # MiniMax primary (default, backward-compat)
        return minimax_generate_image(
            prompt=prompt,
            output_path=output_path,
            aspect_ratio=aspect_ratio,
            seed=seed,
            subject_reference_b64=reference_b64,
        )


def _load_for_mode(scenario_id: str, mode: str) -> dict | None:
    status = "approved" if mode == "initial" else "rendered"
    path = scenarios_dir(status) / f"{scenario_id}.json"
    if not path.exists():
        return None
    scenario = json.loads(path.read_text(encoding="utf-8"))
    if scenario.get("status") != status:
        return None
    return scenario


def _verify_png(path: Path) -> None:
    if not path.exists() or path.stat().st_size == 0:
        raise RuntimeError(f"Missing or empty PNG: {path}")
    with Image.open(path) as image:
        image.verify()


def _generate_candidate(
    scenario: dict,
    panel_root: Path,
    final_path: Path,
    *,
    mode: str,
    seed: int | None,
    image_provider_override: str | None = None,
) -> tuple[Path, list[Path]]:
    sid = scenario["id"]
    panels = scenario.get("panels")
    if not isinstance(panels, list) or not panels:
        raise ValueError(f"{sid}: scenario has no panels")
    panel_root.mkdir(parents=True, exist_ok=True)
    final_path.parent.mkdir(parents=True, exist_ok=True)

    # Pick image provider: CLI override > scenario.json > genre > env > minimax
    image_provider = pick_image_provider(scenario, image_provider_override)
    # LoRA берётся из scenario (для Draw Things) или None (для MiniMax)
    lora = scenario.get("render_lora")
    logger.info(
        f"Render provider: {image_provider}, lora={lora or '(none)'}, seed={seed}"
    )

    def render_panel(panel: dict, reference_b64: Optional[str] = None) -> tuple[int, Path]:
        panel_path = panel_root / f"panel_{panel['n']}.png"
        if mode == "initial" and panel_path.exists():
            _verify_png(panel_path)
            logger.info(f"Panel {panel['n']} already exists, skipping")
            return panel["n"], panel_path
        if mode == "initial" and validate_approved(sid) is None:
            raise RuntimeError(f"{sid}: approval gate failed immediately before provider request")
        _render_single_panel(
            prompt=panel["prompt"],
            output_path=panel_path,
            aspect_ratio=scenario.get("aspect_ratio", "16:9"),
            seed=seed,
            lora=lora,
            reference_b64=reference_b64,
            image_provider=image_provider,
        )
        _verify_png(panel_path)
        return panel["n"], panel_path

    # Character consistency: первая панель генерируется без reference,
    # затем используется как subject_reference для остальных панелей.
    # Это держит персонажа консистентным через всю историю.
    panel_paths_ordered: list[Optional[Path]] = [None] * len(panels)

    if not panels:
        raise ValueError(f"{sid}: no panels to render")

    # 1) Генерируем panel #1 последовательно (без reference — это «якорь» персонажа)
    first_panel = panels[0]
    first_path = panel_root / f"panel_{first_panel['n']}.png"
    n, p = render_panel(first_panel, reference_b64=None)
    panel_paths_ordered[0] = p
    logger.info(f"Panel {n} rendered (anchor for character reference)")

    # Кодируем первую панель в base64 для передачи в subject_reference
    reference_b64 = encode_image_b64(first_path) if first_path.exists() else None

    # 2) Остальные панели — параллельно с reference на panel #1
    if len(panels) > 1:
        remaining = panels[1:]
        with ThreadPoolExecutor(max_workers=min(4, len(remaining))) as executor:
            futures = {
                executor.submit(render_panel, p, reference_b64): idx + 1
                for idx, p in enumerate(remaining)
            }
            for future in as_completed(futures):
                idx = futures[future]
                number, path = future.result()
                panel_paths_ordered[idx] = path
                logger.info(f"Panel {number} rendered (with character reference)")

    panel_paths = [panel_paths_ordered[i] for i in range(len(panels))]
    for panel_path in panel_paths:
        _verify_png(panel_path)

    # Phase 2: voice synthesis per panel (ComicsMCP.md)
    audio_dir = panel_root / "audio"
    if any(panel.get("dialogue") for panel in panels):
        logger.info(f"Synthesizing audio for {sum(1 for p in panels if p.get('dialogue'))} panels with dialogue")
        for index, panel in enumerate(panels):
            if not panel.get("dialogue"):
                continue
            synth_results = synthesize_panel_dialogue(
                scenario_id=sid,
                panel_n=panel["n"],
                dialogue=panel["dialogue"],
                output_dir=audio_dir,
            )
            # Inline update: panel.audio = [{character, text, voice_id, path, duration_sec, ...}]
            panel["audio"] = synth_results
        # Persist updated scenario so rerender / inspection sees audio paths
        # (lightweight: only when voice was actually generated)
        scenario_path = scenarios_dir("approved") / f"{sid}.json"
        if not scenario_path.exists():
            scenario_path = scenarios_dir("rendered") / f"{sid}.json"
        if scenario_path.exists():
            try:
                persisted = json.loads(scenario_path.read_text(encoding="utf-8"))
                for orig_panel, rendered_panel in zip(persisted.get("panels", []), panels):
                    if "audio" in rendered_panel:
                        orig_panel["audio"] = rendered_panel["audio"]
                scenario_path.write_text(
                    json.dumps(persisted, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
                logger.info(f"Persisted audio paths in {scenario_path}")
            except Exception as e:
                logger.warning(f"Could not persist audio paths: {e}")

    captions = [panel["caption"] for panel in panels]

    # === Page-by-page assembly (openaiua.fr style) ===
    # Генерируем pages/ + audio/ + pages.json.
    # В initial mode panel_root = canonical; в rerender mode panel_root = staging,
    # чтобы pages/ и pages.json не перезаписывали canonical до backup/promote.
    page_result = assemble_pages(
        scenario=scenario,
        panels_dir=panel_root,
        audio_dir=panel_root / "audio",
        output_dir=panel_root,
        generate_cover=True,
        pause_ms=700,
    )
    logger.info(
        f"Pages assembled: {len(page_result['pages'])} pages, "
        f"cover={page_result['cover_path']}"
    )

    # === Composite PNG preview (через Pillow, как раньше) ===
    final = assemble_comic(
        panel_paths=panel_paths,
        captions=captions,
        output_path=final_path,
        style=scenario.get("style", "star"),
        layout=scenario.get("layout", "comic"),
        scenario=scenario,
    )
    _verify_png(final)

    # === Рендерим reader HTML (page-by-page) — ПОСЛЕДНИМ, чтобы не перетёрся Pillow ===
    # base_path='/comics/<id>' → абсолютные URL, работают откуда угодно
    final_html = render_reader(
        pages_manifest=page_result["pages"],
        output_path=final_path.with_suffix(".html"),
        title=scenario.get("title", "Комикс"),
        comic_id=sid,
        language=scenario.get("language", "ru"),
        tone=scenario.get("tone", "dark"),
        style=scenario.get("style", "star"),
        base_path=f"/comics/{sid}",
    )
    logger.info(f"Reader HTML → {final_html}")

    return final, panel_paths


def _promote_rerender(
    scenario: dict,
    candidate_final: Path,
    candidate_panels: Path,
    staging_root: Path,
    seed: int | None,
) -> tuple[Path, int]:
    sid = scenario["id"]
    current_final = comics_dir() / f"{sid}.png"
    current_panels = comics_dir() / sid
    current_raw = comics_dir() / "raw" / f"{sid}.png"
    current_html = comics_dir() / f"{sid}.html"
    candidate_html = candidate_panels.parent / f"{sid}.html"
    if not current_final.exists():
        raise RuntimeError(f"{sid}: current rendered comic is missing")

    backup_root = staging_root / "backup"
    backup_root.mkdir(parents=True, exist_ok=True)
    backups = [
        (current_final, backup_root / "final.png"),
        (current_panels, backup_root / "panels"),
        (current_raw, backup_root / "raw.png"),
        (current_html, backup_root / "final.html"),
    ]
    promoted = False
    try:
        for current, backup in backups:
            if current.exists():
                backup.parent.mkdir(parents=True, exist_ok=True)
                current.rename(backup)
        current_panels.parent.mkdir(parents=True, exist_ok=True)
        candidate_panels.rename(current_panels)
        candidate_final.rename(current_final)
        if candidate_html.exists():
            current_html.parent.mkdir(parents=True, exist_ok=True)
            candidate_html.rename(current_html)
            logger.info(f"Promoted HTML → {current_html}")
        current_raw.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(current_final, current_raw)
        _verify_png(current_final)
        for panel in current_panels.glob("panel_*.png"):
            _verify_png(panel)

        revision = int(scenario.get("render_revision") or 1) + 1
        updated = update_in_place(sid, "rendered", {
            "seed": seed,
            "comic_path": str(current_final),
            "panel_paths": [str(path) for path in sorted(current_panels.glob("panel_*.png"))],
            "render_revision": revision,
            "rendered_at": datetime.now().isoformat(),
        })
        if not updated:
            raise RuntimeError(f"{sid}: failed to update rendered scenario")
        promoted = True
        return current_final, revision
    finally:
        if not promoted:
            for current, _backup in backups:
                if current.exists():
                    if current.is_dir():
                        shutil.rmtree(current)
                    else:
                        current.unlink()
            for current, backup in backups:
                if backup.exists():
                    backup.rename(current)
        if promoted:
            shutil.rmtree(backup_root, ignore_errors=True)


def render_one(
    scenario: dict,
    *,
    mode: str = "initial",
    staging_root: Path | None = None,
    seed_override: int | None = None,
    image_provider_override: str | None = None,
) -> tuple[Path, int]:
    sid = scenario["id"]
    seed = seed_override if seed_override is not None else scenario.get("seed")

    if mode == "initial":
        if validate_approved(sid) is None:
            raise RuntimeError(f"{sid}: initial render requires persisted approval")
        final, panel_paths = _generate_candidate(
            scenario,
            comics_dir() / sid,
            comics_dir() / f"{sid}.png",
            mode=mode,
            seed=seed,
            image_provider_override=image_provider_override,
        )
        raw_dir = comics_dir() / "raw"
        raw_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(final, raw_dir / f"{sid}.png")
        updated = mark_rendered(sid, str(final), [str(path) for path in panel_paths], seed)
        if not updated:
            raise RuntimeError(f"Failed to commit rendered state for {sid}")
        logger.info(f"Rendered → {final}")
        return final, int(updated.get("render_revision") or 1)

    if mode != "rerender" or staging_root is None:
        raise ValueError("Explicit rerender requires a staging directory")
    if scenario.get("status") != "rendered":
        raise RuntimeError(f"{sid}: rerender requires rendered status")
    if staging_root.exists():
        shutil.rmtree(staging_root)
    candidate_root = staging_root / "candidate"
    candidate_final, _ = _generate_candidate(
        scenario,
        candidate_root / sid,
        candidate_root / f"{sid}.png",
        mode=mode,
        seed=seed,
        image_provider_override=image_provider_override,
    )
    return _promote_rerender(scenario, candidate_final, candidate_root / sid, staging_root, seed)


def _validated_staging(value: str | None) -> Path | None:
    if value is None:
        return None
    allowed = (data_dir() / ".staging").resolve()
    requested = Path(value).resolve()
    try:
        requested.relative_to(allowed)
    except ValueError as exc:
        raise ValueError("--staging-dir must be inside data/.staging") from exc
    return requested


def main() -> int:
    parser = argparse.ArgumentParser(description="Render approved scenarios to PNG")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--scenario-id", help="ID конкретного сценария")
    source.add_argument("--all", action="store_true", help="Все утверждённые")
    parser.add_argument("--dry-run", action="store_true", help="Показать план без рендера")
    parser.add_argument("--archive", action="store_true", help="Зарезервировано для совместимости")
    parser.add_argument("--rerender", action="store_true", help="Явный rerender scenario в rendered")
    parser.add_argument("--staging-dir", help="Job-specific directory внутри data/.staging")
    parser.add_argument("--seed", type=int, help="Seed override для explicit render/rerender")
    parser.add_argument("--image-provider", choices=["minimax", "drawthings"],
                        help="Override image provider (default: from scenario.json или genre-table)")
    parser.add_argument("--text-provider", choices=["minimax", "lmstudio"],
                        help="Override text provider (для будущего использования в scenario generation)")
    parser.add_argument("--json-result", action="store_true", help="Вывести machine-readable result последней строкой")
    args = parser.parse_args()

    mode = "rerender" if args.rerender else "initial"
    if args.rerender and (args.all or not args.staging_dir):
        parser.error("--rerender requires --scenario-id and --staging-dir")
    staging_root = _validated_staging(args.staging_dir)

    scenarios: list[dict] = []
    if args.scenario_id:
        scenario = _load_for_mode(args.scenario_id, mode)
        if scenario is None:
            error = f"{args.scenario_id}: not in required {mode} state"
            logger.error(error)
            if args.json_result:
                print(json.dumps({"ok": False, "error": error}))
            return 1
        scenarios = [scenario]
    else:
        for scenario_path in sorted(scenarios_dir("approved").glob("*.json")):
            scenario = json.loads(scenario_path.read_text(encoding="utf-8"))
            if scenario.get("status") == "approved":
                scenarios.append(scenario)
        if not scenarios:
            logger.warning("No approved scenarios to render")
            if args.json_result:
                print(json.dumps({"ok": True, "rendered": [], "failed": []}))
            return 0

    if args.dry_run:
        for scenario in scenarios:
            print(f"Would {mode}: {scenario['id']} — {scenario.get('title', 'untitled')}")
        if args.json_result:
            print(json.dumps({"ok": True, "dry_run": True, "ids": [item["id"] for item in scenarios]}))
        return 0

    rendered: list[dict] = []
    failed: list[dict] = []
    for scenario in scenarios:
        sid = scenario["id"]
        try:
            scenario_staging = staging_root if args.scenario_id else None
            final, revision = render_one(
                scenario,
                mode=mode,
                staging_root=scenario_staging,
                seed_override=args.seed,
                image_provider_override=args.image_provider,
            )
            rendered.append({"id": sid, "comic_path": str(final), "render_revision": revision})
            logger.info(f"✅ {sid} rendered successfully")
        except Exception as error:
            failed.append({"id": sid, "error": str(error)})
            logger.error(f"❌ {sid} failed: {error}")

    result = {
        "ok": not failed,
        "rendered": rendered,
        "failed": failed,
    }
    if len(rendered) == 1:
        result.update(rendered[0])
    if args.json_result:
        print(json.dumps(result, ensure_ascii=False))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
