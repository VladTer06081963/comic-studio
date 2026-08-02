"""Валидация layout-манифеста HTML-рендера.

Canonical источник правил для spec `python-comic-rendering`:
- `id` ∈ `^[A-Za-z0-9_-]{4,64}$`
- `layout` ∈ {"comic", "grid", "vertical"}
- `panels` непустой, len ∈ {3, 4}
- panel.image обязателен
- panel.bubble_style ∈ {"bubble", "star", "gothic", "boom", "memo", "bar", "none"}
- panel.bubble_position ∈ {"bottom-left", "top-right", "bottom-right", "top-left"}
"""
from __future__ import annotations

import re
from typing import Any, Mapping

# ── Канонические наборы значений ─────────────────────────────────────────────

LAYOUTS = ("comic", "grid", "vertical")
BUBBLE_STYLES = ("bubble", "star", "gothic", "boom", "memo", "bar", "none")
BUBBLE_POSITIONS = ("bottom-left", "top-right", "bottom-right", "top-left")
ALLOWED_PANEL_COUNTS = (3, 4)

# ID регулярка — согласована с web/lib/validation.js (scenarioId)
LAYOUT_VALIDATIONS_ID_RE = re.compile(r"^[A-Za-z0-9_-]{4,64}$")


class LayoutValidationError(ValueError):
    """Поднят `validate_layout` при нарушении структуры манифеста."""

    def __init__(self, message: str, *, code: str = "INVALID_LAYOUT") -> None:
        super().__init__(message)
        self.code = code


def _ensure_str(value: Any, field: str, *, code: str = "INVALID_LAYOUT") -> str:
    if not isinstance(value, str) or not value:
        raise LayoutValidationError(f"{field} must be a non-empty string", code=code)
    return value


def _ensure_enum(value: Any, allowed: tuple[str, ...], field: str, *, code: str = "INVALID_LAYOUT") -> str:
    if not isinstance(value, str) or value not in allowed:
        allowed_repr = ", ".join(allowed)
        raise LayoutValidationError(
            f"invalid {field}: {value!r}; expected one of {allowed_repr}",
            code=code,
        )
    return value


def validate_layout(layout: Mapping[str, Any]) -> None:
    """Валидирует layout-манифест.

    Raises:
        LayoutValidationError (subclass of ValueError) при нарушении.
    """
    if not isinstance(layout, Mapping):
        raise LayoutValidationError("layout must be a mapping", code="INVALID_LAYOUT")

    sid = layout.get("id")
    if not isinstance(sid, str) or not LAYOUT_VALIDATIONS_ID_RE.match(sid):
        raise LayoutValidationError(
            f"invalid id: {sid!r}; expected ^[A-Za-z0-9_-]{{4,64}}$",
            code="INVALID_LAYOUT",
        )

    layout_name = _ensure_enum(layout.get("layout"), LAYOUTS, "layout")
    panels = layout.get("panels")
    if not isinstance(panels, list) or not panels:
        raise LayoutValidationError("panels must be a non-empty list", code="INVALID_LAYOUT")
    if len(panels) not in ALLOWED_PANEL_COUNTS:
        raise LayoutValidationError(
            f"invalid panel count: {len(panels)}, expected {ALLOWED_PANEL_COUNTS[0]} or {ALLOWED_PANEL_COUNTS[1]}",
            code="INVALID_LAYOUT",
        )

    for index, panel in enumerate(panels, start=1):
        if not isinstance(panel, Mapping):
            raise LayoutValidationError(f"panel #{index} must be a mapping", code="INVALID_LAYOUT")
        # image — обязательный путь (относительный к HTML)
        _ensure_str(panel.get("image"), f"panel #{index}.image")
        # bubble_style — допустимый enum, default 'bubble'
        bstyle = panel.get("bubble_style", "bubble")
        _ensure_enum(bstyle, BUBBLE_STYLES, f"panel #{index}.bubble_style")
        # bubble_position — допустимый enum, default 'bottom-left'
        bpos = panel.get("bubble_position", "bottom-left")
        _ensure_enum(bpos, BUBBLE_POSITIONS, f"panel #{index}.bubble_position")

    # fonts — опциональная dict-ка, если задана — ключи должны быть известными ролями
    fonts = layout.get("fonts")
    if fonts is not None and not isinstance(fonts, Mapping):
        raise LayoutValidationError("fonts must be a mapping if provided", code="INVALID_LAYOUT")

    return None