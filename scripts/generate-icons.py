# -*- coding: utf-8 -*-
"""由品牌云纹仙鹤图生成桌面端 Tauri 应用图标（desktop/icons/）。"""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "frontend" / "public" / "brand-crane-cloud-512-v1.png"
ICONS = ROOT / "desktop" / "icons"

PAPER = (248, 250, 248, 255)
BORDER = (56, 102, 78, 255)

PNGS = [
    ("32x32.png", 32, 0.80),
    ("128x128.png", 128, 0.78),
    ("128x128@2x.png", 256, 0.78),
]


def fit(crane: Image.Image, side: int, ratio: float) -> Image.Image:
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    card = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    draw = ImageDraw.Draw(card)
    radius = max(2, int(side * 0.20))
    ring = max(1, round(side * 0.016))
    draw.rounded_rectangle(
        (ring, ring, side - ring - 1, side - ring - 1),
        radius=radius,
        fill=PAPER,
        outline=BORDER,
        width=ring,
    )
    canvas.alpha_composite(card)
    box = max(1, int(side * ratio))
    scaled = crane.copy()
    scaled.thumbnail((box, box), Image.LANCZOS)
    x = (side - scaled.width) // 2
    y = (side - scaled.height) // 2
    canvas.alpha_composite(scaled, (x, y))
    return canvas


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    crane = Image.open(MASTER).convert("RGBA")
    for name, side, ratio in PNGS:
        fit(crane, side, ratio).save(ICONS / name)
        print("png", name)

    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    fit(crane, 256, 0.80).save(
        ICONS / "icon.ico",
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
    )
    print("ico icon.ico", ico_sizes)

    try:
        fit(crane, 512, 0.76).save(ICONS / "icon.icns", format="ICNS")
        print("icns icon.icns")
    except Exception as exc:  # noqa: BLE001
        print("icns skipped:", exc)


if __name__ == "__main__":
    main()
