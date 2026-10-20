#!/usr/bin/env python3
"""Генерирует исходники для @capacitor/assets в ./assets (Pillow).

    python3 scripts/make-icons.py

Далее: npm run assets  (создаёт mipmap/drawable для Android, включая adaptive icon и splash).
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "assets"
OUT.mkdir(exist_ok=True)

TEAL = (138, 75, 31, 255)  # коричневый акцент
CREAM = (251, 243, 230, 255)
INK = (0, 0, 0, 255)
MINT = (224, 169, 109, 255)

SERIF = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
]


def font(size: int) -> ImageFont.FreeTypeFont:
    for p in SERIF:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def glyph(size: int, fg, scale: float) -> Image.Image:
    """Знак «Lx»: засечная L и строчная x — словарная статья в миниатюре."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f = font(int(size * scale))
    text = "Lx"
    box = d.textbbox((0, 0), text, font=f)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text(((size - w) / 2 - box[0], (size - h) / 2 - box[1]), text, font=f, fill=fg)
    # акцентная точка — «ударение»
    r = size * 0.028
    cx, cy = size * 0.5 + w * 0.5 + size * 0.03, size * 0.5 - h * 0.5
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=fg)
    return img


def solid(size: int, color) -> Image.Image:
    return Image.new("RGBA", (size, size), color)


def main() -> None:
    S = 1024
    # icon-only: фон + знак
    icon = solid(S, TEAL)
    icon.alpha_composite(glyph(S, CREAM, 0.46))
    icon.save(OUT / "icon-only.png")

    # adaptive: знак внутри безопасной зоны (≈ 66% холста)
    glyph(S, CREAM, 0.34).save(OUT / "icon-foreground.png")
    solid(S, TEAL).save(OUT / "icon-background.png")

    # splash 2732×2732: знак по центру
    for name, bg, fg in (("splash.png", (233, 219, 198, 255), TEAL), ("splash-dark.png", INK, MINT)):
        splash = solid(2732, bg)
        splash.alpha_composite(glyph(2732, fg, 0.17))
        splash.save(OUT / name)
    print("assets →", OUT)


if __name__ == "__main__":
    main()
