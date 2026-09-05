"""Tests for scripts.lint_bible (mocked, без live calls)."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

# Добавляем repo root в sys.path
_REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO_ROOT))

from scripts.lint_bible import (  # noqa: E402
    CHARACTERS_DIR as REAL_CHAR_DIR,
    LORA_RE,
    REQUIRED_FIELDS,
    REQUIRED_SECTIONS,
    SEED_RE,
    _has_field_with_prefix,
    _has_section,
    _sample_prompt_content,
    main,
    validate,
)


# Полный валидный character sheet (для positive tests)
VALID_SHEET = """# Test Character

Some intro text.

## Identity

- **Name:** Test
- **Age:** 30

## Visual

Face description.

## Wardrobe

Olive coat.

## Props

Detector.

## Personality

Quiet.

## Seed: 42

// why: chosen after testing

## LoRA: test_lora_v1.ckpt

- Trigger words: test

## Sample prompt:

```
A test character, 30 years old, olive coat, holding a detector
```

## Tags

test, sample
"""


class TestHasSection(unittest.TestCase):

    def test_h2_section_found(self):
        text = "## Identity\n\nbody"
        self.assertTrue(_has_section(text, "Identity"))

    def test_h3_section_found(self):
        text = "### Identity\n\nbody"
        self.assertTrue(_has_section(text, "Identity"))

    def test_missing_section(self):
        text = "## Visual\n\nbody"
        self.assertFalse(_has_section(text, "Identity"))

    def test_case_insensitive(self):
        text = "## IDENTITY\n\nbody"
        self.assertTrue(_has_section(text, "Identity"))


class TestHasFieldWithPrefix(unittest.TestCase):

    def test_h2_field(self):
        text = "## Seed: 42\n"
        self.assertTrue(_has_field_with_prefix(text, "Seed:"))

    def test_h3_field(self):
        text = "### LoRA: foo.ckpt\n"
        self.assertTrue(_has_field_with_prefix(text, "LoRA:"))

    def test_missing_field(self):
        text = "## Other: 42\n"
        self.assertFalse(_has_field_with_prefix(text, "Seed:"))


class TestValidate(unittest.TestCase):

    def _write_sheet(self, text: str) -> Path:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".md", delete=False, encoding="utf-8"
        ) as f:
            f.write(text)
            return Path(f.name)

    def test_valid_sheet_passes(self):
        path = self._write_sheet(VALID_SHEET)
        try:
            errors = validate(path)
            self.assertEqual(errors, [], f"Expected no errors, got: {errors}")
        finally:
            path.unlink()

    def test_missing_identity(self):
        text = VALID_SHEET.replace("## Identity\n\n- **Name:** Test\n- **Age:** 30\n", "")
        path = self._write_sheet(text)
        try:
            errors = validate(path)
            self.assertTrue(any("Identity" in e for e in errors))
        finally:
            path.unlink()

    def test_missing_seed(self):
        text = VALID_SHEET.replace("## Seed: 42\n", "")
        path = self._write_sheet(text)
        try:
            errors = validate(path)
            self.assertTrue(any("Seed" in e for e in errors))
        finally:
            path.unlink()

    def test_seed_not_integer(self):
        text = VALID_SHEET.replace("## Seed: 42", "## Seed: forty-two")
        path = self._write_sheet(text)
        try:
            errors = validate(path)
            self.assertTrue(any("not a positive integer" in e for e in errors))
        finally:
            path.unlink()

    def test_lora_without_extension(self):
        text = VALID_SHEET.replace("## LoRA: test_lora_v1.ckpt", "## LoRA: test_lora_v1")
        path = self._write_sheet(text)
        try:
            errors = validate(path)
            self.assertTrue(any("no filename" in e for e in errors))
        finally:
            path.unlink()

    def test_lora_with_safetensors(self):
        """LoRA может быть .safetensors, не только .ckpt."""
        text = VALID_SHEET.replace("test_lora_v1.ckpt", "test_lora_v1.safetensors")
        path = self._write_sheet(text)
        try:
            errors = validate(path)
            self.assertEqual(errors, [], f"Safetensors should be valid: {errors}")
        finally:
            path.unlink()

    def test_empty_sample_prompt(self):
        # Удаляем ВЕСЬ контент секции Sample prompt (включая блок кода)
        text = VALID_SHEET.replace(
            "## Sample prompt:\n\n```\nA test character, 30 years old, olive coat, holding a detector\n```\n",
            "## Sample prompt:\n",
        )
        path = self._write_sheet(text)
        try:
            errors = validate(path)
            self.assertTrue(
                any("Sample prompt" in e and "empty" in e for e in errors),
                f"Expected empty-sample-prompt error, got: {errors}",
            )
        finally:
            path.unlink()

    def test_all_sections_missing(self):
        text = "# Empty character\n\nNothing here."
        path = self._write_sheet(text)
        try:
            errors = validate(path)
            # Должно быть много ошибок: все REQUIRED_SECTIONS + REQUIRED_FIELDS
            self.assertGreaterEqual(len(errors), len(REQUIRED_SECTIONS) + len(REQUIRED_FIELDS))
        finally:
            path.unlink()


class TestMain(unittest.TestCase):
    """Integration: main() walks characters/ dir."""

    def test_no_characters_dir(self):
        """Если characters/ не существует — main() возвращает 0 с warning."""
        with tempfile.TemporaryDirectory() as tmp:
            # Подменяем CHARACTERS_DIR через monkeypatch
            import scripts.lint_bible as lb
            original = lb.CHARACTERS_DIR
            lb.CHARACTERS_DIR = Path(tmp) / "nonexistent"
            try:
                result = main()
                self.assertEqual(result, 0)
            finally:
                lb.CHARACTERS_DIR = original

    def test_empty_characters_dir(self):
        with tempfile.TemporaryDirectory() as tmp:
            import scripts.lint_bible as lb
            original = lb.CHARACTERS_DIR
            lb.CHARACTERS_DIR = Path(tmp) / "empty"
            lb.CHARACTERS_DIR.mkdir()
            try:
                result = main()
                self.assertEqual(result, 0)
            finally:
                lb.CHARACTERS_DIR = original

    def test_valid_character_in_temp_dir(self):
        """Создаём валидный character sheet в temp, main() должен пройти."""
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            char_dir = tmpdir / "characters"
            char_dir.mkdir()
            (char_dir / "test-char.md").write_text(VALID_SHEET, encoding="utf-8")

            import scripts.lint_bible as lb
            original = lb.CHARACTERS_DIR
            lb.CHARACTERS_DIR = char_dir
            try:
                result = main()
                self.assertEqual(result, 0, "Valid character should pass")
            finally:
                lb.CHARACTERS_DIR = original

    def test_invalid_character_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            char_dir = tmpdir / "characters"
            char_dir.mkdir()
            (char_dir / "bad.md").write_text(
                "# Bad Character\n\nJust a title, nothing else.\n",
                encoding="utf-8",
            )

            import scripts.lint_bible as lb
            original = lb.CHARACTERS_DIR
            lb.CHARACTERS_DIR = char_dir
            try:
                result = main()
                self.assertEqual(result, 1, "Invalid character should fail")
            finally:
                lb.CHARACTERS_DIR = original

    def test_mixed_valid_and_invalid(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            char_dir = tmpdir / "characters"
            char_dir.mkdir()
            (char_dir / "good.md").write_text(VALID_SHEET, encoding="utf-8")
            (char_dir / "bad.md").write_text(
                "# Bad\n\n## Visual\n\nface\n",
                encoding="utf-8",
            )

            import scripts.lint_bible as lb
            original = lb.CHARACTERS_DIR
            lb.CHARACTERS_DIR = char_dir
            try:
                result = main()
                self.assertEqual(result, 1, "Mixed should fail (bad file)")
            finally:
                lb.CHARACTERS_DIR = original


class TestRegexes(unittest.TestCase):
    """Smoke test для основных regex'ов."""

    def test_seed_re(self):
        text = "## Seed: 42\n"
        m = SEED_RE.search(text)
        self.assertEqual(m.group(1), "42")

    def test_seed_re_h3(self):
        text = "### Seed: 7\n"
        m = SEED_RE.search(text)
        self.assertEqual(m.group(1), "7")

    def test_lora_re_ckpt(self):
        text = "## LoRA: my_lora.ckpt\n"
        self.assertTrue(LORA_RE.search(text))

    def test_lora_re_safetensors(self):
        text = "## LoRA: model.safetensors\n"
        self.assertTrue(LORA_RE.search(text))

    def test_lora_re_no_filename(self):
        text = "## LoRA: just_text\n"
        self.assertFalse(LORA_RE.search(text))

    def test_sample_prompt_re(self):
        text = "## Sample prompt:\n\n```\nA character\n```\n"
        content = _sample_prompt_content(text)
        self.assertIn("A character", content)

    def test_sample_prompt_empty(self):
        """Empty case: heading followed by another heading."""
        text = "## Sample prompt:\n## Tags\n"
        content = _sample_prompt_content(text)
        self.assertEqual(content, "")


if __name__ == "__main__":
    unittest.main()
