"""Tests for py.render.ab_renderer (mocked, без live provider calls)."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from py.render.ab_renderer import (
    DEFAULT_PROVIDERS,
    _png_dimensions,
    _render_with_provider,
    _resolve_client,
    escape,
    generate_compare_html,
    render_ab,
    summarize,
)


# 1x1 PNG with width=8 height=8 (test fixture) — base64
_TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR4nGP8z8DwHwlYsTAwMDAwAAAtAgPmKVT+WQAAAABJRU5ErkJggg=="
)
# Width/Height from this PNG: 8x8 (8-bit grayscale)


def _write_png(path: Path) -> None:
    """Writes a valid 1x1 PNG to `path`."""
    import base64
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(base64.b64decode(_TINY_PNG_B64))


def _mock_generate_image_factory(calls_log: list):
    """Returns a mock generate_image that writes a 1x1 PNG and records call."""
    def _mock(prompt, output_path, **kwargs):
        path = Path(output_path)
        _write_png(path)
        calls_log.append({
            "prompt": prompt,
            "output_path": str(path),
            "kwargs": kwargs,
        })
        return path
    return _mock


class TestResolveClient(unittest.TestCase):

    def test_drawthings_client(self):
        from py.render import drawthings_client
        self.assertIs(_resolve_client("drawthings"), drawthings_client.generate_image)

    def test_minimax_client(self):
        from py.render import minimax_client
        self.assertIs(_resolve_client("minimax"), minimax_client.generate_image)

    def test_unknown_provider_raises(self):
        with self.assertRaises(ValueError) as ctx:
            _resolve_client("openai-dalle")
        self.assertIn("Unknown image provider", str(ctx.exception))


class TestPngDimensions(unittest.TestCase):

    def test_dimensions_from_real_png(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "tiny.png"
            _write_png(p)
            dims = _png_dimensions(p)
            # 8x8 PNG fixture
            self.assertEqual(dims, (8, 8))

    def test_nonexistent_returns_none(self):
        self.assertIsNone(_png_dimensions(Path("/nonexistent/file.png")))

    def test_non_png_returns_none(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "fake.png"
            p.write_bytes(b"NOT A PNG FILE")
            self.assertIsNone(_png_dimensions(p))


class TestEscape(unittest.TestCase):

    def test_escapes_special_chars(self):
        self.assertEqual(escape("<script>"), "&lt;script&gt;")
        self.assertEqual(escape("a&b"), "a&amp;b")
        self.assertEqual(escape('"hi"'), "&quot;hi&quot;")
        self.assertEqual(escape("it's"), "it&#39;s")


class TestRenderWithProvider(unittest.TestCase):

    def _scenario(self) -> dict:
        return {
            "id": "test-001",
            "title": "Test Comic",
            "genre": "comedy",
            "aspect_ratio": "16:9",
            "panels": [
                {"n": 1, "prompt": "first panel", "caption": "панель 1"},
                {"n": 2, "prompt": "second panel", "caption": "панель 2"},
            ],
        }

    @patch("py.render.ab_renderer.assemble_comic")
    @patch("py.render.ab_renderer.minimax_generate")
    def test_minimax_provider(self, mock_minimax, mock_assemble):
        mock_minimax.side_effect = _mock_generate_image_factory([])
        mock_assemble.return_value = Path("/tmp/final.png")

        with tempfile.TemporaryDirectory() as tmp:
            result = _render_with_provider(
                self._scenario(),
                Path(tmp),
                provider="minimax",
                seed=42,
            )

        self.assertEqual(result["provider"], "minimax")
        self.assertEqual(len(result["panel_paths"]), 2)
        self.assertEqual(mock_minimax.call_count, 2)
        # Seed передан в client
        first_call = mock_minimax.call_args_list[0]
        self.assertEqual(first_call.kwargs.get("seed"), 42)
        # LoRA не передан (для minimax)
        self.assertIsNone(first_call.kwargs.get("lora"))

    @patch("py.render.ab_renderer.assemble_comic")
    @patch("py.render.ab_renderer.drawthings_generate")
    def test_drawthings_provider_with_lora(self, mock_dt, mock_assemble):
        mock_dt.side_effect = _mock_generate_image_factory([])
        mock_assemble.return_value = Path("/tmp/final.png")

        with tempfile.TemporaryDirectory() as tmp:
            scenario = self._scenario()
            scenario["render_lora"] = "stalker_sdxl_lora_f16.ckpt"
            result = _render_with_provider(
                scenario, Path(tmp),
                provider="drawthings", seed=42,
                lora=scenario["render_lora"],  # caller (render_ab) извлекает из scenario
            )

        self.assertEqual(result["provider"], "drawthings")
        self.assertEqual(mock_dt.call_count, 2)
        # LoRA передан в DT client
        first_call = mock_dt.call_args_list[0]
        self.assertEqual(
            first_call.kwargs.get("lora"),
            "stalker_sdxl_lora_f16.ckpt",
        )

    def test_unknown_provider_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                _render_with_provider(
                    self._scenario(), Path(tmp),
                    provider="openai",
                )

    def test_no_panels_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError) as ctx:
                _render_with_provider(
                    {"id": "x", "panels": []}, Path(tmp),
                    provider="minimax",
                )
            self.assertIn("no panels", str(ctx.exception))


class TestRenderAB(unittest.TestCase):

    def _scenario(self) -> dict:
        return {
            "id": "ab-001",
            "title": "A/B Test",
            "genre": "stalker-horror",
            "aspect_ratio": "16:9",
            "seed": 42,
            "panels": [
                {"n": 1, "prompt": "panel 1 prompt"},
                {"n": 2, "prompt": "panel 2 prompt"},
            ],
        }

    @patch("py.render.ab_renderer.assemble_comic")
    @patch("py.render.ab_renderer.drawthings_generate")
    @patch("py.render.ab_renderer.minimax_generate")
    def test_both_providers_succeed(self, mock_mm, mock_dt, mock_assemble):
        mock_mm.side_effect = _mock_generate_image_factory([])
        mock_dt.side_effect = _mock_generate_image_factory([])
        # assemble_comic возвращает тот же путь, что ему передали
        def _echo(**kwargs):
            out = kwargs.get("output_path") or Path("/tmp/final.png")
            _write_png(Path(out))
            return Path(out)
        mock_assemble.side_effect = _echo

        with tempfile.TemporaryDirectory() as tmp:
            results = render_ab(self._scenario(), Path(tmp), seed=42)

            # Оба провайдера отрендерили
            self.assertIn("minimax", results)
            self.assertIn("drawthings", results)
            # compare.html сгенерирован
            self.assertIn("compare_html", results)
            self.assertTrue(results["compare_html"].exists())
            # Seed передан обоим
            self.assertEqual(mock_mm.call_args_list[0].kwargs.get("seed"), 42)
            self.assertEqual(mock_dt.call_args_list[0].kwargs.get("seed"), 42)

    @patch("py.render.ab_renderer.assemble_comic")
    @patch("py.render.ab_renderer.drawthings_generate")
    @patch("py.render.ab_renderer.minimax_generate")
    def test_minimax_fails_drawthings_succeeds(self, mock_mm, mock_dt, mock_assemble):
        """Если один провайдер упал — второй всё равно рендерит, compare.html создаётся."""
        mock_mm.side_effect = RuntimeError("MiniMax down")
        mock_dt.side_effect = _mock_generate_image_factory([])

        def _echo(**kwargs):
            out = kwargs.get("output_path") or Path("/tmp/final.png")
            _write_png(Path(out))
            return Path(out)
        mock_assemble.side_effect = _echo

        with tempfile.TemporaryDirectory() as tmp:
            results = render_ab(self._scenario(), Path(tmp), seed=42)

            self.assertIn("error", results["minimax"])
            self.assertEqual(results["minimax"]["provider"], "minimax")
            self.assertNotIn("error", results["drawthings"])
            # compare.html всё равно создан
            self.assertTrue(results["compare_html"].exists())

    def test_custom_providers_subset(self):
        """Можно указать только один провайдер через параметр."""
        with patch("py.render.ab_renderer.assemble_comic") as mock_asm, \
             patch("py.render.ab_renderer.minimax_generate") as mock_mm:
            mock_mm.side_effect = _mock_generate_image_factory([])
            def _echo(**kwargs):
                out = kwargs.get("output_path") or Path("/tmp/final.png")
                _write_png(Path(out))
                return Path(out)
            mock_asm.side_effect = _echo
            with tempfile.TemporaryDirectory() as tmp:
                results = render_ab(
                    self._scenario(), Path(tmp),
                    providers=("minimax",),  # только minimax
                )
                self.assertIn("minimax", results)
                self.assertNotIn("drawthings", results)


class TestGenerateCompareHtml(unittest.TestCase):

    def _scenario(self) -> dict:
        return {
            "id": "cmp-001",
            "title": "Compare Test",
            "genre": "stalker-horror",
            "aspect_ratio": "16:9",
            "seed": 7,
            "panels": [
                {"n": 1, "prompt": "first panel <script>alert(1)</script>"},
                {"n": 2, "prompt": "second panel"},
            ],
        }

    def _results(self, base_dir: Path) -> dict:
        """Возвращает results с реальными путями относительно base_dir."""
        return {
            "minimax": {
                "provider": "minimax",
                "elapsed_sec": 12.5,
                "panel_elapsed_sec": [6.0, 6.5],
                "size_bytes": 102400,
                "dims": (1024, 576),
                "final_path": base_dir / "minimax" / "final.png",
                "panel_paths": [base_dir / "minimax" / "panel_1.png"],
            },
            "drawthings": {
                "provider": "drawthings",
                "elapsed_sec": 8.3,
                "panel_elapsed_sec": [4.0, 4.3],
                "size_bytes": 81920,
                "dims": (1024, 576),
                "final_path": base_dir / "drawthings" / "final.png",
                "panel_paths": [base_dir / "drawthings" / "panel_1.png"],
            },
        }

    def test_html_structure(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            output = base / "compare.html"
            results = self._results(base)
            path = generate_compare_html(self._scenario(), results, output)
            self.assertTrue(path.exists())
            html = path.read_text(encoding="utf-8")

            # Ключевые секции присутствуют
            self.assertIn("A/B compare", html)
            self.assertIn("cmp-001", html)
            self.assertIn("Compare Test", html)
            self.assertIn("stalker-horror", html)
            self.assertIn("Final composite", html)
            self.assertIn("Per-panel", html)
            # Оба провайдера
            self.assertIn("minimax", html.lower())
            self.assertIn("drawthings", html.lower())
            # Метрики
            self.assertIn("12.5s", html)
            self.assertIn("8.3s", html)
            self.assertIn("1024×576", html)

    def test_html_escapes_prompt(self):
        """XSS в prompt'е не должен ломать HTML."""
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            output = base / "compare.html"
            results = self._results(base)
            generate_compare_html(self._scenario(), results, output)
            html = output.read_text(encoding="utf-8")
            # <script> в prompt эскейплено
            self.assertIn("&lt;script&gt;", html)
            self.assertNotIn("<script>alert(1)</script>", html)

    def test_html_with_error_in_results(self):
        """Если один провайдер упал — HTML всё равно генерируется с error-блоком."""
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            output = base / "compare.html"
            results = self._results(base)
            results["drawthings"] = {"provider": "drawthings", "error": "DT unavailable"}
            path = generate_compare_html(self._scenario(), results, output)
            html = path.read_text(encoding="utf-8")
            self.assertIn("DT unavailable", html)
            self.assertIn('class="panel error"', html)


class TestSummarize(unittest.TestCase):

    def test_summarize_with_results(self):
        results = {
            "minimax": {
                "provider": "minimax",
                "elapsed_sec": 12.5,
                "size_bytes": 102400,
                "dims": (1024, 576),
            },
            "drawthings": {
                "provider": "drawthings",
                "elapsed_sec": 8.3,
                "size_bytes": 81920,
                "dims": (1024, 576),
            },
            "compare_html": Path("/tmp/compare.html"),
        }
        s = summarize(results)
        self.assertIn("minimax", s)
        self.assertIn("12.5s", s)
        self.assertIn("drawthings", s)
        self.assertIn("8.3s", s)
        self.assertIn("compare", s)
        self.assertIn("1024×576", s)

    def test_summarize_with_error(self):
        results = {
            "minimax": {"provider": "minimax", "error": "boom"},
            "drawthings": {
                "provider": "drawthings",
                "elapsed_sec": 5.0,
                "size_bytes": 50000,
                "dims": (1024, 576),
            },
            "compare_html": Path("/tmp/compare.html"),
        }
        s = summarize(results)
        self.assertIn("❌", s)
        self.assertIn("boom", s)


if __name__ == "__main__":
    unittest.main()
