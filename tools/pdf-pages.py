"""Bir PDF'in her sayfasını PNG görüntüye ve metin katmanını .txt dosyasına döker (PyMuPDF).
Saatlik görev MEB kitapçıklarını bu sayfalardan okur: metni birebir alır, şekilleri görüntüden kırpar.
Kullanım: python -I tools/pdf-pages.py <dosya.pdf> <çıkış klasörü> [dpi=150]"""
import sys
from pathlib import Path

import fitz  # PyMuPDF


def main(pdf, out_dir, dpi=150):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf)
    for i, page in enumerate(doc, 1):
        page.get_pixmap(dpi=dpi).save(out / f"p{i:02d}.png")
        (out / f"p{i:02d}.txt").write_text(page.get_text(), encoding="utf-8")
    print(f"{Path(pdf).name}: {len(doc)} sayfa")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 150)
