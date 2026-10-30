"""Stage 2: clean BiRefNet masks into finished garment cutouts.

usage: python -I cutout.py [name ...]
Reads  assets-src/originals/full/<name>.jpg + assets-src/work/masks/<name>.png
Writes public/garments/<name>.png (RGBA, trimmed, 8px padding, long side <= 1600)

Cleanup per item (see CFG):
  erase      list of (l, t, r, b) fraction boxes zeroed in the mask (hands, hooks, props)
  keep       "largest" keeps only the biggest component, otherwise components whose
             area is >= keep_min of the biggest one
  fill_holes holes smaller than this fraction of the garment area are filled
  inpaint    (l, t, r, b) fraction boxes painted over from their surroundings (brand
             labels inside collars / waistbands, so no trademark is legible)
Then: speck removal, ~1px alpha erosion + feather, colour decontamination of the edge
(pymatting foreground estimation), trim + pad.
"""
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from pymatting import estimate_foreground_ml

HERE = Path(__file__).resolve().parent
SRC = HERE / "originals/full"
MASKS = HERE / "work/masks"
OUT = HERE.parent / "public/garments"
PAD = 8
MAX_SIDE = 1600

CFG: dict[str, dict] = {
    # watch and sunglasses beside the shoes
    "brogues": {"erase": [(0.25, 0.0, 0.39, 1.0), (0.33, 0.74, 0.6, 0.97)]},
    # hand holding the hanger hook, hook itself; keep only the sweater
    "cream-turtleneck": {
        "erase": [(0.0, 0.0, 1.0, 0.18), (0.5, 0.0, 0.6, 0.184), (0.6, 0.0, 0.63, 0.196),
                  (0.63, 0.0, 1.0, 0.2), (0.75, 0.2, 1.0, 0.272)],
        "keep": "largest",
    },
    # hand and arm above the wooden hanger (hook kept as a short stub); vase is dropped
    "lilac-sweater": {
        "erase": [(0.0, 0.0, 1.0, 0.296), (0.68, 0.0, 1.0, 0.372)],
        "keep": "largest",
    },
    # brand labels: GLAMOUR DESIGN coat label
    "pink-coat-outfit": {"inpaint": [(0.35, 0.125, 0.46, 0.158)]},
    # shirt label under the blazer (TOMMY H...): text painted out, labels left blank
    "sage-blazer": {"inpaint": [(0.472, 0.357, 0.5, 0.37), (0.474, 0.373, 0.499, 0.393)]},
    # neck label text only (label stays as a blank tag)
    "striped-knit-sweater": {"inpaint": [(0.415, 0.29, 0.54, 0.316)]},
    # Sears neck label (price tag kept)
    "floral-tea-dress": {"inpaint": [(0.515, 0.08, 0.56, 0.118)]},
    "rose-floral-dress": {"inpaint": [(0.515, 0.155, 0.565, 0.18)]},
    # text on the back waistband patch (patch left blank)
    "jeans": {"inpaint": [(0.407, 0.103, 0.43, 0.118)]},
    # eyeshadow palette beside the vest
    "green-cable-vest": {"keep": "largest"},
}


def keep_components(binary, keep="area", keep_min=0.04):
    lab, n = ndi.label(binary)
    if n == 0:
        return binary
    areas = ndi.sum(binary, lab, index=np.arange(1, n + 1))
    if keep == "largest":
        ids = [int(np.argmax(areas)) + 1]
    else:
        ids = [i + 1 for i, a in enumerate(areas) if a >= keep_min * areas.max()]
    return np.isin(lab, ids)


def fill_small_holes(binary, max_frac):
    holes = ndi.binary_fill_holes(binary) & ~binary
    lab, n = ndi.label(holes)
    if n == 0:
        return binary
    areas = ndi.sum(holes, lab, index=np.arange(1, n + 1))
    small = [i + 1 for i, a in enumerate(areas) if a < max_frac * binary.sum()]
    return binary | np.isin(lab, small)


def process(name: str):
    cfg = CFG.get(name, {})
    img = Image.open(SRC / f"{name}.jpg").convert("RGB")
    if cfg.get("inpaint"):
        arr = np.asarray(img).copy()
        Hh, Ww = arr.shape[:2]
        hole = np.zeros((Hh, Ww), np.uint8)
        for (l, t, r, b) in cfg["inpaint"]:
            hole[int(t * Hh):int(b * Hh), int(l * Ww):int(r * Ww)] = 255
        arr = cv2.inpaint(arr, hole, 9, cv2.INPAINT_TELEA)
        # a little matching grain so the patch does not look smeared
        rng = np.random.default_rng(0)
        noise = rng.normal(0, 4, arr.shape)
        arr = np.where(hole[..., None] > 0, np.clip(arr + noise, 0, 255), arr).astype(np.uint8)
        img = Image.fromarray(arr)
    m = np.asarray(Image.open(MASKS / f"{name}.png").convert("L")).astype(np.float32) / 255
    H, W = m.shape

    for (l, t, r, b) in cfg.get("erase", []):
        m[int(t * H):int(b * H), int(l * W):int(r * W)] = 0

    # components / specks
    binary = m > 0.5
    kept = keep_components(binary, cfg.get("keep", "area"), cfg.get("keep_min", 0.04))
    if cfg.get("fill_holes", 0.002):
        filled = fill_small_holes(kept, cfg.get("fill_holes", 0.002))
        m = np.where(filled & ~kept, 1.0, m)
        kept = filled
    region = ndi.binary_dilation(kept, iterations=4)
    m = m * region
    lo, hi = cfg.get("levels", (0.06, 0.94))
    m = np.clip((m - lo) / (hi - lo), 0, 1)

    # trim at full res, then scale
    ys, xs = np.where(m > 0.02)
    t, b, l, r = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    scale = min(1.0, (MAX_SIDE - 2 * PAD) / max(b - t, r - l))
    pad_src = int(np.ceil((PAD + 2) / scale))
    t, l = max(0, t - pad_src), max(0, l - pad_src)
    b, r = min(H, b + pad_src), min(W, r + pad_src)
    crop_img = img.crop((l, t, r, b))
    crop_m = Image.fromarray((m[t:b, l:r] * 255).astype(np.uint8))
    if scale < 1:
        size = (round((r - l) * scale), round((b - t) * scale))
        crop_img = crop_img.resize(size, Image.LANCZOS)
        crop_m = crop_m.resize(size, Image.LANCZOS)

    a = np.asarray(crop_m).astype(np.float32) / 255
    # ~1px erosion + soft feather so no background rim survives
    ero = cfg.get("erode", 1)
    if ero:
        a = ndi.grey_erosion(a, size=(2 * ero + 1, 2 * ero + 1))
    a = ndi.gaussian_filter(a, cfg.get("feather", 0.6))
    a[a < 0.02] = 0

    rgb = np.asarray(crop_img).astype(np.float64) / 255
    fg = estimate_foreground_ml(rgb, a.astype(np.float64))
    rgba = np.dstack([np.clip(fg, 0, 1) * 255, a * 255]).round().astype(np.uint8)
    out = Image.fromarray(rgba, "RGBA")

    # final trim to content + exact padding
    bbox = out.getchannel("A").point(lambda v: 255 if v > 3 else 0).getbbox()
    out = out.crop(bbox)
    canvas = Image.new("RGBA", (out.width + 2 * PAD, out.height + 2 * PAD), (0, 0, 0, 0))
    canvas.paste(out, (PAD, PAD))
    canvas.save(OUT / f"{name}.png", optimize=True)
    print(name, canvas.size, flush=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    names = sys.argv[1:] or sorted(p.stem for p in MASKS.glob("*.png") if "." not in p.stem)
    for n in names:
        process(n)


if __name__ == "__main__":
    main()
