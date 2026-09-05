#!/usr/bin/env python3
"""A/B render harness: same scenario → Draw Things vs MiniMax side-by-side.

Использует `py.render.ab_renderer` для рендера двумя провайдерами без
модификации канонического render-пайплайна.

Output: data/comics/.ab/<scenario_id>/{minimax,drawthings}/*.png + compare.html

Usage:
    # A/B один сценарий
    python scripts/ab_test_render.py --scenario-id stalker-013

    # Несколько провайдеров, явный seed
    python scripts/ab_test_render.py --scenario-id abc12345 --seed 42

    # Только один провайдер (например, проверить, что DT работает)
    python scripts/ab_test_render.py --scenario-id abc12345 --providers drawthings

    # Кастомный output dir
    python scripts/ab_test_render.py --scenario-id abc12345 --out-dir /tmp/ab

См. `summary/audit/027_local-uncensored-stack.md` §6 (F2).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Добавляем repo root в sys.path для запуска как `python scripts/ab_test_render.py`
_REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO_ROOT))

from py.lib.config import comics_dir
from py.lib.lifecycle import load_scenario
from py.lib.logging_setup import setup
from py.render.ab_renderer import DEFAULT_PROVIDERS, render_ab, summarize


def main() -> int:
    logger = setup("scripts.ab_test_render")
    parser = argparse.ArgumentParser(
        description="A/B render scenario с двумя image-провайдерами (без модификации canonical render)"
    )
    parser.add_argument("--scenario-id", required=True, help="ID сценария (8 hex)")
    parser.add_argument(
        "--providers",
        nargs="+",
        choices=["minimax", "drawthings"],
        default=list(DEFAULT_PROVIDERS),
        help=f"Image-провайдеры для A/B (default: оба). Доступно: {list(DEFAULT_PROVIDERS)}",
    )
    parser.add_argument(
        "--seed",
        type=int,
        help="Фиксированный seed (для consistency между провайдерами). Default: из scenario.json или случайный.",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        help=f"Output dir (default: data/comics/.ab/<scenario_id>)",
    )
    parser.add_argument(
        "--caption-style",
        default="bubble",
        help="Caption style для assemble_comic (default: bubble)",
    )
    args = parser.parse_args()

    # 1. Загружаем сценарий
    scenario = load_scenario(args.scenario_id)
    if not scenario:
        print(f"❌ Scenario {args.scenario_id!r} not found in any queue", file=sys.stderr)
        return 1
    status = scenario.get("status", "?")
    title = scenario.get("title", "(no title)")
    print(f"📋 Scenario: {args.scenario_id}  status={status}")
    print(f"   Title: {title}")
    print(f"   Panels: {len(scenario.get('panels', []))}")
    print(f"   Genre: {scenario.get('genre', '—')}")

    # 2. Определяем output dir
    if args.out_dir:
        out_dir = args.out_dir
    else:
        out_dir = comics_dir() / ".ab" / args.scenario_id
    print(f"   Out: {out_dir}")
    print(f"   Providers: {args.providers}")
    print()

    # 3. Seed: CLI > scenario > None
    seed = args.seed if args.seed is not None else scenario.get("seed")
    if seed is not None:
        print(f"   Seed: {seed} (для consistency между провайдерами)")

    # 4. Запускаем A/B render
    print(f"\n🚀 A/B render...")
    try:
        results = render_ab(
            scenario,
            out_dir,
            providers=tuple(args.providers),
            seed=seed,
            caption_style=args.caption_style,
        )
    except Exception as e:
        logger.error(f"A/B render failed: {e}")
        print(f"❌ A/B render failed: {e}", file=sys.stderr)
        return 2

    # 5. Сводка
    print(f"\n{'─' * 60}")
    print("📊 RESULTS")
    print(f"{'─' * 60}")
    print(summarize(results))

    # 6. Готово
    if "compare_html" in results:
        print(f"\n🌐 Open in browser: file://{results['compare_html']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
