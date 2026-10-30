"""Labeled contact sheet of images.

usage: python -I contact_sheet.py OUT.png [--bg #f4f0e6] [--cell 220] [--cols 8] FILE...
RGBA images are composited onto --bg (or a split cream/dark background with --split).
"""
import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def font(size):
    for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
              "/usr/share/fonts/dejavu/DejaVuSans.ttf"]:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("files", nargs="+")
    ap.add_argument("--bg", default="#f4f0e6")
    ap.add_argument("--bg2", default=None, help="second bg: each cell drawn twice side by side")
    ap.add_argument("--cell", type=int, default=220)
    ap.add_argument("--cols", type=int, default=8)
    a = ap.parse_args()
    bgs = [a.bg] + ([a.bg2] if a.bg2 else [])
    cw = a.cell * len(bgs)
    lab = 16
    rows = (len(a.files) + a.cols - 1) // a.cols
    sheet = Image.new("RGB", (cw * a.cols + 4 * a.cols, (a.cell + lab + 4) * rows), "#999999")
    d = ImageDraw.Draw(sheet)
    f = font(12)
    for i, fp in enumerate(a.files):
        im = Image.open(fp).convert("RGBA")
        im.thumbnail((a.cell - 8, a.cell - 8), Image.LANCZOS)
        x0 = (i % a.cols) * (cw + 4)
        y0 = (i // a.cols) * (a.cell + lab + 4)
        for j, bg in enumerate(bgs):
            tile = Image.new("RGBA", (a.cell, a.cell), bg)
            tile.alpha_composite(im, ((a.cell - im.width) // 2, (a.cell - im.height) // 2))
            sheet.paste(tile.convert("RGB"), (x0 + j * a.cell, y0))
        d.rectangle([x0, y0 + a.cell, x0 + cw, y0 + a.cell + lab], fill="#ffffff")
        d.text((x0 + 3, y0 + a.cell + 1), Path(fp).stem[:40], fill="#000000", font=f)
    sheet.save(a.out)
    print(a.out, sheet.size)


if __name__ == "__main__":
    main()
