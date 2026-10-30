"""Step 1: convert the licensed repo cutouts (Unsplash) to trimmed RGBA PNGs.

Run from anywhere:  python -I convert_reused.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]  # /home/user/pileGo-
CLOSET = ROOT / "apps/web/src/assets/closet"
OUT = ROOT / "pilego-launch/public/garments"
PAD = 8
MAX_SIDE = 1600

CUTOUTS = ["anorak", "beanie", "camel-blazer", "cap", "denim-jacket", "flannel",
           "navy-bomber", "rust-bomber", "white-tee"]


def trim(im: Image.Image, pad: int = PAD) -> Image.Image:
    im = im.convert("RGBA")
    a = im.getchannel("A").point(lambda v: 255 if v > 8 else 0)
    box = a.getbbox()
    im = im.crop(box)
    out = Image.new("RGBA", (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    out.paste(im, (pad, pad))
    return out


def fit(im: Image.Image) -> Image.Image:
    s = MAX_SIDE / max(im.size)
    if s < 1:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    return im


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name in CUTOUTS:
        im = fit(trim(Image.open(CLOSET / f"{name}.webp")))
        im.save(OUT / f"{name}.png", optimize=True)
        print(name, im.size)
    # seller-style photo (no alpha needed, but keep RGBA PNG for consistency)
    p = Image.open(ROOT / "apps/web/e2e/photos/rust-bomber.webp").convert("RGBA")
    fit(p).save(OUT / "rust-bomber-photo.png", optimize=True)
    print("rust-bomber-photo", p.size)


if __name__ == "__main__":
    main()
