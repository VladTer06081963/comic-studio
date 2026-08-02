"""Shared layout, drawing, and assembly for all comic scripts."""
import math
from pathlib import Path
# pyrefly: ignore [missing-import]
from PIL import Image, ImageDraw, ImageFont

BORDER = 14
BG_COLOR = (10, 10, 10)

# Comic layout templates: list of (col_weight_list, row_height_weight)
# Total panels per template = sum of len(col_weights) across rows
_LAYOUTS = {
    3: [
        ([1.0],        1.6),
        ([0.55, 0.45], 1.0),
    ],
    4: [
        ([0.62, 0.38], 1.0),
        ([0.35, 0.65], 1.0),
    ],
    5: [
        ([1.0],        1.3),
        ([0.55, 0.45], 1.0),
        ([0.40, 0.60], 1.0),
    ],
    6: [
        ([1.0],        1.5),
        ([0.58, 0.42], 1.0),
        ([0.37, 0.63], 1.0),
        ([1.0],        0.6),
    ],
}

# Default bubble positions cycle, varied per panel index
_POSITIONS = ["bottom-left", "top-right", "bottom-right", "top-left"]


# ── Font ─────────────────────────────────────────────────────────────────────

def find_font(size: int) -> ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Impact.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    for p in candidates:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def _text_size(font, text: str):
    try:
        bbox = font.getbbox(text)
        return bbox[2] - bbox[0], bbox[3] - bbox[1]
    except AttributeError:
        return len(text) * 6, 11


def _measure_multiline(font, lines: list[str]):
    sizes = [_text_size(font, l) for l in lines]
    tw = max(w for w, _ in sizes)
    th = sum(h for _, h in sizes) + 5 * (len(sizes) - 1)
    return tw, th, sizes


def _wrap(text: str, max_chars: int = 14) -> list[str]:
    words = text.split()
    lines, line = [], []
    for w in words:
        if line and sum(len(x) for x in line) + len(line) + len(w) > max_chars:
            lines.append(" ".join(line))
            line = [w]
        else:
            line.append(w)
    if line:
        lines.append(" ".join(line))
    return lines or [text]


# ── Image fitting ─────────────────────────────────────────────────────────────

def fit_image(img: Image.Image, w: int, h: int) -> Image.Image:
    """Center-crop + resize image to exactly (w, h)."""
    sw, sh = img.size
    scale = max(w / sw, h / sh)
    nw, nh = max(1, int(sw * scale)), max(1, int(sh * scale))
    img = img.resize((nw, nh), Image.LANCZOS)
    left = (nw - w) // 2
    top  = (nh - h) // 2
    return img.crop((left, top, left + w, top + h))


# ── Caption overlays ──────────────────────────────────────────────────────────

def _starburst_pts(cx, cy, r_out, r_in, n):
    pts = []
    for i in range(n * 2):
        a = math.pi * i / n - math.pi / 2
        r = r_out if i % 2 == 0 else r_in
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def draw_caption_overlay(img: Image.Image, text: str, style: str, pos: str) -> Image.Image:
    """Draw a caption overlay on top of a panel image.

    Supported styles:
        bubble  — white speech bubble with a tail
        star    — gold starburst (comic POW!)
        bar     — full-width gold bar (handled in assemble_grid, not here)
        gothic  — black gothic gothic-banner with gold trim and serif text
        boom    — red/orange explosion burst with yellow text (impact)
        memo    — yellow Post-It note with a folded corner
        none    — no caption
    """
    if not text.strip() or style == "none":
        return img

    result = img.copy().convert("RGB")
    draw  = ImageDraw.Draw(result)
    W, H  = result.size
    font  = find_font(40)

    lines = _wrap(text, max_chars=10)
    tw, th, sizes = _measure_multiline(font, lines)

    pad    = 28
    tail_h = 40
    bw     = tw + pad * 2
    bh     = th + pad * 2
    margin = 28

    # Bubble center
    if "left" in pos:
        cx = margin + bw // 2
    else:
        cx = W - margin - bw // 2
    if "top" in pos:
        cy = margin + bh // 2
    else:
        cy = H - margin - bh // 2

    bx, by = cx - bw // 2, cy - bh // 2

    if style == "bubble":
        rad = min(bh // 2, 44)
        draw.rounded_rectangle(
            [bx, by, bx + bw, by + bh],
            radius=rad, fill="white", outline="black", width=4,
        )
        # Tail pointing toward the action (inward)
        if "bottom" in pos:
            draw.polygon([(cx-10, by+bh-1), (cx+10, by+bh-1), (cx, by+bh+tail_h)], fill="white")
            draw.line([(cx-10, by+bh), (cx, by+bh+tail_h)], fill="black", width=3)
            draw.line([(cx+10, by+bh), (cx, by+bh+tail_h)], fill="black", width=3)
        else:
            draw.polygon([(cx-10, by+1), (cx+10, by+1), (cx, by-tail_h)], fill="white")
            draw.line([(cx-10, by), (cx, by-tail_h)], fill="black", width=3)
            draw.line([(cx+10, by), (cx, by-tail_h)], fill="black", width=3)
        # Text lines
        ty = by + pad
        for line, (lw, lh) in zip(lines, sizes):
            draw.text((bx + pad + (tw - lw) // 2, ty), line, fill="black", font=font)
            ty += lh + 5

    elif style == "star":
        r_out = max(bw, bh) // 2 + 38
        r_in  = int(r_out * 0.44)
        pts   = _starburst_pts(cx, cy, r_out, r_in, 12)
        draw.polygon(pts, fill=(255, 220, 0), outline=(0, 0, 0), width=4)
        ty = cy - th // 2
        for line, (lw, lh) in zip(lines, sizes):
            # Shadow + text
            draw.text((cx - lw//2 + 2, ty + 2), line, fill=(0, 0, 0), font=font)
            draw.text((cx - lw//2,     ty),     line, fill=(20, 20, 20), font=font)
            ty += lh + 5

    elif style == "gothic":
        # Black gothic banner with gold trim, white drop-shadow, serif font.
        # Wider/taller than text + ornate ribbon edges.
        wing = 22  # tab width on each side
        gx0, gy0 = bx - wing, by - 8
        gx1, gy1 = bx + bw + wing, by + bh + 8
        # Body
        draw.rectangle([gx0, gy0, gx1, gy1], fill=(15, 15, 15))
        # Gold inner trim
        draw.rectangle([gx0 + 3, gy0 + 3, gx1 - 3, gy1 - 3],
                       outline=(212, 175, 55), width=3)
        # Ribbon ends (notched like a banner)
        notch = 18
        draw.polygon([(gx0, gy0), (gx0 + notch, gy0 + (gy1 - gy0) // 2),
                      (gx0, gy1)], fill=(15, 15, 15))
        draw.polygon([(gx1, gy0), (gx1 - notch, gy0 + (gy1 - gy0) // 2),
                      (gx1, gy1)], fill=(15, 15, 15))
        # Gold outline on notches
        draw.line([(gx0, gy0), (gx0 + notch, gy0 + (gy1 - gy0) // 2),
                   (gx0, gy1)], fill=(212, 175, 55), width=3)
        draw.line([(gx1, gy0), (gx1 - notch, gy0 + (gy1 - gy0) // 2),
                   (gx1, gy1)], fill=(212, 175, 55), width=3)
        # Decorative top + bottom dividers
        div_y0 = gy0 + 6
        div_y1 = gy1 - 6
        draw.line([(gx0 + 8, div_y0), (gx1 - 8, div_y0)], fill=(120, 90, 20), width=2)
        draw.line([(gx0 + 8, div_y1), (gx1 - 8, div_y1)], fill=(120, 90, 20), width=2)
        # Text — gold serif with dark shadow
        gothic_font = _find_serif_font(40)
        g_lines     = _wrap(text, max_chars=10)
        g_tw, g_th, g_sizes = _measure_multiline(gothic_font, g_lines)
        ty = cy - g_th // 2
        for line, (lw, lh) in zip(g_lines, g_sizes):
            draw.text((cx - lw // 2 + 2, ty + 2), line,
                      fill=(0, 0, 0), font=gothic_font)
            draw.text((cx - lw // 2, ty), line,
                      fill=(235, 200, 90), font=gothic_font)
            ty += lh + 5

    elif style == "boom":
        # Big chunky red/orange explosion with yellow italic text.
        # Two layered starbursts give it a hot "heat" feel.
        r_out = max(bw, bh) // 2 + 50
        r_in  = int(r_out * 0.42)
        # Outer red burst
        pts   = _starburst_pts(cx, cy, r_out, r_in, 14)
        draw.polygon(pts, fill=(180, 30, 30), outline=(0, 0, 0), width=4)
        # Inner orange burst (slightly smaller, rotated)
        r_out2 = int(r_out * 0.78)
        r_in2  = int(r_out2 * 0.42)
        offset_angle = math.pi / 14
        pts2 = []
        for i in range(14 * 2):
            a = math.pi * i / 14 - math.pi / 2 + offset_angle
            r = r_out2 if i % 2 == 0 else r_in2
            pts2.append((cx + r * math.cos(a), cy + r * math.sin(a)))
        draw.polygon(pts2, fill=(255, 120, 30), outline=(80, 20, 0), width=4)
        # Text — bold yellow with red shadow
        boom_font = find_font(46)
        boom_lines = _wrap(text, max_chars=10)
        b_tw, b_th, b_sizes = _measure_multiline(boom_font, boom_lines)
        ty = cy - b_th // 2
        for line, (lw, lh) in zip(boom_lines, b_sizes):
            draw.text((cx - lw // 2 + 3, ty + 3), line,
                      fill=(120, 0, 0), font=boom_font)
            draw.text((cx - lw // 2, ty), line,
                      fill=(255, 240, 60), font=boom_font)
            ty += lh + 5

    elif style == "memo":
        # Yellow Post-It with a folded corner and a tiny pin shadow.
        # Slight rotation per position so it doesn't look stamped.
        fold = 32
        shadow = 10
        # Memo body — leave room for the folded corner top-right
        mx0, my0 = bx, by - 4
        mx1, my1 = bx + bw, by + bh + 4
        # Black drop-shadow
        draw.rectangle([mx0 + shadow, my0 + shadow, mx1 + shadow, my1 + shadow],
                       fill=(0, 0, 0))
        # Yellow body
        draw.polygon([
            (mx0, my0), (mx1 - fold, my0),
            (mx1, my0 + fold), (mx1, my1),
            (mx0, my1),
        ], fill=(255, 240, 120), outline=(120, 90, 0), width=3)
        # Folded corner triangle (slightly darker yellow)
        draw.polygon([
            (mx1 - fold, my0), (mx1 - fold, my0 + fold), (mx1, my0 + fold),
        ], fill=(220, 200, 90), outline=(120, 90, 0), width=3)
        # Slight hand-written feel — shift lines slightly
        memo_font = find_font(40)
        memo_lines = _wrap(text, max_chars=10)
        m_tw, m_th, m_sizes = _measure_multiline(memo_font, memo_lines)
        ty = cy - m_th // 2
        for i, (line, (lw, lh)) in enumerate(zip(memo_lines, m_sizes)):
            jitter_x = 1 if i % 2 == 0 else -1
            draw.text((cx - lw // 2 + jitter_x, ty), line,
                      fill=(40, 40, 40), font=memo_font)
            ty += lh + 5
        # Tiny pin/tape decoration on top edge
        pin_w, pin_h = 40, 12
        pin_x = cx - pin_w // 2
        pin_y = my0 - 4
        draw.rectangle([pin_x, pin_y, pin_x + pin_w, pin_y + pin_h],
                       fill=(180, 180, 180), outline=(80, 80, 80), width=2)

    return result


def _find_serif_font(size: int) -> ImageFont.ImageFont:
    """Prefer a serif font for the gothic banner."""
    candidates = [
        "/System/Library/Fonts/Supplemental/Georgia.ttf",
        "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
        "/System/Library/Fonts/Times.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
    ]
    for p in candidates:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    # Fallback to the bold sans we already located
    return find_font(size)


# ── Layout ────────────────────────────────────────────────────────────────────

def build_slots(n: int, canvas_w: int, base_h: int, b: int):
    """
    Return (slots, canvas_w, canvas_h) for the comic layout of n panels.
    Each slot is (x, y, w, h). Returns None if no template for n.
    """
    template = _LAYOUTS.get(n)
    if not template:
        return None

    n_rows       = len(template)
    total_weight = sum(rw for _, rw in template)
    # Total vertical panel space = same as an equivalent grid would use
    total_panel_h = base_h * n_rows

    slots = []
    y     = b
    for col_weights, rw in template:
        row_h      = int(rw / total_weight * total_panel_h)
        available  = canvas_w - (len(col_weights) + 1) * b
        x          = b
        for i, cw in enumerate(col_weights):
            # Last column absorbs rounding remainder
            if i == len(col_weights) - 1:
                sw = canvas_w - x - b
            else:
                sw = int(cw * available)
            slots.append((x, y, sw, row_h))
            x += sw + b
        y += row_h + b

    return slots, canvas_w, y


# ── Main assembly ─────────────────────────────────────────────────────────────

def assemble_grid(
    images:          list,
    captions:        list,
    cols:            int,
    layout:          str  = "grid",
    bubble_styles:   list = None,
    bubble_positions:list = None,
) -> Image.Image:
    n     = len(images)
    b     = BORDER
    imgs  = [img.convert("RGB") for img in images]
    pw, ph = imgs[0].size

    # ── Compute slots ──────────────────────────────────────────────────────
    slots    = None
    canvas_w = cols * pw + (cols + 1) * b

    if layout == "comic":
        result = build_slots(n, canvas_w, ph, b)
        if result:
            slots, canvas_w, canvas_h = result

    if slots is None:
        # Grid fallback (also used when layout="grid")
        layout   = "grid"
        rows     = (n + cols - 1) // cols
        cap_h    = 0
        # Only "bar" needs a caption strip below the panel. Overlay styles
        # (bubble/star/gothic/boom/memo) draw text on top of the image.
        if bubble_styles and any(s == "bar" for s in bubble_styles):
            has_text = bool(captions) and any(c.strip() for c in captions)
            cap_h = 96 if has_text else 0
        canvas_h = rows * (ph + cap_h + b) + b
        slots = []
        for idx in range(n):
            col = idx % cols
            row = idx // cols
            x   = b + col * (pw + b)
            y   = b + row * (ph + cap_h + b)
            slots.append((x, y, pw, ph))

    comic    = Image.new("RGB", (canvas_w, canvas_h), BG_COLOR)
    font_bar = find_font(52)

    for idx, img in enumerate(imgs):
        x, y, sw, sh = slots[idx]

        # Resolve style and position
        if bubble_styles and idx < len(bubble_styles):
            style = bubble_styles[idx]
        else:
            style = "bubble" if layout == "comic" else "bar"

        if bubble_positions and idx < len(bubble_positions):
            pos = bubble_positions[idx]
        else:
            pos = _POSITIONS[idx % len(_POSITIONS)]

        caption = captions[idx].strip() if captions and idx < len(captions) else ""
        fitted  = fit_image(img, sw, sh)

        if style in ("bubble", "star", "gothic", "boom", "memo"):
            fitted = draw_caption_overlay(fitted, caption, style, pos)
            comic.paste(fitted, (x, y))
        else:
            # "bar" — gold caption strip below panel
            comic.paste(fitted, (x, y))
            if caption and layout == "grid":
                bar  = Image.new("RGB", (sw, 96), BG_COLOR)
                drw  = ImageDraw.Draw(bar)
                tw, th = _text_size(font_bar, caption.upper())
                tx   = (sw - tw) // 2
                ty   = (96  - th) // 2
                drw.text((tx+2, ty+2), caption.upper(), fill=(0, 0, 0),     font=font_bar)
                drw.text((tx,   ty),   caption.upper(), fill=(255, 215, 0), font=font_bar)
                comic.paste(bar, (x, y + sh))

    return comic
