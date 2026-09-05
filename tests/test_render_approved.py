from __future__ import annotations

import tempfile
import unittest
from contextlib import ExitStack
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

    def _patch_providers(self):
        """Patch both image providers (minimax + drawthings) for any-mode coverage."""
        return [
            patch.object(render, "minimax_generate_image", side_effect=self.fake_generate),
            patch.object(render, "drawthings_generate_image", side_effect=self.fake_generate),
        ]

    def _patch_assembly(self):
        """Patch page assembly + html rendering — no live provider calls or templates.

        render_reader просто возвращает output_path без записи — caller
        (тест) обычно уже подготовил файл в staging. Для тестов, где
        нужно, чтобы render_reader записал файл, переопредели мок явно.
        """
        pages_result = {
            "pages": [
                {"n": 0, "type": "cover", "img": "pages/00-cover.jpg", "audio": None,
                 "title": "", "caption": "", "dialogue": []},
            ],
            "cover_path": "pages/00-cover.jpg",
            "output_dir": str(self.comics / "test-0001"),
        }

        def fake_render_reader(*, output_path, **_kwargs):
            return Path(output_path)

        return [
            patch.object(render, "assemble_pages", return_value=pages_result),
            patch.object(render, "render_reader", side_effect=fake_render_reader),
            patch.object(render, "synthesize_panel_dialogue", return_value=[]),
        ]

    def test_unapproved_initial_render_makes_zero_provider_calls(self):
        calls: list[str] = []

        def provider(**kwargs):
            calls.append(kwargs["prompt"])
            return self.fake_generate(**kwargs)

        with ExitStack() as es:
            es.enter_context(patch.object(render, "comics_dir", return_value=self.comics))
            es.enter_context(patch.object(render, "validate_approved", return_value=None))
            es.enter_context(patch.object(render, "minimax_generate_image", side_effect=provider))
            es.enter_context(patch.object(render, "drawthings_generate_image", side_effect=provider))
            with self.assertRaisesRegex(RuntimeError, "persisted approval"):
                render.render_one(self.scenario)
        self.assertEqual(calls, [])

    def test_initial_render_checks_gate_and_commits_artifacts(self):
        gates: list[str] = []

        def gate(scenario_id):
            gates.append(scenario_id)
            return self.scenario

        with ExitStack() as es:
            es.enter_context(patch.object(render, "comics_dir", return_value=self.comics))
            es.enter_context(patch.object(render, "validate_approved", side_effect=gate))
            for cm in self._patch_providers():
                es.enter_context(cm)
            es.enter_context(patch.object(render, "assemble_comic", side_effect=self.fake_assemble))
            for cm in self._patch_assembly():
                es.enter_context(cm)
            es.enter_context(patch.object(
                render, "mark_rendered",
                return_value={**self.scenario, "status": "rendered", "render_revision": 1},
            ))
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

        with ExitStack() as es:
            es.enter_context(patch.object(render, "comics_dir", return_value=self.comics))
            for cm in self._patch_providers():
                es.enter_context(cm)
            es.enter_context(patch.object(render, "assemble_comic", side_effect=self.fake_assemble))
            for cm in self._patch_assembly():
                es.enter_context(cm)
            es.enter_context(patch.object(render, "update_in_place", return_value=None))
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

        with ExitStack() as es:
            es.enter_context(patch.object(render, "comics_dir", return_value=self.comics))
            for cm in self._patch_providers():
                es.enter_context(cm)
            es.enter_context(patch.object(render, "assemble_comic", side_effect=self.fake_assemble))
            for cm in self._patch_assembly():
                es.enter_context(cm)
            es.enter_context(patch.object(render, "update_in_place", side_effect=update))
            final, revision = render.render_one(scenario, mode="rerender", staging_root=staging, seed_override=100)
        self.assertEqual(final, current)
        self.assertEqual(revision, 3)
        self.assertEqual(updated["seed"], 100)
        self.assertEqual(updated["render_revision"], 3)
        with Image.open(current) as image:
            self.assertEqual(image.getpixel((0, 0)), (255, 0, 0))

    def test_rerender_promotes_html_and_pages_from_staging(self):
        """Rerender должен промоутить HTML и pages/pages.json из staging в canonical.

        Regression: до фикса HTML генерировался только в staging, pages/
        перезаписывали canonical до backup → терялись при promote.

        render_one делает rmtree(staging_root) перед каждым rerender,
        поэтому pre-seeded staging файлы не подходят. Используем мок
        render_pages+render_reader, чтобы они сами записали нужные файлы.
        """
        scenario = {**self.scenario, "status": "rendered", "render_revision": 1}
        (self.comics / "test-0001").mkdir(parents=True, exist_ok=True)
        write_png(self.comics / "test-0001.png", "blue")
        write_png(self.comics / "test-0001" / "panel_1.png", "blue")
        write_png(self.comics / "test-0001" / "panel_2.png", "blue")
        write_png(self.comics / "raw" / "test-0001.png", "blue")
        # Старый canonical HTML (pre-rerender)
        (self.comics / "test-0001.html").write_text("<html>OLD</html>", encoding="utf-8")
        # Старый canonical pages/ (pre-rerender) — должен быть заменён
        (self.comics / "test-0001" / "pages.json").write_text('{"pages":[]}', encoding="utf-8")
        (self.comics / "test-0001" / "pages" / "00-cover.jpg").parent.mkdir(parents=True, exist_ok=True)
        (self.comics / "test-0001" / "pages" / "00-cover.jpg").write_bytes(b"OLD_COVER")

        staging = self.root / ".staging" / "job-html"

        # Кастомные моки: assemble_pages пишет pages.json + 01-page.jpg в output_dir,
        # render_reader пишет HTML в output_path.
        def custom_assemble_pages(*, output_dir, **_kwargs):
            output_dir = Path(output_dir)
            (output_dir / "pages.json").write_text('{"pages":["new"]}', encoding="utf-8")
            (output_dir / "pages").mkdir(parents=True, exist_ok=True)
            (output_dir / "pages" / "01-page.jpg").write_bytes(b"NEW_PAGE")
            return {
                "pages": [{"n": 0, "type": "cover", "img": "pages/00-cover.jpg", "audio": None}],
                "cover_path": "pages/00-cover.jpg",
                "output_dir": str(output_dir),
            }

        def custom_render_reader(*, output_path, **_kwargs):
            output_path = Path(output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text("<html>NEW</html>", encoding="utf-8")
            return output_path

        def update(_sid, _status, fields):
            return {**scenario, **fields}

        with ExitStack() as es:
            es.enter_context(patch.object(render, "comics_dir", return_value=self.comics))
            for cm in self._patch_providers():
                es.enter_context(cm)
            es.enter_context(patch.object(render, "assemble_comic", side_effect=self.fake_assemble))
            es.enter_context(patch.object(render, "assemble_pages", side_effect=custom_assemble_pages))
            es.enter_context(patch.object(render, "render_reader", side_effect=custom_render_reader))
            es.enter_context(patch.object(render, "synthesize_panel_dialogue", return_value=[]))
            es.enter_context(patch.object(render, "update_in_place", side_effect=update))
            render.render_one(scenario, mode="rerender", staging_root=staging, seed_override=42)

        # Canonical HTML должен быть новым (из staging)
        self.assertEqual(
            (self.comics / "test-0001.html").read_text(encoding="utf-8"),
            "<html>NEW</html>",
        )
        # Canonical pages/pages.json должен быть новым
        self.assertEqual(
            (self.comics / "test-0001" / "pages.json").read_text(encoding="utf-8"),
            '{"pages":["new"]}',
        )
        # Canonical pages/01-page.jpg — новый (а не OLD_COVER)
        self.assertEqual(
            (self.comics / "test-0001" / "pages" / "01-page.jpg").read_bytes(),
            b"NEW_PAGE",
        )
        # Старый 00-cover.jpg из canonical перезаписан кастомным assemble_pages
        # (он не пишет cover, но 00-cover.jpg из staging/candidate тоже не пишется,
        # потому что assemble_pages — единственный writer, и он пишет только 01-page.jpg)
        self.assertFalse((self.comics / "test-0001" / "pages" / "00-cover.jpg").exists())

    def test_failed_rerender_rollback_restores_old_html(self):
        """При провале rerender (например, update_in_place) старый HTML должен быть восстановлен."""
        scenario = {**self.scenario, "status": "rendered", "render_revision": 1}
        (self.comics / "test-0001").mkdir(parents=True, exist_ok=True)
        write_png(self.comics / "test-0001.png", "blue")
        write_png(self.comics / "test-0001" / "panel_1.png", "blue")
        write_png(self.comics / "test-0001" / "panel_2.png", "blue")
        (self.comics / "test-0001.html").write_text("<html>OLD</html>", encoding="utf-8")
        # Pre-rerender pages/ в canonical
        (self.comics / "test-0001" / "pages" / "00-cover.jpg").parent.mkdir(parents=True, exist_ok=True)
        (self.comics / "test-0001" / "pages" / "00-cover.jpg").write_bytes(b"OLD_COVER")

        staging = self.root / ".staging" / "job-fail"

        def custom_render_reader(*, output_path, **_kwargs):
            output_path = Path(output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text("<html>NEW</html>", encoding="utf-8")
            return output_path

        with ExitStack() as es:
            es.enter_context(patch.object(render, "comics_dir", return_value=self.comics))
            for cm in self._patch_providers():
                es.enter_context(cm)
            es.enter_context(patch.object(render, "assemble_comic", side_effect=self.fake_assemble))
            for cm in self._patch_assembly():
                es.enter_context(cm)
            es.enter_context(patch.object(render, "render_reader", side_effect=custom_render_reader))
            es.enter_context(patch.object(render, "update_in_place", return_value=None))  # forces "failed to update"
            with self.assertRaisesRegex(RuntimeError, "failed to update"):
                render.render_one(scenario, mode="rerender", staging_root=staging, seed_override=42)

        # Старый HTML восстановлен
        self.assertEqual(
            (self.comics / "test-0001.html").read_text(encoding="utf-8"),
            "<html>OLD</html>",
        )
        # Старый pages/00-cover.jpg восстановлен
        self.assertEqual(
            (self.comics / "test-0001" / "pages" / "00-cover.jpg").read_bytes(),
            b"OLD_COVER",
        )


if __name__ == "__main__":
    unittest.main()
