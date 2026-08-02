"""Тесты для `py.render.html_renderer`.

Покрывает (см. spec `python-comic-rendering`):
- validate_layout (valid + invalid bubble_style, bubble_position, layout, panel count, id)
- build_layout (shape, mismatched lengths)
- render_html (создаёт HTML, inline-CSS, относительные пути, шрифты копируются)
- XSS escape через jinja2 autoescape
- Backward-compat: render_html работает без scenario, для legacy рендеров
- End-to-end: assemble_comic генерирует PNG + HTML + layout.json

Mocked suite: без live MiniMax calls (использует fake PNG через PIL.Image.new).
"""
from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from PIL import Image

from py.render import comic_assembler
from py.render.html_renderer import build_layout, render_html, validate_layout


def _make_fake_png(path: Path, size=(320, 240), color=(180, 180, 180)) -> None:
    """Создаёт минимальный валидный PNG-файл."""
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, color).save(path, format="PNG")


def _build_layout_dict(**overrides) -> dict:
    """Базовый валидный layout-манифест."""
    base = {
        "id": "test001",
        "title": "Test Comic",
        "tone": "funny",
        "image_style": "comic",
        "layout": "comic",
        "aspect_ratio": "16:9",
        "panels": [
            {
                "n": 1,
                "image": "panel_1.png",
                "caption": "Привет, мир!",
                "bubble_style": "bubble",
                "bubble_position": "top-right",
            },
            {
                "n": 2,
                "image": "panel_2.png",
                "caption": "Взрыв!",
                "bubble_style": "boom",
                "bubble_position": "bottom-left",
            },
            {
                "n": 3,
                "image": "panel_3.png",
                "caption": "Записка",
                "bubble_style": "memo",
                "bubble_position": "top-left",
            },
        ],
        "fonts": {"bubble": "Bangers", "boom": "Bungee", "memo": "Caveat"},
        "created_at": "2026-08-02T22:30:00+00:00",
    }
    base.update(overrides)
    return base


def _build_scenario_dict(**overrides) -> dict:
    base = {
        "id": "test001",
        "title": "Test",
        "tone": "epic",
        "image_style": "comic",
        "style": "bubble",
        "layout": "comic",
        "aspect_ratio": "16:9",
        "panels": [
            {"n": 1, "prompt": "p1", "caption": "A"},
            {"n": 2, "prompt": "p2", "caption": "B"},
            {"n": 3, "prompt": "p3", "caption": "C"},
        ],
    }
    base.update(overrides)
    return base


class ValidateLayoutTests(unittest.TestCase):
    def test_accepts_valid_layout(self):
        # Should not raise
        validate_layout(_build_layout_dict())
        self.assertIsNone(validate_layout(_build_layout_dict()))

    def test_rejects_invalid_bubble_style(self):
        bad = _build_layout_dict()
        bad["panels"][0]["bubble_style"] = "rainbow"
        with self.assertRaises(ValueError) as ctx:
            validate_layout(bad)
        self.assertIn("bubble_style", str(ctx.exception))
        self.assertIn("rainbow", str(ctx.exception))

    def test_rejects_invalid_bubble_position(self):
        bad = _build_layout_dict()
        bad["panels"][0]["bubble_position"] = "center"
        with self.assertRaises(ValueError) as ctx:
            validate_layout(bad)
        self.assertIn("bubble_position", str(ctx.exception))

    def test_rejects_invalid_layout(self):
        bad = _build_layout_dict()
        bad["layout"] = "unknown"
        with self.assertRaises(ValueError) as ctx:
            validate_layout(bad)
        self.assertIn("layout", str(ctx.exception))

    def test_rejects_invalid_panel_count(self):
        bad = _build_layout_dict()
        bad["panels"] = bad["panels"][:1]  # only 1
        with self.assertRaises(ValueError) as ctx:
            validate_layout(bad)
        self.assertIn("panel count", str(ctx.exception))

        bad2 = _build_layout_dict()
        bad2["panels"] = bad2["panels"] * 2  # 6
        with self.assertRaises(ValueError) as ctx2:
            validate_layout(bad2)
        self.assertIn("panel count", str(ctx2.exception))

    def test_rejects_invalid_id(self):
        bad = _build_layout_dict()
        bad["id"] = "ab"  # too short
        with self.assertRaises(ValueError) as ctx:
            validate_layout(bad)
        self.assertIn("id", str(ctx.exception))


class BuildLayoutTests(unittest.TestCase):
    def test_returns_correct_shape(self):
        scenario = _build_scenario_dict()
        manifest = build_layout(
            scenario=scenario,
            panel_paths=[Path("/tmp/p1.png"), Path("/tmp/p2.png"), Path("/tmp/p3.png")],
            captions=["A", "B", "C"],
            bubble_styles=["bubble", "star", "boom"],
            bubble_positions=["top-left", "top-right", "bottom-left"],
            layout="comic",
            fonts={"bubble": "Bangers"},
        )
        self.assertEqual(manifest["id"], "test001")
        self.assertEqual(manifest["layout"], "comic")
        self.assertEqual(len(manifest["panels"]), 3)
        self.assertEqual(manifest["panels"][0]["image"], "p1.png")  # basename
        self.assertEqual(manifest["panels"][1]["caption"], "B")
        self.assertIn("created_at", manifest)
        self.assertIn("fonts", manifest)

    def test_rejects_mismatched_lengths(self):
        scenario = _build_scenario_dict()
        with self.assertRaises(ValueError) as ctx:
            build_layout(
                scenario=scenario,
                panel_paths=["p1", "p2", "p3"],
                captions=["a", "b", "c", "d"],  # 4 vs 3
                bubble_styles=["bubble"] * 3,
                bubble_positions=["top-left"] * 3,
                layout="comic",
            )
        self.assertIn("captions length", str(ctx.exception))


class RenderHtmlTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.tmp_path = Path(self.tmp.name)

    def test_creates_html_file_with_inline_css(self):
        out = self.tmp_path / "test001.html"
        result = render_html(_build_layout_dict(), out)
        self.assertTrue(result.exists())
        html = result.read_text(encoding="utf-8")
        self.assertIn("<!DOCTYPE html>", html)
        self.assertIn("<html lang=\"ru\">", html)
        self.assertIn("<meta charset=\"UTF-8\">", html)
        # inline CSS: should contain comic.css body (NOT external link)
        self.assertIn("@font-face", html)
        self.assertIn(".bubble--bubble", html)
        self.assertIn("bubble-pop", html)
        self.assertNotIn('rel="stylesheet"', html)

    def test_uses_relative_paths_for_fonts_and_panels(self):
        out = self.tmp_path / "test001.html"
        render_html(_build_layout_dict(), out)
        html = out.read_text(encoding="utf-8")
        # relative panel paths (use comic_id prefix because panels live in <id>/ subdir)
        self.assertIn('src="./test001/panel_1.png"', html)
        self.assertIn('src="./test001/panel_2.png"', html)
        # relative font paths (in @font-face src)
        self.assertIn("./test001/fonts/Bangers.woff2", html)
        self.assertIn("./test001/fonts/Caveat.woff2", html)

    def test_copies_fonts_to_output_dir(self):
        out = self.tmp_path / "test001.html"
        render_html(_build_layout_dict(), out)
        # Fonts копируются в `<out_dir>/<id>/fonts/` (sibling of panels),
        # чтобы HTML + <id>/ можно было запаковать в .zip автономно.
        fonts_dir = self.tmp_path / "test001" / "fonts"
        self.assertTrue(fonts_dir.is_dir(), f"fonts dir not found at {fonts_dir}")
        fonts = sorted(p.name for p in fonts_dir.glob("*.woff2"))
        self.assertGreaterEqual(len(fonts), 5)
        self.assertIn("Bangers.woff2", fonts)
        self.assertIn("Bangers-Bold.woff2", fonts)
        self.assertIn("UnifrakturCook.woff2", fonts)
        self.assertIn("Bungee.woff2", fonts)
        self.assertIn("Caveat.woff2", fonts)

    def test_xss_caption_escaped(self):
        bad = _build_layout_dict()
        bad["panels"][0]["caption"] = "<script>alert('xss')</script>"
        out = self.tmp_path / "xss.html"
        render_html(bad, out)
        html = out.read_text(encoding="utf-8")
        self.assertNotIn("<script>alert('xss')</script>", html)
        self.assertIn("&lt;script&gt;", html)

    def test_xss_title_escaped(self):
        bad = _build_layout_dict()
        bad["title"] = "<img src=x onerror=alert(1)>"
        out = self.tmp_path / "title_xss.html"
        render_html(bad, out)
        html = out.read_text(encoding="utf-8")
        # Should be escaped; raw <img tag must not appear in title
        self.assertNotIn("<img src=x onerror=alert(1)>", html)

    def test_render_html_rejects_invalid_layout(self):
        bad = _build_layout_dict()
        bad["panels"][0]["bubble_style"] = "unknown"
        out = self.tmp_path / "bad.html"
        with self.assertRaises(ValueError):
            render_html(bad, out)
        self.assertFalse(out.exists())

    def test_works_without_live_minimax(self):
        # Uses fake PNG images — no network calls. Confirms package is hermetic.
        scenario = _build_scenario_dict()
        panels_dir = self.tmp_path / "panels"
        panels_dir.mkdir()
        paths = []
        for i in range(1, 4):
            p = panels_dir / f"panel_{i}.png"
            _make_fake_png(p)
            paths.append(p)

        manifest = build_layout(
            scenario=scenario,
            panel_paths=paths,
            captions=["A", "B", "C"],
            bubble_styles=["bubble"] * 3,
            bubble_positions=["top-left", "top-right", "bottom-left"],
            layout="comic",
        )
        out = self.tmp_path / "hermetic.html"
        result = render_html(manifest, out)
        self.assertTrue(result.exists())


class AssembleComicIntegrationTests(unittest.TestCase):
    """End-to-end тест `assemble_comic`: PNG + HTML + layout.json."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.tmp_path = Path(self.tmp.name)
        # Создаём 3 fake PNG панели
        self.panels_dir = self.tmp_path / "panels"
        self.panels_dir.mkdir()
        self.panel_paths = []
        for i in range(1, 4):
            p = self.panels_dir / f"panel_{i}.png"
            _make_fake_png(p, size=(512, 384))
            self.panel_paths.append(p)

    def test_assemble_with_bubbles_emits_png_and_html(self):
        scenario = _build_scenario_dict(id="asmb001")
        scenario["style"] = "bubble"
        out_png = self.tmp_path / "asmb001.png"
        result = comic_assembler.assemble_comic(
            panel_paths=self.panel_paths,
            captions=["A", "B", "C"],
            output_path=out_png,
            style="bubble",
            layout="comic",
            scenario=scenario,
            preview_mode="with-bubbles",
        )
        self.assertEqual(result, out_png)
        self.assertTrue(out_png.exists())
        self.assertGreater(out_png.stat().st_size, 0)

        # HTML артефакты
        html_path = out_png.parent / "asmb001.html"
        layout_path = out_png.parent / "asmb001" / "layout.json"
        self.assertTrue(html_path.exists(), f"HTML not created at {html_path}")
        self.assertTrue(layout_path.exists(), f"layout.json not created at {layout_path}")
        layout = json.loads(layout_path.read_text(encoding="utf-8"))
        self.assertEqual(layout["id"], "asmb001")
        self.assertEqual(len(layout["panels"]), 3)

    def test_assemble_panels_only_no_html_when_no_scenario(self):
        # Backward-compat: если scenario не передан, только PNG
        out_png = self.tmp_path / "backcompat.png"
        comic_assembler.assemble_comic(
            panel_paths=self.panel_paths,
            captions=["A", "B", "C"],
            output_path=out_png,
            style="bubble",
            layout="comic",
            scenario=None,
            preview_mode="panels-only",
        )
        self.assertTrue(out_png.exists())
        # HTML НЕ должен быть создан без scenario
        html_path = out_png.parent / "backcompat.html"
        self.assertFalse(html_path.exists())

    def test_assemble_with_bubbles_legacy_keeps_pillow_overlay(self):
        # Backward-compat: with-bubbles + без scenario = как раньше
        out_png = self.tmp_path / "legacy.png"
        comic_assembler.assemble_comic(
            panel_paths=self.panel_paths,
            captions=["A", "B", "C"],
            output_path=out_png,
            style="bubble",
            layout="comic",
            scenario=None,
            preview_mode="with-bubbles",
        )
        self.assertTrue(out_png.exists())
        # PNG должен быть валидным
        with Image.open(out_png) as img:
            img.verify()


if __name__ == "__main__":
    unittest.main()