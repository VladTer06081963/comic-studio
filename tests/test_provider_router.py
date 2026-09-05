"""Tests for py.scenario.provider_router (mocked, без live provider calls)."""
from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from py.scenario.lmstudio_client import LMRuntimeError
from py.scenario.provider_router import (
    GENRE_DEFAULT,
    TONE_TO_GENRE,
    mark_fallback,
    pick_image_provider,
    pick_text_provider,
    try_with_fallback,
)
from py.render.drawthings_client import DTRuntimeError


class TestPickTextProvider(unittest.TestCase):
    """pick_text_provider: override > scenario > genre > env > default."""

    def test_override_wins(self):
        self.assertEqual(pick_text_provider({"text_provider": "lmstudio"}, override="minimax"), "minimax")

    def test_scenario_field(self):
        self.assertEqual(pick_text_provider({"text_provider": "lmstudio"}), "lmstudio")

    def test_genre_table_stalker(self):
        self.assertEqual(pick_text_provider({"genre": "stalker-horror"}), "lmstudio")

    def test_genre_table_kids(self):
        self.assertEqual(pick_text_provider({"genre": "kids"}), "minimax")

    def test_unknown_genre_falls_to_default(self):
        self.assertEqual(pick_text_provider({"genre": "experimental-xyz"}), "minimax")

    def test_no_scenario_returns_minimax(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(pick_text_provider(None), "minimax")

    def test_env_override_at_bottom(self):
        with patch.dict(os.environ, {"DEFAULT_TEXT_PROVIDER": "lmstudio"}):
            self.assertEqual(pick_text_provider(None), "lmstudio")

    def test_genre_priority_over_env(self):
        # Если scenario жанр есть — env НЕ применяется
        with patch.dict(os.environ, {"DEFAULT_TEXT_PROVIDER": "lmstudio"}):
            self.assertEqual(pick_text_provider({"genre": "kids"}), "minimax")

    def test_scenario_priority_over_genre(self):
        # Если явное поле — жанр игнорируется
        self.assertEqual(
            pick_text_provider({"genre": "kids", "text_provider": "lmstudio"}),
            "lmstudio",
        )

    def test_tone_dark_maps_to_stalker(self):
        """`tone=dark` (без явного genre) → lmstudio + drawthings."""
        self.assertEqual(
            pick_text_provider({"tone": "dark"}), "lmstudio"
        )
        self.assertEqual(
            pick_image_provider({"tone": "dark"}), "drawthings"
        )

    def test_tone_funny_maps_to_comedy(self):
        """`tone=funny` → MiniMax (нейтральный)."""
        self.assertEqual(pick_text_provider({"tone": "funny"}), "minimax")
        self.assertEqual(pick_image_provider({"tone": "funny"}), "minimax")

    def test_tone_epic_maps_to_military(self):
        """`tone=epic` → lmstudio + drawthings (через military genre)."""
        self.assertEqual(pick_text_provider({"tone": "epic"}), "lmstudio")
        self.assertEqual(pick_image_provider({"tone": "epic"}), "drawthings")

    def test_tone_unknown_falls_to_minimax(self):
        """Неизвестный тон (не в TONE_TO_GENRE) → default = MiniMax."""
        self.assertEqual(pick_text_provider({"tone": "experimental"}), "minimax")
        self.assertEqual(pick_image_provider({"tone": "experimental"}), "minimax")

    def test_explicit_genre_wins_over_tone(self):
        """Если оба поля есть — genre побеждает tone (tone это fallback)."""
        self.assertEqual(
            pick_text_provider({"tone": "dark", "genre": "comedy"}),
            "minimax",  # comedy genre выигрывает
        )

    def test_explicit_provider_wins_over_tone_and_genre(self):
        """Явный text_provider всегда побеждает."""
        self.assertEqual(
            pick_text_provider({"tone": "dark", "genre": "stalker-horror", "text_provider": "minimax"}),
            "minimax",
        )


class TestPickImageProvider(unittest.TestCase):
    """pick_image_provider: зеркало pick_text_provider, но с image field'ами."""

    def test_override_wins(self):
        self.assertEqual(
            pick_image_provider({"image_provider": "drawthings"}, override="minimax"),
            "minimax",
        )

    def test_scenario_field(self):
        self.assertEqual(
            pick_image_provider({"image_provider": "drawthings"}),
            "drawthings",
        )

    def test_genre_table_stalker(self):
        self.assertEqual(pick_image_provider({"genre": "stalker-horror"}), "drawthings")

    def test_genre_table_kids(self):
        self.assertEqual(pick_image_provider({"genre": "kids"}), "minimax")

    def test_env_override(self):
        with patch.dict(os.environ, {"DEFAULT_IMAGE_PROVIDER": "drawthings"}):
            self.assertEqual(pick_image_provider(None), "drawthings")


class TestGenreTable(unittest.TestCase):
    """GENRE_DEFAULT: контракт таблицы (минимум жанров, default присутствует)."""

    def test_genre_default_has_required_genres(self):
        required = {"stalker-horror", "military", "horror", "comedy", "kids", "default"}
        self.assertTrue(required.issubset(set(GENRE_DEFAULT.keys())))

    def test_genre_default_keys_have_text_and_image(self):
        for genre, mapping in GENRE_DEFAULT.items():
            self.assertIn("text", mapping, f"Genre {genre!r} missing 'text'")
            self.assertIn("image", mapping, f"Genre {genre!r} missing 'image'")

    def test_genre_default_values_are_known_providers(self):
        known_text = {"lmstudio", "minimax"}
        known_image = {"drawthings", "minimax"}
        for genre, mapping in GENRE_DEFAULT.items():
            self.assertIn(mapping["text"], known_text, f"Unknown text provider for {genre}")
            self.assertIn(mapping["image"], known_image, f"Unknown image provider for {genre}")

    def test_dark_genres_use_lmstudio_and_drawthings(self):
        for genre in ["stalker-horror", "military", "horror"]:
            self.assertEqual(GENRE_DEFAULT[genre]["text"], "lmstudio")
            self.assertEqual(GENRE_DEFAULT[genre]["image"], "drawthings")

    def test_neutral_genres_use_minimax(self):
        for genre in ["comedy", "kids", "educational", "sci-fi", "default"]:
            self.assertEqual(GENRE_DEFAULT[genre]["text"], "minimax")
            self.assertEqual(GENRE_DEFAULT[genre]["image"], "minimax")


class TestTryWithFallback(unittest.TestCase):
    """try_with_fallback: primary → fallback при ошибке."""

    def test_primary_succeeds_no_fallback(self):
        primary = lambda x: f"primary({x})"
        fallback = lambda x: f"fallback({x})"
        result, used, fb = try_with_fallback(
            primary, fallback, "lmstudio", "minimax", "hello",
        )
        self.assertEqual(result, "primary(hello)")
        self.assertEqual(used, "lmstudio")
        self.assertFalse(fb)

    def test_lm_failure_falls_back_to_minimax(self):
        def primary(x):
            raise LMRuntimeError("LM Studio down")
        fallback = lambda x: f"minimax({x})"
        result, used, fb = try_with_fallback(
            primary, fallback, "lmstudio", "minimax", "hello",
        )
        self.assertEqual(result, "minimax(hello)")
        self.assertEqual(used, "minimax")
        self.assertTrue(fb)

    def test_dt_failure_falls_back(self):
        def primary(x):
            raise DTRuntimeError("Draw Things down")
        fallback = lambda x: f"minimax({x})"
        result, used, fb = try_with_fallback(
            primary, fallback, "drawthings", "minimax", "hello",
        )
        self.assertTrue(fb)
        self.assertEqual(used, "minimax")

    def test_both_fail_raises_last(self):
        def primary(x):
            raise LMRuntimeError("primary down")
        def fallback(x):
            raise RuntimeError("fallback also down")
        with self.assertRaises(RuntimeError) as ctx:
            try_with_fallback(
                primary, fallback, "lmstudio", "minimax", "x",
            )
        self.assertIn("fallback also down", str(ctx.exception))

    def test_non_network_error_does_not_fallback(self):
        # ValueError — это баг логики, не проблема провайдера. Не делаем fallback.
        def primary(x):
            raise ValueError("bug in caller code")
        def fallback(x):
            return "should not be called"
        with self.assertRaises(ValueError):
            try_with_fallback(
                primary, fallback, "lmstudio", "minimax", "x",
            )


class TestMarkFallback(unittest.TestCase):
    """mark_fallback: помечает scenario JSON."""

    def test_marks_text_fallback(self):
        sc = {"id": "abc"}
        mark_fallback(sc, "text", "minimax")
        self.assertEqual(sc["text_provider_fallback"], "minimax")

    def test_marks_image_fallback(self):
        sc = {"id": "abc"}
        mark_fallback(sc, "image", "minimax")
        self.assertEqual(sc["image_provider_fallback"], "minimax")

    def test_does_not_overwrite_existing(self):
        # Если пометка уже была (для audit), не перезаписываем
        sc = {"id": "abc", "text_provider_fallback": "first-failure"}
        mark_fallback(sc, "text", "minimax")
        self.assertEqual(sc["text_provider_fallback"], "first-failure")

    def test_no_scenario_is_noop(self):
        mark_fallback(None, "text", "minimax")  # не должно кидать


if __name__ == "__main__":
    unittest.main()
