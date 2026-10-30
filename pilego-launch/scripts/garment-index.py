"""Writes src/data/garments.json: every cutout in public/garments with its size.
Run after adding or swapping a garment: python3 scripts/garment-index.py"""
import json, pathlib
from PIL import Image

root = pathlib.Path(__file__).resolve().parent.parent
out = {}
for p in sorted((root / "public/garments").glob("*.webp")):
    if p.stem.startswith("contact"):
        continue
    with Image.open(p) as im:
        out[p.stem] = {"src": f"garments/{p.name}", "w": im.width, "h": im.height}
(root / "src/data").mkdir(exist_ok=True)
(root / "src/data/garments.json").write_text(json.dumps(out, indent=1) + "\n")
print(len(out), "garments")
