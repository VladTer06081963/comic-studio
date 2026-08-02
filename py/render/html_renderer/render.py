"""Entry point: `render_html(layout, output_path)`.

Рендерит HTML-страницу комикса из layout-манифеста через jinja2-шаблон
`comic.html.j2` с inline-CSS из `static/comic.css`. Копирует шрифты
`static/fonts/*.woff2` в `<output_dir>/fonts/` для автономности HTML.

Spec: `python-comic-rendering` → Requirement: HTML rendering.
"""
from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any, Mapping, Sequence

import jinja2

from py.lib.logging_setup import setup

from .layout import validate_layout

logger = setup("render.html_renderer.render")

# Пути к ресурсам пакета (вычисляются от __file__, не зависят от cwd)
PACKAGE_DIR = Path(__file__).resolve().parent
TEMPLATE_PATH = PACKAGE_DIR / "templates" / "comic.html.j2"
STATIC_DIR = PACKAGE_DIR / "static"
CSS_PATH = STATIC_DIR / "comic.css"
FONTS_DIR = STATIC_DIR / "fonts"

_JINJA_ENV = jinja2.Environment(
    loader=jinja2.FileSystemLoader(str(TEMPLATE_PATH.parent)),
    # Включаем autoescape глобально — защита от XSS через любые поля манифеста
    # (captions/titles/ids авто-эскейпятся, см. Requirement: Jinja2 template → Scenario: Template renders safe HTML).
    autoescape=True,
    keep_trailing_newline=True,
    trim_blocks=False,
    lstrip_blocks=False,
)


def _load_css() -> str:
    if not CSS_PATH.exists():
        raise FileNotFoundError(f"comic.css not found at {CSS_PATH}")
    return CSS_PATH.read_text(encoding="utf-8")


def _copy_fonts(target_dir: Path) -> list[Path]:
    """Копирует woff2-шрифты из `static/fonts/` в `<target_dir>/fonts/`.

    Returns:
        список скопированных файлов.

    Raises:
        FileNotFoundError: если исходная директория шрифтов не найдена.
    """
    if not FONTS_DIR.exists():
        raise FileNotFoundError(f"fonts directory not found at {FONTS_DIR}")
    target_fonts = target_dir / "fonts"
    target_fonts.mkdir(parents=True, exist_ok=True)
    copied: list[Path] = []
    for font_file in sorted(FONTS_DIR.glob("*.woff2")):
        dest = target_fonts / font_file.name
        shutil.copyfile(font_file, dest)
        copied.append(dest)
    return copied


def render_html(
    layout: Mapping[str, Any],
    output_path: str | Path,
    *,
    css_text: str | None = None,
    copy_fonts: bool = True,
) -> Path:
    """Рендерит HTML-страницу из layout-манифеста.

    Args:
        layout: валидный layout-манифест (id, layout, panels, fonts...).
            Должен проходить `validate_layout()`.
        output_path: путь к выходному HTML-файлу (например, `data/comics/<id>.html`).
        css_text: опциональный override для inline-CSS (по умолчанию — содержимое
            `py/render/html_renderer/static/comic.css`).
        copy_fonts: копировать ли woff2 шрифты рядом с HTML (default True).

    Returns:
        Path к записанному HTML-файлу.

    Raises:
        ValueError: если layout не проходит `validate_layout()`.
        FileNotFoundError: если шаблон или статика не найдены.
    """
    validate_layout(layout)  # raises ValueError on bad shape

    out_path = Path(output_path).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    css = css_text if css_text is not None else _load_css()

    # Готовим контекст для шаблона: обязательные поля плюс опциональные.
    template = _JINJA_ENV.get_template(TEMPLATE_PATH.name)
    panels: Sequence[Mapping[str, Any]] = layout.get("panels", [])

    context = {
        "title": layout.get("title") or "Без названия",
        "comic_id": layout.get("id", ""),
        "layout": layout.get("layout", "comic"),
        "tone": layout.get("tone"),
        "image_style": layout.get("image_style"),
        "css": css,
        "panels": panels,
    }

    html = template.render(**context)
    out_path.write_text(html, encoding="utf-8")

    fonts_copied: list[Path] = []
    if copy_fonts:
        fonts_copied = _copy_fonts(out_path.parent)

    logger.info(
        f"Rendered HTML → {out_path} ({len(html)} bytes, {len(panels)} panels, "
        f"layout={context['layout']}, fonts={len(fonts_copied)})"
    )
    return out_path