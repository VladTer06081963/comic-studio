"""Tests for py.scenario.lmstudio_client (mocked, без live provider calls)."""
from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

import requests

from py.scenario.lmstudio_client import LMRuntimeError, _call_lmstudio_chat


def _mock_response(json_data=None, status=200, text=""):
    """Создаёт mock-объект ответа requests."""
    resp = MagicMock()
    resp.status_code = status
    resp.text = text or (str(json_data) if json_data is not None else "")
    resp.json.return_value = json_data or {}
    return resp


class TestCallLmstudioChatSuccess(unittest.TestCase):

    @patch("py.scenario.lmstudio_client.requests.post")
    def test_successful_completion(self, mock_post):
        mock_post.return_value = _mock_response({
            "choices": [{"message": {"content": "Hello from Magnum"}}]
        })

        result = _call_lmstudio_chat("sys", "user")
        self.assertEqual(result, "Hello from Magnum")

    @patch("py.scenario.lmstudio_client.requests.post")
    def test_uses_default_model_from_env(self, mock_post):
        mock_post.return_value = _mock_response({
            "choices": [{"message": {"content": "ok"}}]
        })
        with patch.dict("os.environ", {"LM_MODEL": "custom-model-7b"}):
            _call_lmstudio_chat("sys", "user")
            args, kwargs = mock_post.call_args
            self.assertEqual(kwargs["json"]["model"], "custom-model-7b")

    @patch("py.scenario.lmstudio_client.requests.post")
    def test_model_parameter_overrides_env(self, mock_post):
        mock_post.return_value = _mock_response({
            "choices": [{"message": {"content": "ok"}}]
        })
        with patch.dict("os.environ", {"LM_MODEL": "from-env"}):
            _call_lmstudio_chat("sys", "user", model="from-arg")
            args, kwargs = mock_post.call_args
            self.assertEqual(kwargs["json"]["model"], "from-arg")

    @patch("py.scenario.lmstudio_client.requests.post")
    def test_payload_structure(self, mock_post):
        mock_post.return_value = _mock_response({
            "choices": [{"message": {"content": "ok"}}]
        })
        _call_lmstudio_chat("SYSTEM_TEXT", "USER_TEXT")
        args, kwargs = mock_post.call_args
        payload = kwargs["json"]
        self.assertEqual(payload["messages"][0]["role"], "system")
        self.assertEqual(payload["messages"][0]["content"], "SYSTEM_TEXT")
        self.assertEqual(payload["messages"][1]["role"], "user")
        self.assertEqual(payload["messages"][1]["content"], "USER_TEXT")
        self.assertEqual(payload["temperature"], 0.8)
        self.assertEqual(payload["max_tokens"], 2048)

    @patch("py.scenario.lmstudio_client.requests.post")
    def test_auth_header(self, mock_post):
        mock_post.return_value = _mock_response({
            "choices": [{"message": {"content": "ok"}}]
        })
        with patch.dict("os.environ", {"LM_API_KEY": "test-key-123"}):
            _call_lmstudio_chat("s", "u")
            args, kwargs = mock_post.call_args
            self.assertEqual(kwargs["headers"]["Authorization"], "Bearer test-key-123")


class TestCallLmstudioChatErrors(unittest.TestCase):
    """LMRuntimeError semantics: connection, timeout, HTTP, JSON, malformed."""

    @patch("py.scenario.lmstudio_client.requests.post")
    def test_connection_refused(self, mock_post):
        mock_post.side_effect = requests.exceptions.ConnectionError("refused")
        with self.assertRaises(LMRuntimeError) as ctx:
            _call_lmstudio_chat("s", "u")
        self.assertIn("LM Studio unavailable", str(ctx.exception))

    @patch("py.scenario.lmstudio_client.requests.post")
    def test_timeout(self, mock_post):
        mock_post.side_effect = requests.exceptions.Timeout("slow")
        with self.assertRaises(LMRuntimeError) as ctx:
            _call_lmstudio_chat("s", "u")
        self.assertIn("timeout", str(ctx.exception))

    @patch("py.scenario.lmstudio_client.requests.post")
    def test_http_500(self, mock_post):
        mock_post.return_value = _mock_response(status=500, text="Internal error")
        with self.assertRaises(LMRuntimeError) as ctx:
            _call_lmstudio_chat("s", "u")
        self.assertIn("HTTP 500", str(ctx.exception))

    @patch("py.scenario.lmstudio_client.requests.post")
    def test_http_422(self, mock_post):
        mock_post.return_value = _mock_response(status=422, text="Bad params")
        with self.assertRaises(LMRuntimeError) as ctx:
            _call_lmstudio_chat("s", "u")
        self.assertIn("HTTP 422", str(ctx.exception))

    @patch("py.scenario.lmstudio_client.requests.post")
    def test_invalid_json(self, mock_post):
        resp = MagicMock()
        resp.status_code = 200
        resp.text = "not-json{{}"
        resp.json.side_effect = ValueError("parse error")
        mock_post.return_value = resp
        with self.assertRaises(LMRuntimeError) as ctx:
            _call_lmstudio_chat("s", "u")
        self.assertIn("non-JSON", str(ctx.exception))

    @patch("py.scenario.lmstudio_client.requests.post")
    def test_no_choices(self, mock_post):
        mock_post.return_value = _mock_response({"error": "no model loaded"})
        with self.assertRaises(LMRuntimeError) as ctx:
            _call_lmstudio_chat("s", "u")
        self.assertIn("no 'choices'", str(ctx.exception))

    @patch("py.scenario.lmstudio_client.requests.post")
    def test_choice_without_content(self, mock_post):
        mock_post.return_value = _mock_response({
            "choices": [{"message": {}}]  # пустое message без content
        })
        with self.assertRaises(LMRuntimeError) as ctx:
            _call_lmstudio_chat("s", "u")
        self.assertIn("no message.content", str(ctx.exception))


class TestEnvDefaults(unittest.TestCase):

    @patch("py.scenario.lmstudio_client.requests.post")
    def test_default_url(self, mock_post):
        mock_post.return_value = _mock_response({
            "choices": [{"message": {"content": "ok"}}]
        })
        with patch.dict("os.environ", {}, clear=True):
            _call_lmstudio_chat("s", "u")
            args, kwargs = mock_post.call_args
            self.assertIn("192.168.55.1:1234", args[0])

    @patch("py.scenario.lmstudio_client.requests.post")
    def test_default_model(self, mock_post):
        mock_post.return_value = _mock_response({
            "choices": [{"message": {"content": "ok"}}]
        })
        with patch.dict("os.environ", {}, clear=True):
            _call_lmstudio_chat("s", "u")
            args, kwargs = mock_post.call_args
            self.assertIn("magnum", kwargs["json"]["model"].lower())


if __name__ == "__main__":
    unittest.main()
