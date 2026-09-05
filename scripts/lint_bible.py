#!/usr/bin/env python3
"""Bible lint: validates bible/characters/*.md against schema.

Required fields in each character sheet (case-insensitive prefix match):
  - Identity
  - Visual
  - Wardrobe
  - Props
  - Personality
  - Seed: <integer>
  - LoRA: <filename>
  - Sample prompt:

Template file `_TEMPLATE_character.md` is excluded.

Usage:
    python scripts/lint_bible.py
    # exit 0 on success, exit 1 on errors

См. `bible/README.md` для workflow и `bible/_TEMPLATE_character.md` для шаблона.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
BIBLE_DIR = _REPO_ROOT / "bible"
CHARACTERS_DIR = BIBLE_DIR / "characters"
TEMPLATE_FILE = BIBLE_DIR / "_TEMPLATE_character.md"

# Required sections, matched as H2 (## Field) or H3 (### Field) case-insensitive
REQUIRED_SECTIONS = [
    "Identity",
    "Visual",
    "Wardrobe",
    "Props",
    "Personality",
]

# Required fields with `prefix: value` syntax (also H2/H3)
REQUIRED_FIELDS = [
    "Seed:",
    "LoRA:",
    "Sample prompt:",
]

# LoRA field must point to a file (anything with extension is fine, we don't
# check existence — LoRA may be on another machine)
LORA_RE = re.compile(r"^#{2,3}\s*LoRA:\s*\S+\.\S+", re.MULTILINE | re.IGNORECASE)
# Seed field must be an integer
SEED_RE = re.compile(r"^#{2,3}\s*Seed:\s*(\d+)", re.MULTILINE | re.IGNORECASE)
# Sample prompt: используем line-based scan, не regex, потому что
# empty-content case (e.g. "## Sample prompt:\n## Tags\n") сложно
# выразить одним regex без жадных проблем.
SAMPLE_PROMPT_RE = None  # см. _sample_prompt_content


def _sample_prompt_content(text: str) -> str:
    """Возвращает ВСЕ содержимое между `## Sample prompt:` и следующим heading
    (или концом файла). Если сразу идёт следующий heading — возвращает ''.
    """
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if re.match(r"^#{2,3}\s*Sample prompt:", line, re.IGNORECASE):
            content_lines = []
            for j in range(i + 1, len(lines)):
                if re.match(r"^#{2,3}\s+", lines[j]):
                    break
                content_lines.append(lines[j])
            return "\n".join(content_lines)
    return ""


def _has_section(text: str, name: str) -> bool:
    """Returns True если `## Name` или `### Name` присутствует."""
    pat = re.compile(rf"^#{{2,3}}\s*{re.escape(name)}\b", re.MULTILINE | re.IGNORECASE)
    return bool(pat.search(text))


def _has_field_with_prefix(text: str, prefix: str) -> bool:
    """Returns True если есть строка `## prefix` или `### prefix` (после `:`)."""
    pat = re.compile(
        rf"^#{{2,3}}\s*{re.escape(prefix)}",
        re.MULTILINE | re.IGNORECASE,
    )
    return bool(pat.search(text))


def validate(path: Path) -> list[str]:
    """Returns list of errors (empty если OK)."""
    errors = []
    text = path.read_text(encoding="utf-8")

    for section in REQUIRED_SECTIONS:
        if not _has_section(text, section):
            errors.append(f"Missing required section: ## {section}")

    for field in REQUIRED_FIELDS:
        if not _has_field_with_prefix(text, field):
            errors.append(f"Missing required field: ## {field}")

    # Detailed checks
    seed_match = SEED_RE.search(text)
    if not seed_match:
        if _has_field_with_prefix(text, "Seed:"):
            errors.append("Seed field present but not a positive integer")
    else:
        seed = int(seed_match.group(1))
        if not (0 <= seed <= 2**31 - 1):
            errors.append(f"Seed out of range: {seed} (use 0..2^31-1)")

    if _has_field_with_prefix(text, "LoRA:") and not LORA_RE.search(text):
        errors.append("LoRA field present but no filename (need something.ckpt/.safetensors)")

    if _has_field_with_prefix(text, "Sample prompt:"):
        if not _sample_prompt_content(text).strip():
            errors.append("Sample prompt field present but empty")

    return errors


def main() -> int:
    if not CHARACTERS_DIR.exists():
        print("⚠️ No bible/characters/ directory yet. Create one and add a character sheet.")
        return 0

    character_files = sorted(CHARACTERS_DIR.glob("*.md"))
    if not character_files:
        print("⚠️ bible/characters/ exists but is empty. Add a character sheet.")
        return 0

    all_errors: dict[str, list[str]] = {}
    for path in character_files:
        errors = validate(path)
        if errors:
            all_errors[path.name] = errors

    if all_errors:
        print("❌ Bible lint failed:\n")
        for name, errs in all_errors.items():
            print(f"  {name}:")
            for e in errs:
                print(f"    - {e}")
        return 1

    print(f"✅ Bible OK: {len(character_files)} character(s)")
    for path in character_files:
        # Print display name (first H1) and seed for sanity
        text = path.read_text(encoding="utf-8")
        h1 = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
        seed = SEED_RE.search(text)
        lora = LORA_RE.search(text)
        display = h1.group(1).strip() if h1 else path.stem
        seed_str = f"seed={seed.group(1)}" if seed else "seed=?"
        lora_str = "lora=ok" if lora else "lora=?"
        print(f"  • {path.stem:30} {display[:40]:40} {seed_str:12} {lora_str}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
