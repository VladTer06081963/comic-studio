"""Свободный текст от пользователя."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Optional

from py.lib.config import data_dir
from py.lib.logging_setup import setup

logger = setup("ingest.freeform")


def save_freeform(text: str, title: Optional[str] = None) -> str:
    """Сохраняет свободный текст как Markdown-файл. Возвращает ID."""
    if not text or not text.strip():
        raise ValueError("Freeform text cannot be empty")
    """Сохраняет свободный текст как Markdown-файл. Возвращает ID."""
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    safe_title = (title or "freeform").replace("/", "_").replace(" ", "_")[:50]
    filename = f"{ts}-{safe_title}.md"
    out_path = data_dir() / "freeform" / filename
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(text, encoding="utf-8")
    logger.info(f"Saved freeform → {out_path}")
    return out_path.stem


if __name__ == "__main__":
    import sys
    text = sys.stdin.read() if not sys.argv[1:] else " ".join(sys.argv[1:])
    print(save_freeform(text))