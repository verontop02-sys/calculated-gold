"""Convert Ruslan's PNGs from «Новая папка» into web JPEGs (light + darkened dark)."""
from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(r"d:\calculated_gold")
SRC = ROOT / "Новая папка"
OUT = ROOT / "client" / "public" / "ru"
MAX_SIDE = 1920
JPEG_Q = 82


def find_src(predicate):
    for name in os.listdir(SRC):
        if predicate(name):
            return SRC / name
    raise FileNotFoundError(predicate)


def load_rgb(path: Path) -> Image.Image:
    im = Image.open(path)
    if im.mode in ("RGBA", "P"):
        bg = Image.new("RGB", im.size, (18, 14, 12))
        im = im.convert("RGBA")
        bg.paste(im, mask=im.split()[-1])
        return bg
    return im.convert("RGB")


def fit(im: Image.Image, max_side: int = MAX_SIDE) -> Image.Image:
    w, h = im.size
    side = max(w, h)
    if side <= max_side:
        return im
    scale = max_side / side
    return im.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)


def save_jpeg(im: Image.Image, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "JPEG", quality=JPEG_Q, optimize=True, progressive=True)
    print(f"  {dest.name:28} {dest.stat().st_size / 1024:7.0f} KB  {im.size[0]}x{im.size[1]}")


def make_dark(im: Image.Image) -> Image.Image:
    """Same frame, evening lighting — not a different crop."""
    out = ImageEnhance.Brightness(im).enhance(0.64)
    out = ImageEnhance.Contrast(out).enhance(1.12)
    out = ImageEnhance.Color(out).enhance(0.94)
    return out.filter(ImageFilter.SMOOTH)


def export_pair(src: Path, stem: str) -> None:
    light = fit(load_rgb(src))
    save_jpeg(light, OUT / f"{stem}-light.jpg")
    save_jpeg(make_dark(light), OUT / f"{stem}.jpg")


def main() -> None:
    mapping = [
        (lambda n: "продать" in n and "разделе" in n, "hero-prodat"),
        (lambda n: "продать" in n and "главн" in n, "home-prodat"),
        (lambda n: "работа" in n, "agent-kit"),
        (lambda n: n.replace("\u0306", "").startswith("курьер"), "courier"),
        (lambda n: "купить" in n and "главную" in n, "home-slitok"),
        (lambda n: n.strip().startswith("купить") and "главн" not in n, "hero-slitki"),
        (lambda n: "купить" in n and "раздел" in n, "slitok"),
        (lambda n: n.startswith("Grok Image 2026-09-06 at 3.49.15"), "gold-bars"),
    ]
    for pred, stem in mapping:
        src = find_src(pred)
        print(f"{stem} <- {src.name.encode('ascii', 'replace').decode()}")
        export_pair(src, stem)


if __name__ == "__main__":
    main()
