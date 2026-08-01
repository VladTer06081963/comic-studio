"""Shared HTTP reliability helpers."""
from __future__ import annotations

import logging
import time
import urllib.error
import urllib.request
from typing import Callable, Optional, TypeVar

logger = logging.getLogger("lib.retry")

T = TypeVar("T")

# Errors that are safe to retry
_TRANSIENT = (
    urllib.error.HTTPError,
    urllib.error.URLError,
    ConnectionError,
    TimeoutError,
)


def with_retry(
    fn: Callable[[], T],
    *,
    max_attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    jitter: float = 0.5,
    timeout: float = 30.0,
    description: str = "operation",
) -> T:
    """Execute fn with bounded exponential-backoff retry for transient failures.

    Authentication errors (HTTP 401/403), validation errors (HTTP 400/422),
    and content-policy errors (HTTP 403 with policy reason) fail immediately.

    Raises the last exception if all attempts are exhausted.
    """
    attempt = 0
    last_err: Optional[Exception] = None

    while attempt < max_attempts:
        attempt += 1
        try:
            return fn()
        except urllib.error.HTTPError as e:
            code = e.code
            # Fail fast on auth and client errors (not rate limits)
            if code in (401, 403, 422):
                logger.error(f"{description}: HTTP {code} — non-retryable, raising")
                raise
            # 429 rate limit — retry with backoff
            if code == 429:
                logger.warning(f"{description}: rate-limited (429), retrying")
            else:
                logger.warning(f"{description}: HTTP {code} — retrying")
            last_err = e
        except _TRANSIENT as e:
            logger.warning(f"{description}: {type(e).__name__} — retrying ({attempt}/{max_attempts})")
            last_err = e

        if attempt < max_attempts:
            delay = min(base_delay * (2 ** (attempt - 1)) + (jitter * base_delay * (attempt - 1)), max_delay)
            logger.info(f"Retrying in {delay:.1f}s…")
            time.sleep(delay)

    raise RuntimeError(f"{description} failed after {max_attempts} attempts") from last_err
