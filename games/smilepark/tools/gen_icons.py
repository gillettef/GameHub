"""public/icon.svg 와 같은 도안으로 PWA/앱 아이콘 PNG 를 생성한다. (python tools/gen_icons.py)

필요: Pillow (pip install pillow). SVG 렌더러 없이 같은 도형(128x128 좌표계)을 직접 그린다.
icon.svg 도안을 바꾸면 아래 draw_face() 도 함께 고칠 것.

생성물 (public/):
- icon-192.png, icon-512.png       : purpose "any"  (둥근 모서리, 투명 배경)
- icon-maskable-512.png            : purpose "maskable" (전체 배경, 안전 영역 80% 안에 얼굴)
- apple-touch-icon.png (180x180)   : iOS 홈 화면 (불투명, iOS가 모서리를 깎음)
"""
from PIL import Image, ImageDraw

BG = '#1b1640'
FACE = '#ffd54a'
SS = 4  # 슈퍼샘플링 배율 (가장자리 부드럽게)


def quad(p0, p1, p2, n=48):
    """2차 베지어 곡선 점 목록"""
    pts = []
    for i in range(n + 1):
        t = i / n
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
        pts.append((x, y))
    return pts


def draw_face(d: ImageDraw.ImageDraw, size: int, scale: float):
    """icon.svg 의 얼굴: 원(r40) + 눈 2개(r5) + 웃는 입(M44 74 q20 22 40 0, 두께 6)"""
    u = size / 128 * scale
    off = size * (1 - scale) / 2

    def P(x, y):
        return (off + x * u, off + y * u)

    def circle(cx, cy, r, fill):
        x, y = P(cx, cy)
        d.ellipse([x - r * u, y - r * u, x + r * u, y + r * u], fill=fill)

    circle(64, 64, 40, FACE)
    circle(50, 56, 5, BG)
    circle(78, 56, 5, BG)
    pts = [P(x, y) for x, y in quad((44, 74), (64, 96), (84, 74))]
    w = 6 * u
    d.line(pts, fill=BG, width=round(w), joint='curve')
    for x, y in (pts[0], pts[-1]):  # 둥근 끝(stroke-linecap: round)
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=BG)


def render(size: int, *, rounded: bool, scale: float = 1.0, opaque: bool = False) -> Image.Image:
    big = size * SS
    img = Image.new('RGBA', (big, big), BG if opaque else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, big - 1, big - 1], radius=big * 28 / 128, fill=BG)
    else:
        d.rectangle([0, 0, big, big], fill=BG)
    draw_face(d, big, scale)
    out = img.resize((size, size), Image.LANCZOS)
    return out.convert('RGB') if opaque else out


if __name__ == '__main__':
    render(192, rounded=True).save('public/icon-192.png', optimize=True)
    render(512, rounded=True).save('public/icon-512.png', optimize=True)
    # maskable: 런처가 원/둥근사각형 등으로 잘라내므로 배경을 꽉 채우고 얼굴을 안전 영역(지름 80%) 안에 둔다
    render(512, rounded=False, scale=0.82, opaque=True).save('public/icon-maskable-512.png', optimize=True)
    render(180, rounded=False, scale=0.9, opaque=True).save('public/apple-touch-icon.png', optimize=True)
    print('icons: public/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png')
