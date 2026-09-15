#!/usr/bin/env python3
"""Render a single 1920x1080 title-card PNG for the combined demo video.

Why this exists: the homebrew `ffmpeg` on this machine is built without
libfreetype/fontconfig, so ffmpeg's `drawtext` filter is unavailable
(`No such filter: 'drawtext'`). Installing `ffmpeg-full` to get drawtext
pulls in ~47 extra dependencies and a long rebuild, which is overkill for
four static cards. Pillow (already installed) renders the exact same
layout to a PNG in milliseconds; ffmpeg then just loops the PNG for the
card's duration. Keep this script if the cards ever need to change.

Usage:
    python3 make_title_card.py <output.png> --lines "Big text|main" "smaller|accent" "tiny|main"

Each --lines entry is "text|style" where style is one of: big, main, accent, small.
"""
import argparse
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1920, 1080
BG = "#201E1B"
FG = "#F1ECE3"      # warm off-white
ACCENT = "#D97757"  # terracotta

FONT_PATH = "/System/Library/Fonts/Supplemental/Georgia.ttf"
FONT_PATH_FALLBACK = "/System/Library/Fonts/Supplemental/Times New Roman.ttf"

STYLE_SIZE = {
    "big": 140,
    "main": 64,
    "accent": 44,
    "small": 30,
}
STYLE_COLOR = {
    "big": FG,
    "main": FG,
    "accent": ACCENT,
    "small": FG,
}
STYLE_GAP_AFTER = {
    "big": 46,
    "main": 34,
    "accent": 30,
    "small": 20,
}


def load_font(size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except OSError:
        return ImageFont.truetype(FONT_PATH_FALLBACK, size)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output")
    parser.add_argument(
        "--lines",
        nargs="+",
        required=True,
        help='Entries of "text|style" where style in {big,main,accent,small}',
    )
    args = parser.parse_args()

    entries = []
    for raw in args.lines:
        text, _, style = raw.rpartition("|")
        if not text:
            text, style = style, "main"
        if style not in STYLE_SIZE:
            style = "main"
        entries.append((text, style))

    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img)

    rendered = []
    total_h = 0
    for text, style in entries:
        font = load_font(STYLE_SIZE[style])
        bbox = draw.textbbox((0, 0), text, font=font)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        gap = STYLE_GAP_AFTER[style]
        rendered.append((text, font, w, h, bbox, STYLE_COLOR[style], gap))
        total_h += h + gap
    total_h -= rendered[-1][6]  # no gap after last line

    y = (HEIGHT - total_h) / 2
    for text, font, w, h, bbox, color, gap in rendered:
        x = (WIDTH - w) / 2 - bbox[0]
        draw.text((x, y - bbox[1]), text, font=font, fill=color)
        y += h + gap

    img.save(args.output)
    print(f"wrote {args.output} ({WIDTH}x{HEIGHT})")


if __name__ == "__main__":
    main()
