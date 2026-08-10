# -*- coding: utf-8 -*-
"""仙鹤原图处理：近白背景洪水去背 + 边缘柔化 + 内容裁剪。

输入：用户截图（纯色近白背景的仙鹤工笔画）。
输出：frontend/public/crane.png（桌宠/前端用）与 desktop/assets/crane-master.png（图标母版）。
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageFilter

SRC = Path(r"C:/Users/34043/OneDrive/图片/Screenshots/屏幕截图 2026-08-08 174539.png")
ROOT = Path(r"D:/Dev/Selenyx")
OUT_PET = ROOT / "frontend/public/crane.png"
OUT_MASTER = ROOT / "desktop/assets/crane-master.png"

# 背景判别：截图背景是中性白/棋盘格灰（RGB 三通道几乎相等且很亮），
# 而鹤身羽毛是暖象牙白（R-B ≥ 5）、云是灰绿（G 偏高）——
# 用「max-min ≤ 2 且 min ≥ 242」即可全局精确分离，无需洪水填充，
# 翅膀合围的天空孤岛也能一并去除。
SPREAD_MAX = 2
MIN_BRIGHT = 242


def is_bg(rgb: tuple[int, int, int]) -> bool:
    hi = max(rgb)
    lo = min(rgb)
    return hi - lo <= SPREAD_MAX and lo >= MIN_BRIGHT


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    w, h = im.size
    px = im.load()

    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            if is_bg((r, g, b)):
                px[x, y] = (r, g, b, 0)

    # 去孤立墨点/碎屑：前景连通域 < MIN_COMPONENT 像素的一律视为杂质清除
    MIN_COMPONENT = 60
    alpha = im.getchannel("A")
    bits = alpha.tobytes()
    fg = bytearray(1 if b else 0 for b in bits)
    seen = bytearray(w * h)
    from collections import deque

    for start in range(w * h):
        if not fg[start] or seen[start]:
            continue
        comp = [start]
        seen[start] = 1
        queue = deque([start])
        while queue:
            i = queue.popleft()
            cx, cy = i % w, i // w
            for j in (i - 1, i + 1, i - w, i + w):
                if j < 0 or j >= w * h or seen[j] or not fg[j]:
                    continue
                # 防跨行回绕
                if abs(j % w - cx) + abs(j // w - cy) != 1:
                    continue
                seen[j] = 1
                comp.append(j)
                queue.append(j)
        if len(comp) < MIN_COMPONENT:
            for i in comp:
                x, y = i % w, i // w
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, 0)

    alpha = im.getchannel("A").point(lambda a: 255 if a else 0)
    soft = alpha.filter(ImageFilter.GaussianBlur(0.8))
    im.putalpha(soft)

    bbox = soft.getbbox()
    if not bbox:
        sys.exit("去背后无内容，容差过大？")
    margin = 6
    l, t, r, b = bbox
    l = max(0, l - margin)
    t = max(0, t - margin)
    r = min(w, r + margin)
    b = min(h, b + margin)
    im = im.crop((l, t, r, b))

    OUT_PET.parent.mkdir(parents=True, exist_ok=True)
    OUT_MASTER.parent.mkdir(parents=True, exist_ok=True)
    im.save(OUT_MASTER)
    pet = im.copy()
    pet.thumbnail((512, 512), Image.LANCZOS)
    pet.save(OUT_PET)
    print(f"master: {OUT_MASTER} {im.size}")
    print(f"pet:    {OUT_PET} {pet.size}")


if __name__ == "__main__":
    main()
