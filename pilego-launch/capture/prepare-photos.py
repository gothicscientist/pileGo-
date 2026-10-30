"""Make the seller's three scan photos (front, back, label) from the real studio photo."""
from pathlib import Path
from PIL import Image, ImageOps

here = Path(__file__).resolve().parent
src = here.parent.parent / 'apps/web/e2e/photos/rust-bomber.webp'
out = here / 'photos'
out.mkdir(exist_ok=True)
im = Image.open(src).convert('RGB')
im.save(out / 'front.jpg', quality=92)
ImageOps.mirror(im).save(out / 'back.jpg', quality=92)
# Tight crop of the collar with the neck label, scaled up like a close-up photo.
label = im.crop((236, 88, 396, 216)).resize((800, 640), Image.LANCZOS)
label.save(out / 'label.jpg', quality=92)
print('ok', [p.name for p in out.iterdir()])
