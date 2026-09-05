"""Tests for py.render.drawthings_client (mocked, без live provider calls)."""
from __future__ import annotations

import base64
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import requests

from py.render.drawthings_client import (
    ASPECT_RATIO_SIZES,
    DTRuntimeError,
    _get_dt_lora_trigger,
    _load_dt_lora_triggers,
    _resolve_dt_models_dir,
    _resolve_size,
    generate_image,
)


# 1x1 transparent PNG, base64-encoded
_TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


def _mock_response(json_data=None, status=200, text=""):
    resp = MagicMock()
    resp.status_code = status
    resp.text = text or (str(json_data) if json_data is not None else "")
    resp.json.return_value = json_data or {}
    return resp


class TestResolveSize(unittest.TestCase):

    def test_known_ratios(self):
        self.assertEqual(_resolve_size("16:9"), (1024, 576))
        self.assertEqual(_resolve_size("9:16"), (576, 1024))
        self.assertEqual(_resolve_size("1:1"), (1024, 1024))

    def test_unknown_ratio_falls_back(self):
        # Не падаем, логируем warning, возвращаем 16:9
        self.assertEqual(_resolve_size("21:9"), (1024, 576))
        self.assertEqual(_resolve_size("weird"), (1024, 576))

    def test_table_completeness(self):
        # Все основные ratios присутствуют
        for ratio in ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"]:
            self.assertIn(ratio, ASPECT_RATIO_SIZES)


class TestGenerateImageSuccess(unittest.TestCase):
    """Happy path: base64 PNG декодируется и пишется в output_path."""

    @patch("py.render.drawthings_client.requests.post")
    def test_saves_png(self, mock_post):
        mock_post.return_value = _mock_response({"images": [_TINY_PNG_B64]})

        with patch.dict("os.environ", {}, clear=True):
            with patch("py.render.drawthings_client.Path") as mock_path_cls:
                # Чтобы тест был детерминированным и не зависел от cwd
                mock_path = MagicMock()
                mock_path_cls.return_value = mock_path
                mock_path.parent.mkdir = MagicMock()
                mock_path.write_bytes = MagicMock()

                result = generate_image("a cat", "/tmp/out.png")

        # Проверяем, что write_bytes вызван с декодированным PNG
        expected_bytes = base64.b64decode(_TINY_PNG_B64)
        mock_path.write_bytes.assert_called_once_with(expected_bytes)

    @patch("py.render.drawthings_client.requests.post")
    def test_aspect_ratio_payload(self, mock_post):
        mock_post.return_value = _mock_response({"images": [_TINY_PNG_B64]})

        with patch.dict("os.environ", {}, clear=True):
            with patch("py.render.drawthings_client.Path") as mock_path_cls:
                mock_path = MagicMock()
                mock_path_cls.return_value = mock_path
                generate_image("a cat", "/tmp/out.png", aspect_ratio="9:16")

        args, kwargs = mock_post.call_args
        payload = kwargs["json"]
        self.assertEqual(payload["width"], 576)
        self.assertEqual(payload["height"], 1024)

    @patch("py.render.drawthings_client.requests.post")
    def test_lora_passed_via_dt_trigger_prefix(self, mock_post):
        """LoRA активируется через trigger prefix из custom_lora.json (родной DT)."""
        with tempfile.TemporaryDirectory() as tmp:
            models_dir = Path(tmp)
            (models_dir / "custom_lora.json").write_text(json.dumps([
                {
                    "prefix": "industrial apocalypse style [1.0] ",
                    "name": "STALKER_SDXL",
                    "file": "stalker_sdxl_lora_f16.ckpt",
                }
            ]), encoding="utf-8")
            # Очищаем кэш модуля, чтобы перезагрузился с нашим tmp
            from py.render import drawthings_client as dtc
            dtc._DT_LORA_CACHE = None
            dtc._DT_MODELS_DIR = None
            with patch.dict("os.environ", {"DRAWTHINGS_MODELS_DIR": str(models_dir)}):
                # _resolve_size → (1024, 576). Прямо в файл — без Path-патча.
                mock_post.return_value = _mock_response({"images": [_TINY_PNG_B64]})
                result = generate_image(
                    "stalker scene", "/tmp/dt_test_lora.png",
                    lora="stalker_sdxl_lora_f16.ckpt",
                )

        args, kwargs = mock_post.call_args
        payload = kwargs["json"]
        # Trigger prefix в начале prompt
        self.assertTrue(
            payload["prompt"].startswith("industrial apocalypse style [1.0] "),
            f"Expected DT trigger prefix, got: {payload['prompt']!r}"
        )
        self.assertIn("stalker scene", payload["prompt"])
        # НЕ используем A1111-стиль
        self.assertNotIn("<lora:", payload["prompt"])
        # File реально записан
        self.assertTrue(result.exists())

    @patch("py.render.drawthings_client.requests.post")
    def test_no_lora_no_trigger(self, mock_post):
        mock_post.return_value = _mock_response({"images": [_TINY_PNG_B64]})
        from py.render import drawthings_client as dtc
        dtc._DT_LORA_CACHE = None
        dtc._DT_MODELS_DIR = None

        with patch.dict("os.environ", {}, clear=True):
            generate_image("a cat", "/tmp/dt_test_nolora.png")

        args, kwargs = mock_post.call_args
        payload = kwargs["json"]
        # Ни trigger, ни A1111-tag
        self.assertNotIn("<lora:", payload["prompt"])
        self.assertNotIn("industrial apocalypse", payload["prompt"])

    @patch("py.render.drawthings_client.requests.post")
    def test_lora_not_in_custom_lora_falls_back_to_a1111_tag(self, mock_post):
        """Если LoRA не зарегистрирована в custom_lora.json — fallback на A1111 tag."""
        with tempfile.TemporaryDirectory() as tmp:
            models_dir = Path(tmp)
            (models_dir / "custom_lora.json").write_text("[]", encoding="utf-8")
            from py.render import drawthings_client as dtc
            dtc._DT_LORA_CACHE = None
            dtc._DT_MODELS_DIR = None
            with patch.dict("os.environ", {"DRAWTHINGS_MODELS_DIR": str(models_dir)}):
                mock_post.return_value = _mock_response({"images": [_TINY_PNG_B64]})
                generate_image(
                    "a cat", "/tmp/dt_test_unknown_lora.png",
                    lora="unknown_lora.ckpt",
                )

        args, kwargs = mock_post.call_args
        payload = kwargs["json"]
        # Fallback на A1111-стиль
        self.assertIn("<lora:unknown_lora.ckpt:0.7>", payload["prompt"])

    @patch("py.render.drawthings_client.requests.post")
    def test_random_seed_when_none(self, mock_post):
        mock_post.return_value = _mock_response({"images": [_TINY_PNG_B64]})

        with patch.dict("os.environ", {}, clear=True):
            with patch("py.render.drawthings_client.Path") as mock_path_cls:
                mock_path = MagicMock()
                mock_path_cls.return_value = mock_path
                generate_image("a cat", "/tmp/out.png", seed=None)

        args, kwargs = mock_post.call_args
        self.assertEqual(kwargs["json"]["seed"], -1)

    @patch("py.render.drawthings_client.requests.post")
    def test_explicit_seed(self, mock_post):
        mock_post.return_value = _mock_response({"images": [_TINY_PNG_B64]})

        with patch.dict("os.environ", {}, clear=True):
            with patch("py.render.drawthings_client.Path") as mock_path_cls:
                mock_path = MagicMock()
                mock_path_cls.return_value = mock_path
                generate_image("a cat", "/tmp/out.png", seed=42)

        args, kwargs = mock_post.call_args
        self.assertEqual(kwargs["json"]["seed"], 42)

    @patch("py.render.drawthings_client.requests.post")
    def test_sampler_and_steps_in_payload(self, mock_post):
        mock_post.return_value = _mock_response({"images": [_TINY_PNG_B64]})

        with patch.dict("os.environ", {}, clear=True):
            with patch("py.render.drawthings_client.Path") as mock_path_cls:
                mock_path = MagicMock()
                mock_path_cls.return_value = mock_path
                generate_image(
                    "a cat", "/tmp/out.png",
                    sampler="Euler a", steps=30, cfg_scale=8.5,
                )

        args, kwargs = mock_post.call_args
        payload = kwargs["json"]
        self.assertEqual(payload["sampler_name"], "Euler a")
        self.assertEqual(payload["steps"], 30)
        self.assertEqual(payload["cfg_scale"], 8.5)


class TestGenerateImageErrors(unittest.TestCase):
    """DTRuntimeError: connection, timeout, HTTP, JSON, malformed."""

    @patch("py.render.drawthings_client.requests.post")
    def test_connection_refused(self, mock_post):
        mock_post.side_effect = requests.exceptions.ConnectionError("refused")
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(DTRuntimeError) as ctx:
                generate_image("a cat", "/tmp/out.png")
        self.assertIn("Draw Things unavailable", str(ctx.exception))

    @patch("py.render.drawthings_client.requests.post")
    def test_timeout(self, mock_post):
        mock_post.side_effect = requests.exceptions.Timeout("slow")
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(DTRuntimeError) as ctx:
                generate_image("a cat", "/tmp/out.png")
        self.assertIn("timeout", str(ctx.exception))

    @patch("py.render.drawthings_client.requests.post")
    def test_http_422(self, mock_post):
        mock_post.return_value = _mock_response(status=422, text="Invalid params")
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(DTRuntimeError) as ctx:
                generate_image("a cat", "/tmp/out.png")
        self.assertIn("HTTP 422", str(ctx.exception))

    @patch("py.render.drawthings_client.requests.post")
    def test_http_500(self, mock_post):
        mock_post.return_value = _mock_response(status=500, text="oops")
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(DTRuntimeError) as ctx:
                generate_image("a cat", "/tmp/out.png")
        self.assertIn("HTTP 500", str(ctx.exception))

    @patch("py.render.drawthings_client.requests.post")
    def test_no_images_in_response(self, mock_post):
        mock_post.return_value = _mock_response({"error": "model not loaded"})
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(DTRuntimeError) as ctx:
                generate_image("a cat", "/tmp/out.png")
        self.assertIn("no 'images'", str(ctx.exception))

    @patch("py.render.drawthings_client.requests.post")
    def test_invalid_base64(self, mock_post):
        mock_post.return_value = _mock_response({"images": ["not-base64!!!"]})
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(DTRuntimeError) as ctx:
                generate_image("a cat", "/tmp/out.png")
        self.assertIn("invalid base64", str(ctx.exception))

    @patch("py.render.drawthings_client.requests.post")
    def test_invalid_json(self, mock_post):
        resp = MagicMock()
        resp.status_code = 200
        resp.text = "not-json"
        resp.json.side_effect = ValueError("parse")
        mock_post.return_value = resp
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(DTRuntimeError) as ctx:
                generate_image("a cat", "/tmp/out.png")
        self.assertIn("non-JSON", str(ctx.exception))


class TestEnvDefaults(unittest.TestCase):

    @patch("py.render.drawthings_client.requests.post")
    def test_default_url(self, mock_post):
        mock_post.return_value = _mock_response({"images": [_TINY_PNG_B64]})
        with patch.dict("os.environ", {}, clear=True):
            with patch("py.render.drawthings_client.Path") as mock_path_cls:
                mock_path = MagicMock()
                mock_path_cls.return_value = mock_path
                generate_image("a cat", "/tmp/out.png")
        args, _ = mock_post.call_args
        self.assertIn("192.168.55.1:7860", args[0])
        self.assertIn("txt2img", args[0])

    @patch("py.render.drawthings_client.requests.post")
    def test_default_timeout(self, mock_post):
        mock_post.return_value = _mock_response({"images": [_TINY_PNG_B64]})
        with patch.dict("os.environ", {}, clear=True):
            with patch("py.render.drawthings_client.Path") as mock_path_cls:
                mock_path = MagicMock()
                mock_path_cls.return_value = mock_path
                generate_image("a cat", "/tmp/out.png")
        _, kwargs = mock_post.call_args
        self.assertEqual(kwargs["timeout"], 120)

    @patch("py.render.drawthings_client.requests.post")
    def test_custom_timeout_from_env(self, mock_post):
        mock_post.return_value = _mock_response({"images": [_TINY_PNG_B64]})
        with patch.dict("os.environ", {"DRAWTHINGS_TIMEOUT": "60"}):
            with patch("py.render.drawthings_client.Path") as mock_path_cls:
                mock_path = MagicMock()
                mock_path_cls.return_value = mock_path
                generate_image("a cat", "/tmp/out.png")
        _, kwargs = mock_post.call_args
        self.assertEqual(kwargs["timeout"], 60)


if __name__ == "__main__":
    unittest.main()
