#!/usr/bin/env python3
# 把 desktop/assets/icon.svg 渲染为 512x512 PNG 图标。
# 依赖：pip install cairosvg
# 重新生成：python3 scripts/build-icon.py
import cairosvg, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
SVG = ROOT / "desktop" / "assets" / "icon.svg"
PNG = ROOT / "desktop" / "assets" / "icon.png"
cairosvg.svg2png(url=str(SVG), write_to=str(PNG), output_width=512, output_height=512)
print(f"icon written: {PNG}")
