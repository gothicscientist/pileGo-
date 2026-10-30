"""Build collage textures: crop to ~2000px, optional seamless (offset + feathered blend).

usage: python -I textures.py
Reads  assets-src/originals/textures/<name>.jpg
Writes public/textures/<name>.jpg
"""
from pathlib import Path
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
SRC = HERE / "originals/textures"
OUT = HERE.parent / "public/textures"

# name: (crop box as fractions l,t,r,b or None, long side, make seamless)
SPEC = {
    "denim": ((0.0, 0.1, 1.0, 0.85), 2000, True),
    "tweed-check": (None, 2000, False),
    "chunky-knit": (None, 2000, False),
    "tartan-flannel": ((0.0, 0.3, 0.78, 1.0), 2000, False),
    "kraft-paper": ((0.04, 0.04, 0.96, 0.96), 2000, True),
    "cream-paper": ((0.03, 0.03, 0.97, 0.97), 2000, False),
    "cardboard": ((0.02, 0.02, 0.98, 0.98), 2000, False),
}


def seamless(a: np.ndarray, frac: float = 0.18) -> np.ndarray:
    """Make an image tile by blending it with a half-offset copy near the borders."""
    h, w = a.shape[:2]
    sh = np.roll(np.roll(a, h // 2, axis=0), w // 2, axis=1)
    # weight: 1 in the centre of the original (seams of shifted copy live there), 0 at borders
    y = np.minimum(np.arange(h), h - 1 - np.arange(h)) / (h * frac)
    x = np.minimum(np.arange(w), w - 1 - np.arange(w)) / (w * frac)
    wy = np.clip(y, 0, 1)[:, None]
    wx = np.clip(x, 0, 1)[None, :]
    wgt = (wy * wx)[..., None]
    wgt = wgt * wgt * (3 - 2 * wgt)  # smoothstep
    return a * wgt + sh * (1 - wgt)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (box, side, tile) in SPEC.items():
        im = Image.open(SRC / f"{name}.jpg").convert("RGB")
        if box:
            W, H = im.size
            im = im.crop((int(box[0] * W), int(box[1] * H), int(box[2] * W), int(box[3] * H)))
        s = side / max(im.size)
        if s < 1:
            im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        if tile:
            a = np.asarray(im).astype(np.float32)
            im = Image.fromarray(np.clip(seamless(a), 0, 255).astype(np.uint8))
        im.save(OUT / f"{name}.jpg", quality=88, optimize=True, progressive=True)
        print(name, im.size)


if __name__ == "__main__":
    main()
