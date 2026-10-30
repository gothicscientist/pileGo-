"""QA: show each original next to its raw mask composite on cream, with a 10% grid.

usage: python -I mask_sheet.py OUT.png name ...
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
CELL = 360


def main():
    out, names = sys.argv[1], sys.argv[2:]
    sheet = Image.new("RGB", (CELL * 2 * 2 + 12, (CELL + 18) * ((len(names) + 1) // 2)), "#888")
    d = ImageDraw.Draw(sheet)
    for i, n in enumerate(names):
        im = Image.open(HERE / "originals/full" / f"{n}.jpg").convert("RGB")
        m = Image.open(HERE / "work/masks" / f"{n}.png").convert("L")
        im.thumbnail((CELL, CELL)); m = m.resize(im.size)
        comp = Image.new("RGB", im.size, "#f4f0e6"); comp.paste(im, mask=m)
        for tile in (im, comp):
            dd = ImageDraw.Draw(tile)
            for k in range(1, 10):
                x = tile.width * k // 10; y = tile.height * k // 10
                dd.line([(x, 0), (x, tile.height)], fill=(255, 0, 255), width=1)
                dd.line([(0, y), (tile.width, y)], fill=(255, 0, 255), width=1)
        x0 = (i % 2) * (CELL * 2 + 12); y0 = (i // 2) * (CELL + 18)
        sheet.paste(im, (x0, y0)); sheet.paste(comp, (x0 + CELL, y0))
        d.text((x0 + 3, y0 + CELL + 2), n, fill="#000")
    sheet.save(out)


if __name__ == "__main__":
    main()
