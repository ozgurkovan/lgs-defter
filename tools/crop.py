"""Sayfa fotoğrafından bir soruyu kırpar.

Kullanım: python -I tools/crop.py <giriş.jpg> <çıkış.jpg> <sol> <üst> <sağ> <alt>
Koordinatlar sayfanın genişlik/yüksekliğine oranla 0-1 arasıdır. Kenarlara biraz pay eklenir.
"""
import sys

from PIL import Image, ImageOps

src, dst = sys.argv[1], sys.argv[2]
left, top, right, bottom = (float(v) for v in sys.argv[3:7])
pad = 0.015

img = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
w, h = img.size
box = (
    max(0, int((left - pad) * w)),
    max(0, int((top - pad) * h)),
    min(w, int((right + pad) * w)),
    min(h, int((bottom + pad) * h)),
)
img.crop(box).save(dst, "JPEG", quality=85)
print(f"{dst} {box[2] - box[0]}x{box[3] - box[1]}")
