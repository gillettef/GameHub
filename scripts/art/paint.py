# 회화풍 SVG 도우미: 그라데이션·조명·붓결 필터로 그림을 그리고, 헤드리스 Chrome 으로 구워 WebP 로 저장한다.
# 런타임이 아니라 굽는 용도라 무거운 필터를 써도 된다. 색은 src/ui/styles/tokens.css 값에 맞춘다.
import math
import os
import random
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT / 'scripts' / 'art' / 'src'
TMP_DIR = Path(os.environ.get('NT_ART_TMP', ROOT / 'scripts' / 'art' / '.tmp'))
CHROME = os.environ.get('NT_CHROME', r'C:\Program Files\Google\Chrome\Application\chrome.exe')

# tokens.css 값(바꾸면 다시 굽는다)
T = {
    'bg': '#0a0f1f', 'bg-elev': '#10172b', 'surface': '#161f38', 'surface-2': '#1f2a48', 'border': '#33406a',
    'text': '#e9edf8', 'text-dim': '#a6afcb', 'accent': '#f4c56a',
    'danger': '#ff7a7a', 'ok': '#5fd88f', 'warn': '#ffb550',
    'ark': '#9cc2ff', 'symbiont': '#3fe3b8', 'synth': '#ff6cb0',
    'ark-2': '#dfe9ff', 'symbiont-2': '#b6ff7a', 'synth-2': '#ff9a4a',
    'ring1': '#a9b6d6', 'ring2': '#b996ff', 'ring3': '#ffd67a',
    'food': '#a3e06c', 'prod': '#e7a768', 'energy': '#ffe36b', 'sci': '#74bdff', 'culture': '#e595ff',
}
WARM = '#ffd9a0'  # 등불·노을 키 라이트
COOL = '#2a3560'  # 하늘 반사 그늘


def rgb(c):
    c = c.lstrip('#')
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def hexc(r, g, b):
    return '#%02x%02x%02x' % tuple(max(0, min(255, round(v))) for v in (r, g, b))


def mix(a, b, t):
    ra, rb = rgb(a), rgb(b)
    return hexc(*[ra[i] + (rb[i] - ra[i]) * t for i in range(3)])


def lit(c, t=0.3):
    """키 라이트 쪽: 밝고 따뜻하게"""
    return mix(mix(c, '#ffffff', t * 0.6), WARM, t * 0.5)


def shade(c, t=0.45):
    """그늘 쪽: 어둡고 푸르게"""
    return mix(mix(c, '#000000', t * 0.7), COOL, t * 0.45)


def f(v):
    return ('%.1f' % v).rstrip('0').rstrip('.')


class Doc:
    """그라데이션 id 를 겹치지 않게 만들며 SVG 를 쌓는다"""

    def __init__(self, w, h, prefix='a'):
        self.w, self.h = w, h
        self.defs = []
        self.body = []
        self.n = 0
        self.p = prefix

    def id(self, k='g'):
        self.n += 1
        return f'{self.p}{k}{self.n}'

    def _stops(self, stops):
        out = []
        for s in stops:
            o, c = s[0], s[1]
            a = s[2] if len(s) > 2 else 1
            out.append(f'<stop offset="{f(o)}" stop-color="{c}" stop-opacity="{f(a) if a != 1 else 1}"/>')
        return ''.join(out)

    def lin(self, stops, x1=0, y1=0, x2=0, y2=1, user=None):
        i = self.id('l')
        u = ''
        if user:
            x1, y1, x2, y2 = user
            u = ' gradientUnits="userSpaceOnUse"'
        self.defs.append(f'<linearGradient id="{i}" x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}"{u}>{self._stops(stops)}</linearGradient>')
        return f'url(#{i})'

    def rad(self, stops, cx=0.5, cy=0.5, r=0.5, fx=None, fy=None, user=False):
        i = self.id('r')
        ff = ''
        if fx is not None:
            ff = f' fx="{f(fx)}" fy="{f(fy)}"'
        u = ' gradientUnits="userSpaceOnUse"' if user else ''
        self.defs.append(f'<radialGradient id="{i}" cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}"{ff}{u}>{self._stops(stops)}</radialGradient>')
        return f'url(#{i})'

    def blur(self, sd):
        i = self.id('b')
        self.defs.append(f'<filter id="{i}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="{f(sd)}"/></filter>')
        return f'url(#{i})'

    def paint_filter(self, disp=2.2, streak=0.32, freq=0.035, brush='0.018 0.14', seed=1):
        """붓결: 가장자리를 살짝 흔들고(displacement) 가로 붓 자국 결을 soft-light 로 얹는다"""
        i = self.id('pf')
        self.defs.append(
            f'<filter id="{i}" x="-4%" y="-4%" width="108%" height="108%" color-interpolation-filters="sRGB">'
            f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="2" seed="{seed}" result="warp"/>'
            f'<feDisplacementMap in="SourceGraphic" in2="warp" scale="{f(disp)}" xChannelSelector="R" yChannelSelector="G" result="w"/>'
            f'<feTurbulence type="fractalNoise" baseFrequency="{brush}" numOctaves="3" seed="{seed + 7}" result="br"/>'
            f'<feColorMatrix in="br" type="saturate" values="0" result="bg"/>'
            f'<feComponentTransfer in="bg" result="bc"><feFuncR type="linear" slope="1.6" intercept="-0.3"/><feFuncG type="linear" slope="1.6" intercept="-0.3"/><feFuncB type="linear" slope="1.6" intercept="-0.3"/><feFuncA type="linear" slope="0" intercept="{f(streak)}"/></feComponentTransfer>'
            f'<feComposite in="bc" in2="w" operator="in" result="bm"/>'
            f'<feBlend in="bm" in2="w" mode="soft-light"/>'
            f'</filter>'
        )
        return f'url(#{i})'

    def add(self, s):
        self.body.append(s)

    def svg(self, extra_attr=''):
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" viewBox="0 0 {self.w} {self.h}"{extra_attr}>'
            f'<defs>{"".join(self.defs)}</defs>{"".join(self.body)}</svg>'
        )


# ───────────── 기본 도형(모두 문자열을 돌려줌) ─────────────

def glow(d, cx, cy, r, c, a=0.6):
    g = d.rad([(0, c, a), (0.45, c, a * 0.35), (1, c, 0)])
    return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}"/>'


def shadow(d, cx, cy, rx, ry, a=0.55):
    g = d.rad([(0, '#05070f', a), (0.6, '#05070f', a * 0.5), (1, '#05070f', 0)])
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{g}"/>'


def block(d, x, base, w, h, dep, c, roof=None, win=None, win_rows=1, win_cols=3):
    """2.5D 상자: 앞면(키 라이트), 오른쪽 옆면(그늘), 윗면. 창문은 빛나는 색"""
    dy = dep * 0.5
    front = d.lin([(0, lit(c, 0.25)), (1, mix(c, '#000000', 0.1))], 0, 0, 0, 1)
    side = d.lin([(0, shade(c, 0.4)), (1, shade(c, 0.6))], 0, 0, 0, 1)
    top = d.lin([(0, lit(roof or c, 0.45)), (1, lit(roof or c, 0.2))], 0, 0, 1, 0)
    s = [
        f'<polygon points="{f(x + w)},{f(base)} {f(x + w + dep)},{f(base - dy)} {f(x + w + dep)},{f(base - h - dy)} {f(x + w)},{f(base - h)}" fill="{side}"/>',
        f'<rect x="{f(x)}" y="{f(base - h)}" width="{f(w)}" height="{f(h)}" fill="{front}"/>',
        f'<polygon points="{f(x)},{f(base - h)} {f(x + w)},{f(base - h)} {f(x + w + dep)},{f(base - h - dy)} {f(x + dep)},{f(base - h - dy)}" fill="{top}"/>',
        f'<line x1="{f(x)}" y1="{f(base - h)}" x2="{f(x + w)}" y2="{f(base - h)}" stroke="{lit(c, 0.7)}" stroke-width="1.2" opacity="0.7"/>',
    ]
    if win:
        ww = w / (win_cols * 1.8 + 0.8)
        wh = min(h / (win_rows * 2.2 + 0.4), ww * 1.3)
        for r in range(win_rows):
            for k in range(win_cols):
                wx = x + ww * 0.8 + k * ww * 1.8
                wy = base - h + (h - win_rows * wh * 2.2) / 2 + r * wh * 2.2 + wh * 0.6
                s.append(window(d, wx, wy, ww, wh, win))
    return ''.join(s)


def window(d, x, y, w, h, c):
    g = d.lin([(0, mix(c, '#ffffff', 0.55)), (1, c)])
    return (glow(d, x + w / 2, y + h / 2, max(w, h) * 1.6, c, 0.35) +
            f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="{f(min(w, h) * 0.25)}" fill="{g}"/>')


def dome(d, cx, base, rx, ry, c, glass=None, ribs=0):
    """반구 지붕. glass 면 반투명 유리 안에 빛"""
    body = d.rad([(0, lit(c, 0.6)), (0.5, c), (1, shade(c, 0.55))], 0.35, 0.3, 0.85)
    s = []
    if glass:
        s.append(f'<path d="M{f(cx - rx)} {f(base)}A{f(rx)} {f(ry)} 0 0 1 {f(cx + rx)} {f(base)}Z" fill="{d.rad([(0, mix(glass, "#ffffff", 0.4), 0.95), (0.6, glass, 0.55), (1, shade(glass, 0.5), 0.75)], 0.4, 0.75, 0.8)}"/>')
        s.append(f'<path d="M{f(cx - rx)} {f(base)}A{f(rx)} {f(ry)} 0 0 1 {f(cx + rx)} {f(base)}" fill="none" stroke="{lit(c, 0.4)}" stroke-width="2.4"/>')
        for k in range(1, 4):
            t = k / 4
            s.append(f'<path d="M{f(cx - rx + 2 * rx * t)} {f(base)}Q{f(cx - rx * 0.6 + 1.2 * rx * t)} {f(base - ry * 1.15)} {f(cx)} {f(base - ry)}" fill="none" stroke="{lit(c, 0.3)}" stroke-width="1.1" opacity="0.6"/>')
        s.append(f'<ellipse cx="{f(cx - rx * 0.35)}" cy="{f(base - ry * 0.62)}" rx="{f(rx * 0.22)}" ry="{f(ry * 0.14)}" fill="#ffffff" opacity="0.45" transform="rotate(-25 {f(cx - rx * 0.35)} {f(base - ry * 0.62)})"/>')
    else:
        s.append(f'<path d="M{f(cx - rx)} {f(base)}A{f(rx)} {f(ry)} 0 0 1 {f(cx + rx)} {f(base)}Z" fill="{body}"/>')
        for k in range(ribs):
            t = (k + 1) / (ribs + 1)
            s.append(f'<path d="M{f(cx - rx + 2 * rx * t)} {f(base)}Q{f(cx - rx * 0.5 + rx * t)} {f(base - ry * 1.05)} {f(cx)} {f(base - ry)}" fill="none" stroke="{shade(c, 0.3)}" stroke-width="1.2" opacity="0.6"/>')
        s.append(f'<ellipse cx="{f(cx - rx * 0.35)}" cy="{f(base - ry * 0.6)}" rx="{f(rx * 0.25)}" ry="{f(ry * 0.16)}" fill="{lit(c, 0.9)}" opacity="0.55" transform="rotate(-25 {f(cx - rx * 0.35)} {f(base - ry * 0.6)})"/>')
    s.append(f'<ellipse cx="{f(cx)}" cy="{f(base)}" rx="{f(rx)}" ry="{f(ry * 0.12)}" fill="{shade(c, 0.5)}"/>')
    return ''.join(s)


def cyl(d, cx, base, w, h, c, cap=True):
    g = d.lin([(0, lit(c, 0.35)), (0.35, lit(c, 0.1)), (0.75, shade(c, 0.35)), (1, shade(c, 0.6))], 0, 0, 1, 0)
    e = w * 0.18
    s = f'<path d="M{f(cx - w / 2)} {f(base - h)}V{f(base)}A{f(w / 2)} {f(e)} 0 0 0 {f(cx + w / 2)} {f(base)}V{f(base - h)}Z" fill="{g}"/>'
    if cap:
        s += f'<ellipse cx="{f(cx)}" cy="{f(base - h)}" rx="{f(w / 2)}" ry="{f(e)}" fill="{lit(c, 0.45)}"/>'
    return s


def cone(d, cx, base, w, h, c, lean=0):
    g = d.lin([(0, lit(c, 0.35)), (0.5, c), (1, shade(c, 0.55))], 0, 0, 1, 0)
    return (f'<path d="M{f(cx - w / 2)} {f(base)}L{f(cx + lean)} {f(base - h)}L{f(cx + w / 2)} {f(base)}Q{f(cx)} {f(base + w * 0.08)} {f(cx - w / 2)} {f(base)}Z" fill="{g}"/>'
            f'<path d="M{f(cx + lean)} {f(base - h)}L{f(cx + w * 0.1)} {f(base + w * 0.04)}" stroke="{shade(c, 0.3)}" stroke-width="1" opacity="0.5"/>')


def smoke(d, x, y, c='#b9bfd3', n=4, s=1.0, seed=0):
    rnd = random.Random(seed)
    b = d.blur(3 * s)
    out = []
    for k in range(n):
        out.append(f'<circle cx="{f(x + rnd.uniform(-4, 6) * s + k * 5 * s)}" cy="{f(y - k * 11 * s)}" r="{f((6 + k * 3) * s)}" fill="{c}" opacity="{f(0.45 - k * 0.08)}" filter="{b}"/>')
    return ''.join(out)


def banner(d, x, top, h, c, w=16, flip=False):
    """깃대와 제비꼬리 깃발"""
    sgn = -1 if flip else 1
    g = d.lin([(0, lit(c, 0.3)), (1, shade(c, 0.35))], 0, 0, 1, 1)
    return (f'<line x1="{f(x)}" y1="{f(top)}" x2="{f(x)}" y2="{f(top + h)}" stroke="#3a2c22" stroke-width="2.2" stroke-linecap="round"/>'
            f'<path d="M{f(x)} {f(top + 2)}Q{f(x + sgn * w * 0.5)} {f(top - 1)} {f(x + sgn * w)} {f(top + 3)}L{f(x + sgn * w * 0.75)} {f(top + 9)}L{f(x + sgn * w)} {f(top + 15)}Q{f(x + sgn * w * 0.5)} {f(top + 12)} {f(x)} {f(top + 15)}Z" fill="{g}"/>'
            f'<circle cx="{f(x)}" cy="{f(top)}" r="1.8" fill="{T["accent"]}"/>')


def plant(d, x, base, h, c, seed=0):
    """생물발광 식물: 휘어진 줄기 끝에 빛 망울"""
    rnd = random.Random(seed)
    out = []
    for k in range(3):
        a = rnd.uniform(-0.5, 0.5)
        tx, ty = x + a * h * 0.8, base - h * rnd.uniform(0.7, 1)
        out.append(f'<path d="M{f(x)} {f(base)}Q{f(x + a * h * 0.2)} {f(base - h * 0.5)} {f(tx)} {f(ty)}" stroke="{shade(c, 0.5)}" stroke-width="1.6" fill="none"/>')
        out.append(glow(d, tx, ty, h * 0.35, c, 0.55))
        out.append(f'<circle cx="{f(tx)}" cy="{f(ty)}" r="{f(h * 0.09)}" fill="{mix(c, "#ffffff", 0.5)}"/>')
    return ''.join(out)


def figure(d, x, base, s, armor, accent, kind='spear', heavy=False, face=1):
    """보병 한 명(키 약 38*s). 갑옷색·면갑 빛 accent"""
    w = (9 if heavy else 7) * s
    h = 38 * s
    leg = d.lin([(0, shade(armor, 0.35)), (1, shade(armor, 0.6))], 0, 0, 1, 0)
    body = d.lin([(0, lit(armor, 0.35)), (0.6, armor), (1, shade(armor, 0.5))], 0, 0, 1, 0)
    out = [shadow(d, x + 3 * s, base, 11 * s, 3 * s, 0.5)]
    out.append(f'<rect x="{f(x - w * 0.55)}" y="{f(base - h * 0.42)}" width="{f(w * 0.48)}" height="{f(h * 0.42)}" rx="{f(1.5 * s)}" fill="{leg}"/>')
    out.append(f'<rect x="{f(x + w * 0.07)}" y="{f(base - h * 0.42)}" width="{f(w * 0.48)}" height="{f(h * 0.42)}" rx="{f(1.5 * s)}" fill="{leg}"/>')
    out.append(f'<path d="M{f(x - w)} {f(base - h * 0.4)}Q{f(x - w * 1.1)} {f(base - h * 0.78)} {f(x - w * 0.6)} {f(base - h * 0.8)}H{f(x + w * 0.6)}Q{f(x + w * 1.1)} {f(base - h * 0.78)} {f(x + w)} {f(base - h * 0.4)}Z" fill="{body}"/>')
    if heavy:
        out.append(f'<ellipse cx="{f(x - w * 0.85)}" cy="{f(base - h * 0.76)}" rx="{f(w * 0.45)}" ry="{f(w * 0.32)}" fill="{lit(armor, 0.3)}"/>')
        out.append(f'<ellipse cx="{f(x + w * 0.85)}" cy="{f(base - h * 0.76)}" rx="{f(w * 0.45)}" ry="{f(w * 0.32)}" fill="{shade(armor, 0.3)}"/>')
    hr = w * 0.62
    hy = base - h * 0.8 - hr * 0.95
    out.append(f'<circle cx="{f(x)}" cy="{f(hy)}" r="{f(hr)}" fill="{d.rad([(0, lit(armor, 0.6)), (1, shade(armor, 0.4))], 0.35, 0.35, 0.8)}"/>')
    out.append(glow(d, x + face * hr * 0.35, hy, hr * 1.4, accent, 0.4))
    out.append(f'<rect x="{f(x - hr * 0.55 + face * hr * 0.3)}" y="{f(hy - hr * 0.15)}" width="{f(hr * 1.1)}" height="{f(hr * 0.32)}" rx="{f(hr * 0.15)}" fill="{mix(accent, "#ffffff", 0.4)}"/>')
    if kind == 'spear':
        out.append(f'<line x1="{f(x + w * 1.05)}" y1="{f(base - h * 0.1)}" x2="{f(x + w * 1.05)}" y2="{f(base - h * 1.25)}" stroke="#5a4636" stroke-width="{f(1.6 * s)}" stroke-linecap="round"/>')
        out.append(f'<path d="M{f(x + w * 1.05)} {f(base - h * 1.42)}l{f(2.4 * s)} {f(6 * s)}h{f(-4.8 * s)}Z" fill="{lit("#c9d3e6", 0.3)}"/>')
    elif kind == 'rifle':
        out.append(f'<line x1="{f(x - w * 0.4)}" y1="{f(base - h * 0.55)}" x2="{f(x + w * 1.6)}" y2="{f(base - h * 0.85)}" stroke="#2b3047" stroke-width="{f(2.4 * s)}" stroke-linecap="round"/>')
        out.append(f'<circle cx="{f(x + w * 1.6)}" cy="{f(base - h * 0.85)}" r="{f(1.3 * s)}" fill="{accent}"/>')
    elif kind == 'shield':
        out.append(f'<line x1="{f(x + w * 1.05)}" y1="{f(base - h * 0.1)}" x2="{f(x + w * 1.05)}" y2="{f(base - h * 1.2)}" stroke="#4b505f" stroke-width="{f(1.6 * s)}"/>')
        sg = d.lin([(0, lit('#c9d3e6', 0.4)), (1, shade('#8d99b8', 0.4))], 0, 0, 1, 1)
        out.append(f'<path d="M{f(x - w * 1.3)} {f(base - h * 0.75)}h{f(w * 1.3)}v{f(h * 0.3)}q0 {f(h * 0.18)} {f(-w * 0.65)} {f(h * 0.26)}q{f(-w * 0.65)} {f(-h * 0.08)} {f(-w * 0.65)} {f(-h * 0.26)}Z" fill="{sg}" stroke="{shade("#8d99b8", 0.5)}" stroke-width="0.8"/>')
        out.append(f'<circle cx="{f(x - w * 0.65)}" cy="{f(base - h * 0.6)}" r="{f(w * 0.25)}" fill="{accent}" opacity="0.85"/>')
    return ''.join(out)


def chrome_shot(html_path: Path, png_path: Path, w: int, h: int):
    png_path.parent.mkdir(parents=True, exist_ok=True)
    if png_path.exists():
        png_path.unlink()
    cmd = [CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
           '--default-background-color=00000000', f'--window-size={w},{h}', f'--screenshot={png_path}',
           '--virtual-time-budget=2000', html_path.resolve().as_uri()]
    subprocess.run(cmd, check=True, capture_output=True, timeout=180)
    if not png_path.exists():
        raise RuntimeError(f'캡처 실패: {png_path}')


def bake(name: str, doc: Doc, out: Path, quality=80, alpha_quality=85, method=6, save=None):
    """SVG 원본을 scripts/art/src 에 저장하고, Chrome 으로 PNG 캡처 → WebP 저장. 바이트 수를 돌려줌
    save(im, out): 저장 방식을 바꿀 때(예: 정확한 색이 필요한 yard 의 무손실 저장)"""
    from PIL import Image

    SRC_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    svg = doc.svg()
    (SRC_DIR / f'{name}.svg').write_text(svg, encoding='utf-8')
    html = TMP_DIR / f'{name}.html'
    html.write_text('<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}svg{display:block}</style></head><body>' + svg + '</body></html>', encoding='utf-8')
    png = TMP_DIR / f'{name}.png'
    chrome_shot(html, png, doc.w, doc.h)
    im = Image.open(png).convert('RGBA')
    if im.size != (doc.w, doc.h):
        im = im.crop((0, 0, doc.w, doc.h))
    out.parent.mkdir(parents=True, exist_ok=True)
    if save:
        save(im, out)
        return out.stat().st_size
    opaque = im.getextrema()[3][0] == 255
    if opaque:
        im.convert('RGB').save(out, 'WEBP', quality=quality, method=method)
    else:
        im.save(out, 'WEBP', quality=quality, alpha_quality=alpha_quality, method=method)
    return out.stat().st_size


def rnd_points_ring(seed, n, cx, cy, rx, ry):
    rnd = random.Random(seed)
    return [(cx + math.cos(a) * rx * rnd.uniform(0.6, 1), cy + math.sin(a) * ry * rnd.uniform(0.6, 1)) for a in [rnd.uniform(0, math.tau) for _ in range(n)]]
