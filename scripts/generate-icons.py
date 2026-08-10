# -*- coding: utf-8 -*-
"""由仙鹤母版生成全套应用图标（desktop/icons/）。

- 方形画布 + 透明底，鹤居中，按目标尺寸留出 padding；
- icon.ico 含 16-256 多分辨率；icon.icns 用 Pillow 直写（1024 PNG 压缩条目）；
- Square*Logo / StoreLogo 为 Windows 商店磁贴规格，透明底居中。
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(r"D:/Dev/Selenyx")
MASTER = ROOT / "desktop/assets/crane-master.png"
ICONS = ROOT / "desktop/icons"

PAPER = (247, 244, 236, 255)  # 宣纸白
INK = (27, 27, 27, 255)  # 墨

# (文件名, 边长, 内容占比) —— 小图标占比高保证可辨，大图标留白更优雅
PNGS = [
    ("32x32.png", 32, 0.80),
    ("64x64.png", 64, 0.80),
    ("128x128.png", 128, 0.78),
    ("128x128@2x.png", 256, 0.78),
    ("icon.png", 512, 0.78),
    ("source_1024.png", 1024, 0.76),
    ("Square30x30Logo.png", 30, 0.80),
    ("Square44x44Logo.png", 44, 0.80),
    ("Square71x71Logo.png", 71, 0.80),
    ("Square89x89Logo.png", 89, 0.80),
    ("Square107x107Logo.png", 107, 0.78),
    ("Square142x142Logo.png", 142, 0.78),
    ("Square150x150Logo.png", 150, 0.78),
    ("Square284x284Logo.png", 284, 0.78),
    ("Square310x310Logo.png", 310, 0.78),
    ("StoreLogo.png", 50, 0.80),
]


def fit(crane: Image.Image, side: int, ratio: float) -> Image.Image:
    """宣纸圆角方卡 + 墨线描边 + 居中仙鹤（浅色任务栏上也清晰）。"""
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    card = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    draw = ImageDraw.Draw(card)
    radius = max(2, int(side * 0.18))
    ring = max(1, round(side * 0.014))
    draw.rounded_rectangle(
        (ring, ring, side - ring - 1, side - ring - 1),
        radius=radius,
        fill=PAPER,
        outline=INK,
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
    crane = Image.open(MASTER).convert("RGBA")
    for name, side, ratio in PNGS:
        fit(crane, side, ratio).save(ICONS / name)
        print("png", name)

    # Windows 安装包/任务栏图标：多分辨率 ico
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    fit(crane, 256, 0.80).save(
        ICONS / "icon.ico",
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
    )
    print("ico icon.ico", ico_sizes)

    # macOS 图标（Pillow 直写 icns；失败不阻断，CI 可后续用 tauri icon 重生成）
    try:
        fit(crane, 1024, 0.76).save(ICONS / "icon.icns", format="ICNS")
        print("icns icon.icns")
    except Exception as exc:  # noqa: BLE001
        print("icns 跳过：", exc)


if __name__ == "__main__":
    main()
