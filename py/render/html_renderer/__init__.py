"""HTML renderer для комиксов Comic Studio.

Генерирует автономные HTML-страницы из layout-манифеста:
- Inline-CSS в `<style>` блоке (без external stylesheet)
- Относительные пути для `<img>` и шрифтов (HTML можно расшарить папкой)
- Локальные woff2 шрифты (без CDN)
- CSS-анимация bubble-pop (OQ-1)
- Безопасный авто-эскейп captions/titles/ids (XSS protection)

Pillow-путь (`_comic_lib.assemble_grid`) остаётся для PNG-preview и
backward-compat с Telegram, Notion, archive и social адаптерами.
"""

__version__ = "0.1.0"

from .layout import (
    LAYOUT_VALIDATIONS_ID_RE,
    LAYOUTS,
    BUBBLE_STYLES,
    BUBBLE_POSITIONS,
    validate_layout,
)
from .manifest import build_layout
from .render import render_html

__all__ = [
    "__version__",
    "LAYOUT_VALIDATIONS_ID_RE",
    "LAYOUTS",
    "BUBBLE_STYLES",
    "BUBBLE_POSITIONS",
    "validate_layout",
    "build_layout",
    "render_html",
]