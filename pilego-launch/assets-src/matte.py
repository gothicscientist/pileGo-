"""Stage 1: raw soft masks with BiRefNet (rembg) for every original.

usage: python -I matte.py [name ...]
Reads  assets-src/originals/full/<name>.jpg
Writes assets-src/work/masks/<name>.png  (8-bit soft alpha, original size)
"""
import sys
from pathlib import Path
from PIL import Image
from rembg import new_session, remove

HERE = Path(__file__).resolve().parent
SRC = HERE / "originals/full"
OUT = HERE / "work/masks"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    model = "birefnet-general"
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    for a in sys.argv[1:]:
        if a.startswith("--model="):
            model = a.split("=", 1)[1]
    sess = new_session(model)
    names = args or sorted(p.stem for p in SRC.glob("*.jpg"))
    suffix = "" if model == "birefnet-general" else "." + model
    for n in names:
        out = OUT / f"{n}{suffix}.png"
        if out.exists():
            continue
        im = Image.open(SRC / f"{n}.jpg").convert("RGB")
        m = remove(im, session=sess, only_mask=True, post_process_mask=False)
        m.save(out)
        print(n, m.size, flush=True)


if __name__ == "__main__":
    main()
