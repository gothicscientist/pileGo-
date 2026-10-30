"""Tiles rendered frames into one labelled sheet. Used by scripts/stills.mjs."""
import sys, re
from PIL import Image, ImageDraw

out, files = sys.argv[1], sys.argv[2:]
ims = [Image.open(f).convert("RGB") for f in files]
w = 480
h = int(ims[0].height * w / ims[0].width)
cols = 4 if len(ims) > 4 else len(ims)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGB", (cols * w, rows * (h + 22)), "white")
d = ImageDraw.Draw(sheet)
for i, (f, im) in enumerate(zip(files, ims)):
    x, y = (i % cols) * w, (i // cols) * (h + 22)
    sheet.paste(im.resize((w, h)), (x, y + 22))
    frame = int(re.findall(r"(\d+)\.jpg$", f)[0])
    d.text((x + 6, y + 5), f"f{frame}  {frame/30:.2f}s", fill="black")
sheet.save(out, quality=88)
