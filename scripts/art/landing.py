# 홈 히어로 회화 3장(800x720 = viewBox 400x360 의 2배). LandingHero.tsx 가 <image> 로 겹쳐 깐다.
#   sky   — 불투명 노을 밤하늘(성운·별)
#   planet— 투명 바탕 고리 행성 + 작은 달(중심 524,236 r128) — 지평선 뒤에서 떠오르는 층
#   ground— 투명 바탕 지평선·능선·생물발광 계곡·정착지 불빛(지평선 꼭대기 400,488). 착륙선은 코드가 얹는다
import math
import random

from paint import T, Doc, dome, f, glow, mix, plant, shade

W, H = 800, 720


def _hill(y0, amp, seed, waves=3, peak=None):
    rnd = random.Random(seed)
    ph = [rnd.uniform(0, 6.28) for _ in range(waves)]
    fr = [rnd.uniform(0.6, 2.2) * (k + 1) for k in range(waves)]
    pts = []
    for i in range(41):
        x = -20 + i * 21
        y = y0 + sum(math.sin(x / W * math.pi * fr[k] + ph[k]) * amp / (k + 1) for k in range(waves))
        if peak:
            y -= peak * math.exp(-((x - 400) / 220) ** 2)
        pts.append((x, y))
    d = f'M{pts[0][0]} {f(pts[0][1])}'
    for a, b in zip(pts, pts[1:]):
        d += f'Q{f(a[0])} {f(a[1])} {f((a[0] + b[0]) / 2)} {f((a[1] + b[1]) / 2)}'
    return d + f'L{W + 20} {H + 20}L-20 {H + 20}Z'


def sky():
    d = Doc(W, H, prefix='ls')
    rnd = random.Random(3)
    g = d.lin([(0, '#070b1e'), (0.45, '#1a1a44'), (0.72, '#4a2f5c'), (0.9, '#9a5a5c'), (1, '#e0985e')])
    pf = d.paint_filter(disp=3, streak=0.3, freq=0.02, brush='0.012 0.07', seed=2)
    body = [f'<rect width="{W}" height="{H}" fill="{g}"/>']
    b = d.blur(30)
    for c, a, x, y, rx, ry in [(T['ring2'], 0.25, 220, 160, 260, 70), (T['synth'], 0.16, 600, 300, 240, 60), (T['symbiont'], 0.12, 160, 330, 220, 50), ('#e0985e', 0.3, 400, 470, 420, 70)]:
        body.append(f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="{c}" opacity="{a}" filter="{b}" transform="rotate(-12 {x} {y})"/>')
    for _ in range(170):
        y = rnd.uniform(0, 420) ** 1.2 / 420 ** 0.2
        r = rnd.choice([0.8, 1, 1.3, 1.8, 2.4])
        body.append(f'<circle cx="{f(rnd.uniform(0, W))}" cy="{f(y)}" r="{r}" fill="#ffffff" opacity="{f(rnd.uniform(0.3, 0.95) * (1 - y / 520))}"/>')
    d.add(f'<g filter="{pf}">{"".join(body)}</g>')
    return d


def planet():
    d = Doc(W, H, prefix='lp')
    cx, cy, r = 524, 236, 128
    body = '#b9806a'
    pf = d.paint_filter(disp=2.5, streak=0.35, freq=0.03, brush='0.03 0.2', seed=4)
    clip = d.id('c')
    d.defs.append(f'<clipPath id="{clip}"><circle cx="{cx}" cy="{cy}" r="{r}"/></clipPath>')
    rg = d.lin([(0, '#f4c56a', 0.15), (0.5, '#ffe9b8', 0.9), (1, '#f4c56a', 0.15)], 0, 0, 1, 0)
    ring = lambda sweep: f'<path d="M{cx - r * 2.1} {cy}A{r * 2.1} {r * 0.42} 0 0 {sweep} {cx + r * 2.1} {cy}" stroke="{rg}" stroke-width="{r * 0.17}" fill="none" transform="rotate(-18 {cx} {cy})"/>'  # noqa: E731
    sphere = d.rad([(0, '#ffe2c4'), (0.35, body), (0.8, shade(body, .5)), (1, '#1a1430')], 0.32, 0.3, 0.8)
    bands = []
    rnd = random.Random(8)
    b = d.blur(4)
    for k in range(-5, 6):
        bands.append(f'<ellipse cx="{cx}" cy="{f(cy + k * r * 0.17 + rnd.uniform(-4, 4))}" rx="{r * 1.1}" ry="{f(rnd.uniform(5, 12))}" fill="{rnd.choice(["#8a5a5a", "#e8b890", "#6a4a5a", "#d49a7a"])}" opacity="0.4" filter="{b}" transform="rotate(-18 {cx} {cy})"/>')
    shade_ov = d.rad([(0, '#000', 0), (0.55, '#000', 0), (1, '#0a0820', 0.75)], 0.3, 0.28, 0.85)
    inner = (glow(d, cx, cy, r * 2, '#9cc2ff', 0.25) + ring(1) +
             f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{sphere}"/><g clip-path="url(#{clip})">{"".join(bands)}<circle cx="{cx}" cy="{cy}" r="{r}" fill="{shade_ov}"/></g>' + ring(0))
    moon = d.rad([(0, '#f5ecdf'), (0.7, '#9a90a8'), (1, '#3a3450')], 0.35, 0.35, 0.8)
    inner += f'<circle cx="250" cy="120" r="22" fill="{moon}"/>' + glow(d, 250, 120, 40, '#dfe9ff', 0.2)
    d.add(f'<g filter="{pf}">{inner}</g>')
    return d


def ground():
    d = Doc(W, H, prefix='lg')
    pf = d.paint_filter(disp=3, streak=0.32, freq=0.02, brush='0.02 0.08', seed=6)
    body = []
    body.append(glow(d, 400, 470, 380, '#e0985e', 0.35))
    for k, (c, y0, amp, pk) in enumerate([('#5a4a6e', 430, 30, 0), ('#3e3658', 462, 18, 0), ('#2a2a40', 500, 10, 14)]):
        g = d.lin([(0, mix(c, '#e0985e', 0.3 - k * 0.1)), (1, shade(c, .3))])
        body.append(f'<path d="{_hill(y0, amp, 20 + k, 4, pk)}" fill="{g}"/>')
    # 계곡 바닥: 어두운 땅 + 생물발광 강
    g = d.lin([(0, '#3a3440'), (0.4, '#22202e'), (1, '#0e1020')])
    body.append(f'<path d="{_hill(512, 8, 31, 3, 26)}" fill="{g}"/>')
    b = d.blur(6)
    river = 'M400 500Q360 540 300 560T120 640T-20 720'
    body.append(f'<path d="{river}" stroke="{T["symbiont"]}" stroke-width="22" fill="none" opacity="0.25" filter="{b}"/><path d="{river}" stroke="{mix(T["symbiont"], "#ffffff", .3)}" stroke-width="3" fill="none" opacity="0.6"/>')
    river2 = 'M410 500Q470 560 560 590T820 680'
    body.append(f'<path d="{river2}" stroke="{T["ark"]}" stroke-width="16" fill="none" opacity="0.2" filter="{b}"/><path d="{river2}" stroke="{T["ark-2"]}" stroke-width="2" fill="none" opacity="0.45"/>')
    # 정착지 불빛(착륙지 양옆의 돔들)
    for x, y, r in [(300, 500, 16), (330, 506, 10), (500, 500, 14), (530, 508, 9), (250, 512, 8)]:
        body.append(dome(d, x, y, r, r * 0.8, '#8d98b4', glass=T['accent']) + glow(d, x, y - r * 0.4, r * 2.2, T['accent'], 0.4))
    rnd = random.Random(12)
    for _ in range(40):
        x, y = rnd.uniform(0, W), rnd.uniform(530, H)
        if abs(x - 400) < 80 and y < 600:
            continue
        s = 0.6 + (y - 520) / 200
        body.append(plant(d, x, y, 16 * s, rnd.choice([T['symbiont'], T['symbiont-2'], T['ark'], T['synth']]), rnd.randint(0, 999)))
    for x, flip in [(-10, 1), (W + 10, -1)]:
        body.append(f'<path d="M{x} {H}Q{x + flip * 20} 560 {x + flip * 110} 590Q{x + flip * 170} 640 {x + flip * 190} {H}Z" fill="{d.lin([(0, "#1e1a2c"), (1, "#0a0c18")])}"/>')
    d.add(f'<g filter="{pf}">{"".join(body)}</g>')
    return d
