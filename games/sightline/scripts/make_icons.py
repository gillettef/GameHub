"""웹 앱 아이콘(PNG) 생성. 실행: python scripts/make_icons.py → public/icon-180.png, icon-192.png, icon-512.png"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public")
BG = (20, 32, 25)
GOLD = (232, 198, 106)
GARDEN = (223, 233, 211)


def icon(size):
    s = size * 4  # 크게 그린 뒤 줄여 계단 현상을 없앤다
    im = Image.new("RGB", (s, s), BG)
    d = ImageDraw.Draw(im)
    pad = s * 0.17
    # 정원 칸
    d.rounded_rectangle([pad, pad, s - pad, s - pad], radius=s * 0.05, fill=(31, 49, 38))
    # 눈(시선)
    cx, cy = s / 2, s / 2
    w, h = s * 0.30, s * 0.17
    pts_top = [(cx - w + (2 * w) * t / 40, cy - h * (1 - ((t - 20) / 20) ** 2)) for t in range(41)]
    pts_bot = [(cx + w - (2 * w) * t / 40, cy + h * (1 - ((t - 20) / 20) ** 2)) for t in range(41)]
    d.line(pts_top + pts_bot + [pts_top[0]], fill=GOLD, width=int(s * 0.035), joint="curve")
    r = s * 0.085
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GOLD)
    # 시선 점선
    for k in range(4):
        x0 = cx + w + s * 0.03 + k * s * 0.045
        d.line([(x0, cy), (x0 + s * 0.022, cy)], fill=GARDEN, width=int(s * 0.018))
    return im.resize((size, size), Image.LANCZOS)


for n in (180, 192, 512):
    icon(n).save(os.path.join(OUT, f"icon-{n}.png"), optimize=True)
print("icons ok")
