"""Логирование в data/logs/YYYY-MM-DD.log + stdout."""
from __future__ import annotations

import logging
import sys
from datetime import date
from pathlib import Path

from .config import project_root


def setup(name: str = "comic-studio") -> logging.Logger:
    log_dir = project_root() / "data" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / f"{date.today().isoformat()}.log"

    logger = logging.getLogger(name)
    if logger.handlers:
        return logger  # уже сконфигурирован

    logger.setLevel(logging.INFO)

    fmt = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    fh = logging.FileHandler(log_file, encoding="utf-8")
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    logger.addHandler(sh)

    return logger