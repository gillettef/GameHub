# 개척지 앞마당(840x1400, 불투명): 식민지 풍경(era{1..4}.webp) 아래 UI 영역 전체의 바탕 그림.
# 풍경의 땅이 아래로 이어져 화면 쪽으로 다가오는 어두운 땅 — 레골리스·바위 결, 얕은 지층 띠,
# 가장자리 바위와 생물발광 이끼 점, 옅은 포자 안개. 칸·글자·아이콘은 그리지 않는다(UI 는 CSS 로 얹음).
# 가독성: 가운데(좌우 6% 안쪽)는 어둡고 대비가 낮게 — --text-dim 글자가 패널 없이 놓여도 4.5:1 이상.
# 맨 아래 160px 은 --bg 단색으로 정확히 수렴(CSS 가 그 아래를 background-color 로 잇는다).
import math
import random

from paint import T, Doc, f, glow, mix, rgb, shade

W, H = 840, 1400
FADE_FROM, SOLID = 1000, H - 160  # 이 사이에서 --bg 로 수렴, SOLID 아래는 단색
EDGE = round(W * 0.06)  # 가운데 영역 경계(좌우 50px)

# 땅색: 풍경 맨 아래 줄 평균(약 #121623)에 맞춘 어두운 흙. 모두 T 표 색의 섞음
TOP = mix(mix(T['bg'], T['prod'], 0.03), T['surface'], 0.18)   # 풍경과 맞닿는 맨 위 줄
SOIL = mix(mix(T['bg'], T['prod'], 0.14), T['surface'], 0.2)   # 가까운 땅(조금 밝고 따뜻한 레골리스)
DEEP = mix(mix(T['bg'], T['prod'], 0.05), T['bg-elev'], 0.3)    # 지층 그늘
ROCK = mix(mix(T['border'], T['prod'], 0.2), T['bg'], 0.35)     # 바위 몸통(어둡게)
MOSS = (T['symbiont'], T['symbiont-2'], mix(T['symbiont'], T['ark'], 0.4))


def persp(y):
    """화면 쪽으로 다가올수록 커지는 배율(맨 위 0.5 → 1000px 근처 1.6)"""
    return 0.5 + min(1.0, y / FADE_FROM) * 1.1


def fade(y):
    """디테일 세기: 아래로 갈수록 줄어 FADE_FROM 부근에서 거의 사라짐"""
    return max(0.0, 1 - max(0, y - 200) / (FADE_FROM - 100))


def wave(y0, amp, seed, close=True):
    rnd = random.Random(seed)
    ph = [rnd.uniform(0, 6.28) for _ in range(3)]
    fr = [rnd.uniform(0.8, 2.2) * (k + 1) for k in range(3)]
    pts = [(-20 + i * 21, y0 + sum(math.sin((-20 + i * 21) / W * math.pi * fr[k] + ph[k]) * amp / (k + 1) for k in range(3))) for i in range(43)]
    d = f'M{pts[0][0]} {f(pts[0][1])}'
    for a, b in zip(pts, pts[1:]):
        d += f'Q{f(a[0])} {f(a[1])} {f((a[0] + b[0]) / 2)} {f((a[1] + b[1]) / 2)}'
    return d + (f'L{W + 20} {H + 20}L-20 {H + 20}Z' if close else '')


def strata(d):
    """얕은 지층 띠: 원근으로 아래로 갈수록 간격이 벌어진다. 띠 윗선에 아주 옅은 결"""
    out = []
    ys = [70, 130, 210, 310, 440, 600, 790]
    for k, y in enumerate(ys):
        a = fade(y)
        top = mix(SOIL, DEEP, 0.15 + 0.35 * (k % 2))
        g = d.lin([(0, top, 0.55 * a), (0.4, DEEP, 0.35 * a), (1, DEEP, 0)], 0, 0, 0, 1)
        out.append(f'<path d="{wave(y, 6 + k * 2.5, 500 + k)}" fill="{g}"/>')
        out.append(f'<path d="{wave(y, 6 + k * 2.5, 500 + k, False)}" stroke="{mix(SOIL, T["prod"], 0.12)}" stroke-width="{f(1.2 + k * 0.4)}" fill="none" opacity="{f(0.5 * a)}"/>')
    return ''.join(out)


def regolith(d, seed):
    """레골리스 결: 흐린 얼룩 + 가로 붓 자국 + 자갈. 가운데는 땅색에 가까운 낮은 대비"""
    rnd = random.Random(seed)
    b1, b2 = d.blur(14), d.blur(4)
    out = []
    for _ in range(60):
        y = rnd.uniform(0, FADE_FROM)
        s, a = persp(y), fade(y)
        c = rnd.choice([mix(SOIL, T['prod'], 0.1), DEEP, mix(SOIL, T['surface-2'], 0.4), mix(SOIL, T['symbiont'], 0.08)])
        rx = rnd.uniform(50, 160) * s
        out.append(f'<ellipse cx="{f(rnd.uniform(-40, W + 40))}" cy="{f(y)}" rx="{f(rx)}" ry="{f(rx * rnd.uniform(0.1, 0.2))}" fill="{c}" opacity="{f(rnd.uniform(0.3, 0.55) * a)}" filter="{b1}"/>')
    for _ in range(220):
        y = rnd.uniform(0, FADE_FROM)
        s, a = persp(y), fade(y)
        x = rnd.uniform(-20, W)
        c = rnd.choice([mix(SOIL, T['prod'], 0.15), mix(SOIL, T['border'], 0.3), DEEP, DEEP])
        out.append(f'<path d="M{f(x)} {f(y)}q{f(rnd.uniform(8, 24) * s)} {f(rnd.uniform(-2, 2))} {f(rnd.uniform(20, 50) * s)} 0" stroke="{c}" stroke-width="{f(rnd.uniform(1.5, 3.5) * s)}" stroke-linecap="round" opacity="{f(rnd.uniform(0.2, 0.4) * a)}" filter="{b2}"/>')
    for _ in range(170):
        y = rnd.uniform(10, FADE_FROM - 40)
        s, a = persp(y), fade(y)
        x = rnd.uniform(0, W)
        r = rnd.uniform(1.2, 3.6) * s
        out.append(f'<ellipse cx="{f(x + r * 0.5)}" cy="{f(y + r * 0.4)}" rx="{f(r * 1.3)}" ry="{f(r * 0.45)}" fill="{T["bg"]}" opacity="{f(0.5 * a)}"/>')
        out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(r)}" ry="{f(r * 0.7)}" fill="{mix(ROCK, SOIL, rnd.uniform(0.35, 0.7))}" opacity="{f(0.7 * a)}"/>')
    return ''.join(out)


def rock(d, x, y, s, flip, seed):
    """가장자리 바위: 화면 밖으로 반쯤 걸친 덩이, 윗면에 키 라이트, 이끼 점"""
    rnd = random.Random(seed)
    w, h = rnd.uniform(120, 170) * s, rnd.uniform(60, 95) * s
    body = d.lin([(0, mix(ROCK, '#ffffff', 0.05)), (0.45, ROCK), (1, shade(ROCK, 0.6))], 0, 0, 0.4, 1)
    pts = []
    n = 9
    for k in range(n + 1):
        t = k / n
        a = math.pi * t
        rr = rnd.uniform(0.8, 1.05)
        pts.append((x + flip * (-w * 0.5 + w * (1 - math.cos(a)) / 2 * rr), y - math.sin(a) * h * rr))
    dd = f'M{f(pts[0][0])} {f(y)}' + ''.join(f'L{f(px)} {f(py)}' for px, py in pts) + 'Z'
    out = [f'<ellipse cx="{f(x + flip * w * 0.15)}" cy="{f(y + 3 * s)}" rx="{f(w * 0.75)}" ry="{f(h * 0.18)}" fill="{T["bg"]}" opacity="0.6"/>']
    out.append(f'<path d="{dd}" fill="{body}"/>')
    # 윗면 하이라이트(가장자리에만 있으므로 조금 밝아도 됨)
    out.append(f'<path d="M{f(pts[2][0])} {f(pts[2][1] + 2)}Q{f(pts[4][0])} {f(pts[4][1] - 2)} {f(pts[6][0])} {f(pts[6][1] + 3)}" stroke="{mix(ROCK, T["accent"], 0.25)}" stroke-width="{f(2 * s)}" fill="none" stroke-linecap="round" opacity="0.45"/>')
    out.append(f'<path d="M{f(x)} {f(y - h * 0.3)}l{f(flip * w * 0.2)} {f(-h * 0.2)}" stroke="{shade(ROCK, 0.7)}" stroke-width="{f(1.4 * s)}" opacity="0.6"/>')
    # 이끼 점: 바위 아래쪽 둘레
    for _ in range(rnd.randint(4, 8)):
        mx = x + flip * rnd.uniform(-w * 0.3, w * 0.55)
        mx = min(mx, EDGE - 6) if flip > 0 else max(mx, W - EDGE + 6)  # 밝은 이끼는 가장자리 안에만
        my = y - rnd.uniform(0, h * 0.35)
        c = rnd.choice(MOSS)
        rr = rnd.uniform(1.6, 3.2) * s
        out.append(glow(d, mx, my, rr * 4, c, 0.35) + f'<circle cx="{f(mx)}" cy="{f(my)}" r="{f(rr)}" fill="{mix(c, "#ffffff", 0.3)}" opacity="0.85"/>')
    return ''.join(out)


def edges(d):
    """좌우 가장자리: 바위·이끼 덩굴. 가운데 영역 침범은 최소(바위 몸통은 어둡다)"""
    out = []
    spots = [(4, 140, 0.7, 1), (W - 4, 260, 0.75, -1), (8, 470, 0.9, 1), (W - 6, 620, 0.95, -1),
             (6, 810, 1.0, 1), (W - 4, 950, 1.0, -1)]
    for i, (x, y, s, flip) in enumerate(spots):
        out.append(rock(d, x, y, s, flip, 900 + i))
    rnd = random.Random(77)
    # 가장자리 이끼 띠(좌우 0~60px)
    for _ in range(70):
        side = rnd.random() < 0.5
        y = rnd.uniform(30, FADE_FROM + 60)
        x = rnd.uniform(0, 56) if side else W - rnd.uniform(0, 56)
        c = rnd.choice(MOSS)
        r = rnd.uniform(1, 2.4) * persp(y) * 0.8
        a = 0.4 + 0.5 * fade(y)
        out.append(glow(d, x, y, r * 4.5, c, 0.3 * a) + f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{c}" opacity="{f(0.75 * a)}"/>')
    return ''.join(out)


def specks(d):
    """가운데 영역의 아주 옅은 이끼 점(대비 낮게)"""
    rnd = random.Random(31)
    out = []
    for _ in range(46):
        y = rnd.uniform(40, FADE_FROM - 80)
        x = rnd.uniform(EDGE + 10, W - EDGE - 10)
        c = rnd.choice(MOSS)
        r = rnd.uniform(0.8, 1.5) * persp(y) * 0.8
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{mix(c, SOIL, 0.55)}" opacity="{f(0.45 * fade(y) + 0.1)}"/>')
    return ''.join(out)


def spore_haze(d):
    b = d.blur(26)
    rnd = random.Random(12)
    out = []
    for _ in range(8):
        y = rnd.uniform(60, FADE_FROM - 60)
        out.append(f'<ellipse cx="{f(rnd.uniform(0, W))}" cy="{f(y)}" rx="{f(rnd.uniform(140, 280))}" ry="{f(rnd.uniform(16, 34))}" fill="{rnd.choice([T["symbiont"], T["ring2"], T["ark"]])}" opacity="{f(rnd.uniform(0.03, 0.06))}" filter="{b}"/>')
    return ''.join(out)


def yard_doc():
    d = Doc(W, H, prefix='yd')
    pf = d.paint_filter(disp=3, streak=0.16, freq=0.02, brush='0.035 0.07', seed=41)
    base = d.lin([(0, TOP), (40 / H, TOP), (300 / H, SOIL), (700 / H, mix(SOIL, DEEP, 0.4)), (FADE_FROM / H, mix(DEEP, T['bg'], 0.4)), (SOLID / H, T['bg']), (1, T['bg'])], 0, 0, 0, 1)
    body = [f'<rect x="-20" y="-20" width="{W + 40}" height="{H + 40}" fill="{base}"/>']
    body.append(strata(d))
    body.append(regolith(d, 7))
    body.append(spore_haze(d))
    body.append(specks(d))
    body.append(edges(d))
    d.add(f'<g filter="{pf}">{"".join(body)}</g>')
    # 좌우 가장자리 어둠(풍경 비네트와 같은 결)
    side = d.lin([(0, T['bg'], 0.5), (0.08, T['bg'], 0), (0.92, T['bg'], 0), (1, T['bg'], 0.5)], 0, 0, 1, 0)
    d.add(f'<rect width="{W}" height="{H}" fill="{side}"/>')
    # 맨 위 40px: 풍경 맨 아래 줄과 이음매 없이(붓결 없이 땅색으로 시작)
    d.add(f'<rect width="{W}" height="40" fill="{d.lin([(0, TOP, 1), (0.6, TOP, 0.6), (1, TOP, 0)])}"/>')
    # 아래로 --bg 로 수렴: FADE_FROM → SOLID 그라데이션, 그 아래는 단색
    d.add(f'<rect y="{FADE_FROM}" width="{W}" height="{SOLID - FADE_FROM}" fill="{d.lin([(0, T["bg"], 0), (1, T["bg"], 1)])}"/>')
    d.add(f'<rect y="{SOLID}" width="{W}" height="{H - SOLID}" fill="{T["bg"]}"/>')
    return d


def save(im, out, quality=76):
    """손실 WebP 는 YUV 변환 탓에 --bg(10,15,31)를 정확히 낼 수 없다(디코드하면 10,14,31).
    그래서 손실 q76 으로 한 번 압축·복원해 잡음을 걷어낸 뒤, 맨 아래 160px 을 --bg 로 정확히 덮고
    무손실 WebP 로 저장한다(복원본은 매끈해서 무손실로도 작다)."""
    import io
    from PIL import Image
    buf = io.BytesIO()
    im.convert('RGB').save(buf, 'WEBP', quality=quality, method=6)
    buf.seek(0)
    im = Image.open(buf).convert('RGB')
    im.paste(Image.new('RGB', (W, H - SOLID), rgb(T['bg'])), (0, SOLID))
    im.save(out, 'WEBP', lossless=True, quality=100, method=6)
