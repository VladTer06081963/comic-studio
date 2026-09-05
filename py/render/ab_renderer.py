"""A/B render harness: same scenario → Draw Things vs MiniMax side-by-side.

Используется для QA: визуальное сравнение результатов двух image-провайдеров
на одном сценарии без модификации канонического render.

Output:
  data/comics/.ab/<scenario_id>/
    minimax/
      panel_1.png
      panel_2.png
      ...
      final.png           ← собранный через assemble_comic
    drawthings/
      panel_1.png
      ...
      final.png
    compare.html          ← side-by-side HTML

См. `summary/audit/027_local-uncensored-stack.md` §6 (F2).
"""
from __future__ import annotations

import time
from pathlib import Path
from typing import Optional

from py.lib.logging_setup import setup
from py.render.comic_assembler import assemble_comic
from py.render.drawthings_client import generate_image as drawthings_generate
from py.render.minimax_client import generate_image as minimax_generate

logger = setup("render.ab_renderer")

# Default providers, переопределяются через CLI
DEFAULT_PROVIDERS = ("minimax", "drawthings")


def _resolve_client(provider: str):
    """Возвращает callable generate_image для провайдера."""
    if provider == "drawthings":
        return drawthings_generate
    if provider == "minimax":
        return minimax_generate
    raise ValueError(
        f"Unknown image provider {provider!r}; expected one of {DEFAULT_PROVIDERS}"
    )


def _render_with_provider(
    scenario: dict,
    out_dir: Path,
    *,
    provider: str,
    seed: Optional[int] = None,
    lora: Optional[str] = None,
    caption_style: str = "bubble",
) -> dict:
    """Рендерит все панели + ассемблирует комикс через `provider`.

    Returns:
        dict с метриками: provider, elapsed_sec, panel_paths, final_path,
        size_bytes, dims (W×H финальной PNG).
    """
    client = _resolve_client(provider)
    out_dir.mkdir(parents=True, exist_ok=True)
    panels = scenario.get("panels", [])
    if not panels:
        raise ValueError(f"Scenario {scenario.get('id')!r} has no panels")

    aspect_ratio = scenario.get("aspect_ratio", "16:9")
    panel_paths: list[Path] = []
    panel_elapsed: list[float] = []

    for panel in panels:
        panel_path = out_dir / f"panel_{panel['n']}.png"
        start = time.time()
        client(
            prompt=panel["prompt"],
            output_path=panel_path,
            aspect_ratio=aspect_ratio,
            seed=seed,
            lora=lora,
        )
        panel_elapsed.append(time.time() - start)
        panel_paths.append(panel_path)
        logger.info(
            f"  [{provider}] panel {panel['n']}/{len(panels)} "
            f"-> {panel_path} ({panel_elapsed[-1]:.1f}s)"
        )

    # Ассемблируем финальный комикс (через общий assemble_comic)
    final_path = out_dir / "final.png"
    final_path = assemble_comic(
        panels=panels,
        title=scenario.get("title", ""),
        style=caption_style,
        output_path=final_path,
    )

    total_elapsed = sum(panel_elapsed)
    size_bytes = final_path.stat().st_size if final_path.exists() else 0

    # Читаем размеры PNG (без сторонних зависимостей — через struct)
    dims = _png_dimensions(final_path)

    return {
        "provider": provider,
        "elapsed_sec": round(total_elapsed, 2),
        "panel_elapsed_sec": [round(t, 2) for t in panel_elapsed],
        "panel_paths": panel_paths,
        "final_path": final_path,
        "size_bytes": size_bytes,
        "dims": dims,
    }


def _png_dimensions(path: Path) -> Optional[tuple[int, int]]:
    """Читает (W, H) из PNG-заголовка. Без сторонних зависимостей."""
    if not path.exists():
        return None
    try:
        import struct
        with path.open("rb") as f:
            head = f.read(24)
        # PNG signature (8 bytes) + IHDR (4 len + 4 type + 4 W + 4 H = 24)
        if head[:8] != b"\x89PNG\r\n\x1a\n":
            return None
        # Width and height are at offset 16 (after 8-byte signature + 4 IHDR length + 4 type)
        w, h = struct.unpack(">II", head[16:24])
        return (w, h)
    except Exception:
        return None


def render_ab(
    scenario: dict,
    out_dir: Path,
    *,
    providers: tuple[str, ...] = DEFAULT_PROVIDERS,
    seed: Optional[int] = None,
    caption_style: str = "bubble",
) -> dict:
    """Рендерит scenario через каждый провайдер, генерирует compare.html.

    Returns:
        dict: {provider_name: result_dict, "compare_html": Path, "out_dir": Path}
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    results: dict = {}

    for provider in providers:
        provider_dir = out_dir / provider
        try:
            results[provider] = _render_with_provider(
                scenario,
                provider_dir,
                provider=provider,
                seed=seed,
                lora=scenario.get("render_lora"),
                caption_style=caption_style,
            )
        except Exception as e:
            logger.error(f"Provider {provider!r} failed: {e}")
            results[provider] = {"provider": provider, "error": str(e)}

    # Compare HTML — даже если один из провайдеров упал
    compare_html = generate_compare_html(
        scenario, results, out_dir / "compare.html"
    )
    results["compare_html"] = compare_html
    results["out_dir"] = out_dir

    return results


def generate_compare_html(
    scenario: dict,
    results: dict,
    output_path: Path,
) -> Path:
    """Side-by-side HTML compare: каждый провайдер + per-panel.

    `results` — dict: {provider_name: result_dict, "compare_html": ..., "out_dir": ...}
    """
    sid = scenario.get("id", "unknown")
    title = scenario.get("title", "(no title)")
    genre = scenario.get("genre", "")
    aspect = scenario.get("aspect_ratio", "16:9")
    seed = scenario.get("seed") or "?"

    panel_count = len(scenario.get("panels", []))
    panels = scenario.get("panels", [])

    def provider_block(provider: str) -> str:
        r = results.get(provider, {})
        if "error" in r:
            return f"""
        <div class="panel error">
          <h3>🟦 {provider.title()} (cloud)</h3>
          <p class="error-msg">❌ {escape(r['error'])}</p>
        </div>"""
        if "final_path" not in r:
            return f"""
        <div class="panel error">
          <h3>🟦 {provider.title()}</h3>
          <p class="error-msg">No result</p>
        </div>"""
        rel = Path(r["final_path"]).relative_to(output_path.parent).as_posix()
        dims = r.get("dims") or ("?", "?")
        return f"""
        <div class="panel">
          <h3>🟦 {provider.title()}{' (local + LoRA)' if provider == 'drawthings' else ' (cloud)'}</h3>
          <a href="{rel}" target="_blank"><img src="{rel}" alt="{provider} final"></a>
          <div class="metrics">
            ⏱ {r['elapsed_sec']}s · {r['size_bytes']/1024:.1f} KB · {dims[0]}×{dims[1]}
            <br>per-panel: {', '.join(f'{t}s' for t in r.get('panel_elapsed_sec', []))}
          </div>
        </div>"""

    def per_panel_block(n: int) -> str:
        cells = []
        for provider in [p for p in results if p not in ("compare_html", "out_dir")]:
            r = results.get(provider, {})
            panel_rel = f"{provider}/panel_{n}.png"
            if "error" in r or "panel_paths" not in r:
                cells.append(f'<div class="cell error">❌ {provider}</div>')
                continue
            cells.append(
                f'<div class="cell"><strong>{provider}</strong><br>'
                f'<a href="{panel_rel}" target="_blank">'
                f'<img src="{panel_rel}" alt="panel {n} {provider}"></a></div>'
            )
        prompt = panels[n - 1].get("prompt", "")[:200] if n <= len(panels) else ""
        return f"""
      <div class="row">
        <h4>Panel {n}</h4>
        <details><summary>prompt</summary><pre>{escape(prompt)}</pre></details>
        <div class="cells">{''.join(cells)}</div>
      </div>"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>A/B compare: {escape(sid)} — {escape(title)}</title>
  <style>
    body {{ font-family: -apple-system, system-ui, sans-serif; max-width: 1400px;
            margin: 20px auto; padding: 0 20px; color: #1a1a1a; }}
    h1 {{ font-size: 22px; }}
    .meta {{ background: #f5f5f7; padding: 12px 16px; border-radius: 8px;
             margin-bottom: 24px; font-size: 14px; }}
    .meta strong {{ color: #666; margin-right: 6px; }}
    .compare {{ display: grid; grid-template-columns: 1fr 1fr; gap: 24px;
                margin-bottom: 32px; }}
    .panel {{ border: 1px solid #d2d2d7; padding: 16px; border-radius: 10px;
              background: #fff; }}
    .panel.error {{ background: #fff0f0; border-color: #ff9999; }}
    .panel h3 {{ margin: 0 0 12px; font-size: 16px; }}
    .panel img {{ max-width: 100%; height: auto; display: block; border-radius: 4px; }}
    .metrics {{ font-size: 12px; color: #666; margin-top: 8px; line-height: 1.5; }}
    .error-msg {{ color: #c00; font-family: ui-monospace, monospace;
                  font-size: 12px; white-space: pre-wrap; }}
    h2 {{ font-size: 18px; margin-top: 32px; border-top: 1px solid #e5e5e7;
          padding-top: 24px; }}
    .row {{ margin-bottom: 24px; padding: 12px; background: #fafafa;
            border-radius: 6px; }}
    .row h4 {{ margin: 0 0 8px; font-size: 14px; color: #666; }}
    .row details {{ font-size: 12px; color: #888; margin-bottom: 8px; }}
    .row pre {{ background: #fff; padding: 8px; border-radius: 4px;
                white-space: pre-wrap; font-size: 12px; }}
    .cells {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }}
    .cell {{ padding: 8px; background: #fff; border: 1px solid #e5e5e7;
             border-radius: 4px; }}
    .cell img {{ max-width: 100%; height: auto; }}
  </style>
</head>
<body>
  <h1>A/B compare: {escape(sid)} — {escape(title)}</h1>
  <div class="meta">
    <strong>Genre:</strong> {escape(genre or '—')} ·
    <strong>Aspect:</strong> {escape(aspect)} ·
    <strong>Seed:</strong> {escape(str(seed))} ·
    <strong>Panels:</strong> {panel_count}
  </div>

  <h2>Final composite</h2>
  <div class="compare">
    {provider_block('minimax')}
    {provider_block('drawthings')}
  </div>

  <h2>Per-panel</h2>
  {''.join(per_panel_block(n) for n in range(1, panel_count + 1))}
</body>
</html>
"""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html, encoding="utf-8")
    logger.info(f"compare.html → {output_path}")
    return output_path


def escape(s: str) -> str:
    """HTML escape (минимальный, без сторонних зависимостей)."""
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def summarize(results: dict) -> str:
    """Краткая текстовая сводка результатов A/B."""
    lines = []
    for provider in [p for p in results if p not in ("compare_html", "out_dir")]:
        r = results[provider]
        if "error" in r:
            lines.append(f"  {provider:12} ❌ {r['error']}")
        elif "elapsed_sec" in r:
            dims = r.get("dims") or ("?", "?")
            lines.append(
                f"  {provider:12} ⏱ {r['elapsed_sec']:6.1f}s  "
                f"💾 {r['size_bytes']/1024:7.1f} KB  📐 {dims[0]}×{dims[1]}"
            )
    if "compare_html" in results:
        lines.append(f"  {'compare':12} 🌐 {results['compare_html']}")
    return "\n".join(lines)
