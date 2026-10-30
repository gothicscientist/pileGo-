"""Final QA contact sheet of every cutout in public/garments (labeled, on cream).

usage: python -I final_sheet.py [--dark]
Writes public/garments/contact-sheet.png (or work/contact-sheet-dark.png with --dark).
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
G = HERE.parent / "public/garments"
CELL, LAB, COLS = 300, 34, 6


def font(size):
    for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def main():
    dark = "--dark" in sys.argv
    bg = "#22241e" if dark else "#f4f0e6"
    fg = "#f4f0e6" if dark else "#22241e"
    files = sorted(p for p in G.glob("*.png") if p.name != "contact-sheet.png")
    rows = (len(files) + COLS - 1) // COLS
    sheet = Image.new("RGB", (COLS * CELL, rows * (CELL + LAB)), bg)
    d = ImageDraw.Draw(sheet)
    f1, f2 = font(15), font(11)
    for i, p in enumerate(files):
        im = Image.open(p).convert("RGBA")
        w, h = im.size
        im.thumbnail((CELL - 20, CELL - 20), Image.LANCZOS)
        x0, y0 = (i % COLS) * CELL, (i // COLS) * (CELL + LAB)
        tile = Image.new("RGBA", (CELL, CELL), bg)
        tile.alpha_composite(im, ((CELL - im.width) // 2, (CELL - im.height) // 2))
        sheet.paste(tile.convert("RGB"), (x0, y0))
        d.text((x0 + 8, y0 + CELL), p.stem, fill=fg, font=f1)
        d.text((x0 + 8, y0 + CELL + 18), f"{w}x{h}", fill=fg, font=f2)
    out = (HERE / "work/contact-sheet-dark.png") if dark else (G / "contact-sheet.png")
    sheet.save(out, optimize=True)
    print(out, sheet.size)


if __name__ == "__main__":
    main()
