"""Загрузка конфигурации из .env и переменных окружения."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

try:
    # pyrefly: ignore [missing-import]
    from dotenv import load_dotenv
    # Ищем .env начиная с корня проекта и выше
    project_root = Path(__file__).resolve().parents[2]
    load_dotenv(project_root / ".env")
except ImportError:
    pass


def get(key: str, default: Optional[str] = None, required: bool = False) -> Optional[str]:
    """Получить переменную окружения.

    required=True бросает исключение, если значение отсутствует.
    """
    value = os.environ.get(key, default)
    if required and not value:
        raise RuntimeError(
            f"Required env var {key!r} is not set. "
            f"Add it to .env at project root or export it."
        )
    return value


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def data_dir() -> Path:
    p = project_root() / "data"
    p.mkdir(exist_ok=True)
    return p


def scenarios_dir(status: str = "draft") -> Path:
    p = data_dir() / "scenarios" / status
    p.mkdir(parents=True, exist_ok=True)
    return p


def comics_dir() -> Path:
    p = data_dir() / "comics"
    p.mkdir(exist_ok=True)
    return p


def archive_dir(date: Optional[str] = None) -> Path:
    from datetime import date as _date
    if not date:
        date = _date.today().isoformat()
    p = data_dir() / "archive" / date
    p.mkdir(parents=True, exist_ok=True)
    return p


# Удобные константы
MINIMAX_API_KEY = get("MINIMAX_API_KEY")
MINIMAX_BASE_URL = get("MINIMAX_BASE_URL", "https://api.minimax.io")
TELEGRAM_BOT_TOKEN = get("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = get("TELEGRAM_CHAT_ID", "1045621572")
NOTION_TOKEN = get("NOTION_TOKEN")
NOTION_SCENARIOS_DB = get("NOTION_SCENARIOS_DB")
NOTION_COMICS_DB = get("NOTION_COMICS_DB")