"""Парсинг веб-страниц: блоги, статьи, документация."""
from __future__ import annotations

import re
import urllib.error
from typing import Optional
from urllib.parse import urlparse
from urllib.request import Request

import requests
# pyrefly: ignore [missing-import]
from bs4 import BeautifulSoup

from py.lib.logging_setup import setup
from py.lib.retry import with_retry

logger = setup("ingest.url")

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

_CONNECT_TIMEOUT = 15
_READ_TIMEOUT = 30
_MAX_RETRIES = 3


def fetch_url(url: str, max_chars: int = 50_000) -> str:
    """Загружает URL, извлекает основной текст.

    Возвращает очищенный текст (≤ max_chars). Применяет bounded retry
    для transient-ошибок. Бросает RuntimeError при исчерпании попыток
    или при некорректном URL.
    """
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError(f"Invalid URL: {url!r}")

    logger.info(f"Fetching {url}")

    def _fetch() -> str:
        resp = requests.get(
            url,
            headers={"User-Agent": USER_AGENT},
            timeout=(_CONNECT_TIMEOUT, _READ_TIMEOUT),
        )
        resp.raise_for_status()
        return resp.text

    raw_html = with_retry(
        _fetch,
        max_attempts=_MAX_RETRIES,
        timeout=_READ_TIMEOUT,
        description=f"fetch {url}",
    )

    soup = BeautifulSoup(raw_html, "html.parser")

    # Удаляем шум
    for tag in soup(["script", "style", "nav", "header", "footer", "aside", "noscript"]):
        tag.decompose()

    # Берём <main> или <article> если есть, иначе body
    main: Optional[BeautifulSoup] = soup.find("main") or soup.find("article")
    root = main or soup.body or soup

    text = root.get_text(separator="\n", strip=True)

    # Сжимаем множественные пустые строки
    text = re.sub(r"\n{3,}", "\n\n", text)

    if len(text) > max_chars:
        text = text[:max_chars] + "\n\n[…truncated]"

    logger.info(f"Extracted {len(text)} chars from {url}")
    return text


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python -m py.ingest.url <URL>")
        sys.exit(1)
    print(fetch_url(sys.argv[1]))
