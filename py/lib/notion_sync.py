"""Зеркало сценариев и комиксов в Notion (опционально).

Если NOTION_TOKEN не задан, модуль работает в режиме no-op.
"""
from __future__ import annotations

import json
from typing import Optional

from py.lib.config import NOTION_COMICS_DB, NOTION_SCENARIOS_DB, NOTION_TOKEN
from py.lib.logging_setup import setup

logger = setup("lib.notion_sync")


def _client():
    if not NOTION_TOKEN:
        return None
    try:
        from notion_client import Client  # type: ignore
        return Client(auth=NOTION_TOKEN)
    except ImportError:
        logger.warning("notion-client not installed; pip install notion-client")
        return None


def sync_scenario(scenario: dict) -> Optional[str]:
    """Создаёт страницу в Notion DB сценариев. Возвращает page_id или None."""
    client = _client()
    if not client or not NOTION_SCENARIOS_DB:
        logger.info("Notion sync skipped (no token or DB)")
        return None

    try:
        page = client.pages.create(
            parent={"database_id": NOTION_SCENARIOS_DB},
            properties={
                "Name": {"title": [{"text": {"content": scenario["title"]}}]},
                "Status": {"select": {"name": scenario["status"]}},
                "ID": {"rich_text": [{"text": {"content": scenario["id"]}}]},
            },
            children=[
                {
                    "object": "block",
                    "type": "code",
                    "code": {
                        "language": "json",
                        "rich_text": [{"text": {"content": json.dumps(scenario, ensure_ascii=False, indent=2)[:2000]}}],
                    },
                }
            ],
        )
        page_id = page["id"]
        logger.info(f"Notion scenario page: {page_id}")
        return page_id
    except Exception as e:
        logger.error(f"Notion sync failed: {e}")
        return None


def sync_comic(comic_path: str, scenario: dict) -> Optional[str]:
    """Создаёт страницу в Notion DB комиксов. Возвращает page_id или None."""
    client = _client()
    if not client or not NOTION_COMICS_DB:
        return None
    # TODO: upload image to Notion file block
    logger.info(f"Notion comic sync placeholder for {comic_path}")
    return None