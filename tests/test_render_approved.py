from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from scripts import render_approved as render


def write_png(path: Path, color: str = "blue") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (16, 16), color).save(path)
    return path


class RenderApprovedTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.comics = self.root / "comics"
        self.comics.mkdir()
        self.scenario = {
            "id": "test-0001",
            "status": "approved",
            "style": "bubble",
            "layout": "comic",
            "aspect_ratio": "16:9",
            "seed": 42,
            "panels": [
                {"n": 1, "prompt": "safe prompt one", "caption": "Один"},
                {"n": 2, "prompt": "safe prompt two", "caption": "Два"},
            ],
        }

    def tearDown(self):
        self.tmp.cleanup()

    def fake_generate(self, *, output_path, **_kwargs):
        return write_png(Path(output_path), "green")

    def fake_assemble(self, *, output_path, **_kwargs):
        return write_png(Path(output_path), "red")

    def test_unapproved_initial_render_makes_zero_provider_calls(self):
        calls: list[str] = []

        def provider(**kwargs):
            calls.append(kwargs["prompt"])
            return self.fake_generate(**kwargs)

        with (
            patch.object(render, "comics_dir", return_value=self.comics),
            patch.object(render, "validate_approved", return_value=None),
            patch.object(render, "generate_image", side_effect=provider),
        ):
            with self.assertRaisesRegex(RuntimeError, "persisted approval"):
                render.render_one(self.scenario)
        self.assertEqual(calls, [])

    def test_initial_render_checks_gate_and_commits_artifacts(self):
        gates: list[str] = []

        def gate(scenario_id):
            gates.append(scenario_id)
            return self.scenario

        with (
            patch.object(render, "comics_dir", return_value=self.comics),
            patch.object(render, "validate_approved", side_effect=gate),
            patch.object(render, "generate_image", side_effect=self.fake_generate),
            patch.object(render, "assemble_comic", side_effect=self.fake_assemble),
            patch.object(render, "mark_rendered", return_value={**self.scenario, "status": "rendered", "render_revision": 1}),
        ):
            final, revision = render.render_one(self.scenario)
        self.assertEqual(revision, 1)
        self.assertTrue(final.exists())
        self.assertTrue((self.comics / "test-0001" / "panel_1.png").exists())
        self.assertGreaterEqual(len(gates), 3)  # initial check plus one before every provider request

    def test_failed_rerender_promotion_restores_current_artifacts(self):
        scenario = {**self.scenario, "status": "rendered", "render_revision": 1}
        current = write_png(self.comics / "test-0001.png", "blue")
        write_png(self.comics / "test-0001" / "panel_1.png", "blue")
        write_png(self.comics / "test-0001" / "panel_2.png", "blue")
        write_png(self.comics / "raw" / "test-0001.png", "blue")
        staging = self.root / ".staging" / "job-0001"

        with (
            patch.object(render, "comics_dir", return_value=self.comics),
            patch.object(render, "generate_image", side_effect=self.fake_generate),
            patch.object(render, "assemble_comic", side_effect=self.fake_assemble),
            patch.object(render, "update_in_place", return_value=None),
        ):
            with self.assertRaisesRegex(RuntimeError, "failed to update"):
                render.render_one(scenario, mode="rerender", staging_root=staging, seed_override=99)
        with Image.open(current) as image:
            self.assertEqual(image.getpixel((0, 0)), (0, 0, 255))

    def test_successful_rerender_promotes_candidate_and_increments_revision(self):
        scenario = {**self.scenario, "status": "rendered", "render_revision": 2}
        current = write_png(self.comics / "test-0001.png", "blue")
        write_png(self.comics / "test-0001" / "panel_1.png", "blue")
        write_png(self.comics / "test-0001" / "panel_2.png", "blue")
        write_png(self.comics / "raw" / "test-0001.png", "blue")
        staging = self.root / ".staging" / "job-0002"
        updated: dict = {}

        def update(_sid, _status, fields):
            updated.update(fields)
            return {**scenario, **fields}

        with (
            patch.object(render, "comics_dir", return_value=self.comics),
            patch.object(render, "generate_image", side_effect=self.fake_generate),
            patch.object(render, "assemble_comic", side_effect=self.fake_assemble),
            patch.object(render, "update_in_place", side_effect=update),
        ):
            final, revision = render.render_one(scenario, mode="rerender", staging_root=staging, seed_override=100)
        self.assertEqual(final, current)
        self.assertEqual(revision, 3)
        self.assertEqual(updated["seed"], 100)
        self.assertEqual(updated["render_revision"], 3)
        with Image.open(current) as image:
            self.assertEqual(image.getpixel((0, 0)), (255, 0, 0))


if __name__ == "__main__":
    unittest.main()
