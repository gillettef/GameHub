# 시대별 착륙지 풍경(840x980). 1 착륙지(노을) · 2 정착촌(오로라 밤) · 3 궤도 도시(궤도 고리) · 4 결실(금빛 새벽)
# 빈 터(구조물이 설 자리)는 layout.json 좌표에 굽는다. 시대가 갈수록 길·불빛·지평선 건물이 채워진다.
import math
import random

from paint import T, Doc, block, cyl, dome, f, glow, lit, mix, plant, shade, shadow

W, H = 840, 980
HORIZON = 228

ERA = {
    1: dict(sky=['#141a3a', '#3a2f5c', '#9a5a5c', '#f0a865'], ground=['#6e5a44', '#4a3d34', '#2e2a2e', '#1a1b26'], ridge=['#5a4a66', '#40375a'], haze='#e9a46c', key='#ffcf8a', flora=T['symbiont']),
    2: dict(sky=['#070b1e', '#0f1a3a', '#1b3550', '#2b5a5c'], ground=['#3f4f48', '#2f3a3a', '#222a32', '#151a26'], ridge=['#24364a', '#1b2a3e'], haze='#3fe3b8', key='#bff5e4', flora=T['symbiont']),
    3: dict(sky=['#050818', '#0d1434', '#1d2a5c', '#3d4a8a'], ground=['#3d4258', '#2d3248', '#21253a', '#141828'], ridge=['#2a3260', '#1e2650'], haze='#9cc2ff', key='#d4e3ff', flora=T['ark']),
    4: dict(sky=['#1a1840', '#5a3a6a', '#d47a6a', '#ffd67a'], ground=['#6a6a44', '#4a5038', '#2e3430', '#1a1e24'], ridge=['#6a4a70', '#4a3a60'], haze='#ffd67a', key='#ffe4a0', flora=T['symbiont-2']),
}


def hill(y0, amp, seed, waves=3):
    rnd = random.Random(seed)
    ph = [rnd.uniform(0, 6.28) for _ in range(waves)]
    fr = [rnd.uniform(0.6, 2.4) * (k + 1) for k in range(waves)]
    pts = []
    for i in range(43):
        x = -20 + i * 21
        y = y0 + sum(math.sin(x / W * math.pi * fr[k] + ph[k]) * amp / (k + 1) for k in range(waves))
        pts.append((x, y))
    d = f'M{pts[0][0]} {f(pts[0][1])}'
    for a, b in zip(pts, pts[1:]):
        d += f'Q{f(a[0])} {f(a[1])} {f((a[0] + b[0]) / 2)} {f((a[1] + b[1]) / 2)}'
    return d + f'L{W + 20} {H + 20}L-20 {H + 20}Z'


def stars(d, n, seed, ymax):
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        x, y = rnd.uniform(0, W), rnd.uniform(0, ymax) ** 1.15 / ymax ** 0.15
        r = rnd.choice([0.8, 1, 1.2, 1.6, 2.2])
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{r}" fill="#ffffff" opacity="{f(rnd.uniform(0.35, 0.95) * (1 - y / ymax * 0.8))}"/>')
        if r > 2:
            out.append(glow(d, x, y, 7, T['ark-2'], 0.4))
    return ''.join(out)


def nebula(d, blobs, seed):
    rnd = random.Random(seed)
    b = d.blur(28)
    out = []
    for c, a in blobs:
        out.append(f'<ellipse cx="{f(rnd.uniform(60, W - 60))}" cy="{f(rnd.uniform(20, HORIZON - 70))}" rx="{f(rnd.uniform(120, 260))}" ry="{f(rnd.uniform(30, 70))}" fill="{c}" opacity="{a}" filter="{b}" transform="rotate({f(rnd.uniform(-18, 8))} 420 120)"/>')
    return ''.join(out)


def ringed_planet(d, cx, cy, r, body, ring, tilt=-16):
    g = d.rad([(0, mix(body, '#ffffff', .35)), (0.55, body), (1, shade(body, .7))], 0.32, 0.3, 0.85)
    bands = ''.join(f'<ellipse cx="{f(cx)}" cy="{f(cy + k * r * 0.22)}" rx="{f(r * 0.98)}" ry="{f(r * 0.06)}" fill="{shade(body, .2)}" opacity="0.35"/>' for k in (-2, -1, 1, 2))
    clip = d.id('c')
    d.defs.append(f'<clipPath id="{clip}"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}"/></clipPath>')
    rg = d.lin([(0, ring, 0.2), (0.5, mix(ring, '#ffffff', .3), 0.85), (1, ring, 0.2)], 0, 0, 1, 0)
    back = f'<path d="M{f(cx - r * 2)} {f(cy)}A{f(r * 2)} {f(r * 0.45)} 0 0 1 {f(cx + r * 2)} {f(cy)}" stroke="{rg}" stroke-width="{f(r * 0.16)}" fill="none" transform="rotate({tilt} {f(cx)} {f(cy)})" opacity="0.7"/>'
    front = f'<path d="M{f(cx - r * 2)} {f(cy)}A{f(r * 2)} {f(r * 0.45)} 0 0 0 {f(cx + r * 2)} {f(cy)}" stroke="{rg}" stroke-width="{f(r * 0.16)}" fill="none" transform="rotate({tilt} {f(cx)} {f(cy)})"/>'
    return glow(d, cx, cy, r * 1.9, ring, 0.25) + back + f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}"/><g clip-path="url(#{clip})">{bands}</g>' + front


def lander(d, cx, base, s=1.0, lights=T['accent']):
    hull = d.lin([(0, lit('#c9d3e6', .4)), (0.55, '#a9b4cc'), (1, shade('#7d88a6', .5))], 0, 0, 1, 0)
    out = [shadow(d, cx + 8 * s, base + 2 * s, 70 * s, 12 * s, 0.6)]
    for dx in (-44, 44):
        out.append(f'<path d="M{f(cx + dx * 0.55 * s)} {f(base - 40 * s)}L{f(cx + dx * s)} {f(base)}" stroke="#5d6788" stroke-width="{f(4 * s)}" stroke-linecap="round"/>')
        out.append(f'<ellipse cx="{f(cx + dx * s)}" cy="{f(base)}" rx="{f(9 * s)}" ry="{f(3 * s)}" fill="#4a5470"/>')
    out.append(f'<path d="M{f(cx - 40 * s)} {f(base - 30 * s)}L{f(cx - 46 * s)} {f(base - 84 * s)}Q{f(cx)} {f(base - 150 * s)} {f(cx + 46 * s)} {f(base - 84 * s)}L{f(cx + 40 * s)} {f(base - 30 * s)}Z" fill="{hull}"/>')
    out.append(f'<path d="M{f(cx - 42 * s)} {f(base - 46 * s)}H{f(cx + 42 * s)}" stroke="#4a5470" stroke-width="{f(3 * s)}"/>')
    out.append(f'<path d="M{f(cx - 14 * s)} {f(base - 30 * s)}V{f(base - 58 * s)}H{f(cx + 14 * s)}V{f(base - 30 * s)}Z" fill="#1a1f34"/>' + glow(d, cx, base - 40 * s, 30 * s, lights, 0.7))
    out.append(f'<path d="M{f(cx - 12 * s)} {f(base - 30 * s)}L{f(cx - 26 * s)} {f(base - 4 * s)}H{f(cx + 26 * s)}L{f(cx + 12 * s)} {f(base - 30 * s)}Z" fill="{d.lin([(0, "#8a93ab"), (1, "#4a5470")])}"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(base - 92 * s)}" r="{f(12 * s)}" fill="{d.rad([(0, "#eafff8"), (0.6, T["symbiont"]), (1, shade(T["symbiont"], .5))], .35, .35, .8)}"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(base - 132 * s)}" r="{f(3.5 * s)}" fill="{T["synth"]}"/>' + glow(d, cx, base - 132 * s, 12 * s, T['synth'], 0.8))
    return ''.join(out)


def plot(d, x, base, rx, era, kind='building'):
    """빈 터: 돌 테두리 원판(구조물이 서는 자리)"""
    ry = rx * 0.27
    soil = ERA[era]['ground'][1]
    g = d.rad([(0, lit(soil, .25)), (0.75, mix(soil, '#000000', .15)), (1, shade(soil, .4))], 0.45, 0.4, 0.62)
    out = [f'<ellipse cx="{f(x)}" cy="{f(base)}" rx="{f(rx)}" ry="{f(ry)}" fill="{g}"/>']
    if kind != 'unit':
        n = 18
        for k in range(n):
            a = k / n * math.tau
            sx, sy = x + math.cos(a) * rx, base + math.sin(a) * ry
            out.append(f'<ellipse cx="{f(sx)}" cy="{f(sy)}" rx="{f(rx * 0.085)}" ry="{f(ry * 0.22)}" fill="{d.lin([(0, mix(lit("#8a8496", .2), soil, .35)), (1, shade("#6e6878", .4))])}" opacity="0.8"/>')
    else:
        for k in range(5):
            out.append(f'<path d="M{f(x - rx * 0.7 + k * rx * 0.35)} {f(base - ry * 0.4)}l{f(rx * 0.12)} {f(ry * 0.8)}" stroke="{shade(soil, .5)}" stroke-width="2" opacity="0.5"/>')
    return ''.join(out)


def paths(d, era, slots):
    """정착지 길: 1시대 흙길 → 2 포장길·등불 → 3 빛 도로 → 4 빛나는 길"""
    col = {1: '#8a7258', 2: '#6e7068', 3: '#5f6888', 4: '#9a8a60'}[era]
    width = {1: 9, 2: 12, 3: 13, 4: 13}[era]
    p = lambda k: (slots[k]['x'], slots[k]['base'] + 10)  # noqa: E731
    routes = [('idle', 'power'), ('power', 'hall'), ('hall', 'lab'), ('hall', 'workshop'), ('workshop', 'farm'), ('workshop', 'legacy'), ('legacy', 'idle'),
              ('workshop', 'rider'), ('workshop', 'battery'), ('farm', 'guard'), ('legacy', 'flyer')]
    if era == 1:
        routes = routes[:1] + routes[3:7]
    soft = d.blur(2.2)
    out = []
    rnd = random.Random(era)
    for a, b in routes:
        (x1, y1), (x2, y2) = p(a), p(b)
        mx, my = (x1 + x2) / 2 + rnd.uniform(-40, 40), (y1 + y2) / 2 + rnd.uniform(-20, 20)
        dd = f'M{f(x1)} {f(y1)}Q{f(mx)} {f(my)} {f(x2)} {f(y2)}'
        out.append(f'<path d="{dd}" stroke="{shade(col, .35)}" stroke-width="{width + 8}" fill="none" stroke-linecap="round" opacity="0.35" filter="{soft}"/>')
        out.append(f'<path d="{dd}" stroke="{col}" stroke-width="{width}" fill="none" stroke-linecap="round" opacity="0.6" filter="{soft}"/>')
        if era >= 3:
            out.append(f'<path d="{dd}" stroke="{ERA[era]["haze"]}" stroke-width="1.6" fill="none" stroke-dasharray="8 16" opacity="0.6"/>')
        if era == 2:
            t = 0.5
            lx = (1 - t) ** 2 * x1 + 2 * (1 - t) * t * mx + t * t * x2
            ly = (1 - t) ** 2 * y1 + 2 * (1 - t) * t * my + t * t * y2
            out.append(f'<line x1="{f(lx + 12)}" y1="{f(ly)}" x2="{f(lx + 12)}" y2="{f(ly - 20)}" stroke="#3a3a48" stroke-width="2"/>' + glow(d, lx + 12, ly - 21, 12, T['accent'], 0.8))
        if era == 4:
            out.append(f'<path d="{dd}" stroke="{T["ring3"]}" stroke-width="2" fill="none" opacity="0.4"/>')
    return ''.join(out)


def mottle(d, era, seed):
    """땅 얼룩: 밝고 어두운 흙·이끼 덩이를 흐리게 겹쳐 붓으로 칠한 느낌"""
    rnd = random.Random(seed)
    e = ERA[era]
    b1, b2 = d.blur(16), d.blur(7)
    out = []
    for _ in range(70):
        y = rnd.uniform(HORIZON + 10, H)
        t = (y - HORIZON) / (H - HORIZON)
        base = e['ground'][min(3, int(t * 3.2))]
        c = rnd.choice([lit(base, .35), shade(base, .35), mix(base, e['flora'], .25), mix(base, e['haze'], .3), mix(base, '#8a6a4a', .3)])
        rx = rnd.uniform(40, 150) * (0.5 + t)
        out.append(f'<ellipse cx="{f(rnd.uniform(-40, W + 40))}" cy="{f(y)}" rx="{f(rx)}" ry="{f(rx * rnd.uniform(0.12, 0.25))}" fill="{c}" opacity="{f(rnd.uniform(0.25, 0.5))}" filter="{b1}"/>')
    for _ in range(140):
        y = rnd.uniform(HORIZON + 20, H)
        t = (y - HORIZON) / (H - HORIZON)
        base = e['ground'][min(3, int(t * 3.2))]
        x = rnd.uniform(0, W)
        c = rnd.choice([lit(base, .5), mix(base, e['key'], .3), shade(base, .5)])
        out.append(f'<path d="M{f(x)} {f(y)}q{f(rnd.uniform(10, 30) * (0.5 + t))} {f(rnd.uniform(-3, 3))} {f(rnd.uniform(24, 60) * (0.5 + t))} 0" stroke="{c}" stroke-width="{f(rnd.uniform(2, 5) * (0.5 + t))}" stroke-linecap="round" opacity="{f(rnd.uniform(0.2, 0.45))}" filter="{b2}"/>')
    return ''.join(out)


def framing(d, era):
    """가장자리 앞쪽 수풀·바위(장면에 깊이)"""
    e = ERA[era]
    out = []
    for x, y, s, flip in [(-10, H - 30, 1.3, 1), (W + 10, H - 40, 1.2, -1), (W + 6, HORIZON + 230, 0.8, -1), (-8, HORIZON + 260, 0.8, 1)]:
        c = shade(e['ground'][2], .3)
        g = d.lin([(0, mix(c, e['key'], .2)), (1, shade(c, .5))], 0, 0, 1, 1)
        out.append(f'<path d="M{f(x)} {f(y + 40 * s)}Q{f(x + flip * 10 * s)} {f(y - 40 * s)} {f(x + flip * 50 * s)} {f(y - 30 * s)}Q{f(x + flip * 80 * s)} {f(y - 10 * s)} {f(x + flip * 90 * s)} {f(y + 40 * s)}Z" fill="{g}"/>')
        out.append(plant(d, x + flip * 40 * s, y - 20 * s, 34 * s, e['flora'], int(x + y)))
    return ''.join(out)


def flora(d, era, seed, n, ymin, ymax, avoid):
    rnd = random.Random(seed)
    out = []
    c = ERA[era]['flora']
    for _ in range(n * 3):
        if len(out) >= n:
            break
        x, y = rnd.uniform(10, W - 10), rnd.uniform(ymin, ymax)
        if any(abs(x - ax) < rx and abs(y - ay) < ry for ax, ay, rx, ry in avoid):
            continue
        k = rnd.random()
        sc = 0.5 + (y - HORIZON) / (H - HORIZON) * 0.9
        if k < 0.45:
            out.append(plant(d, x, y, 18 * sc, rnd.choice([c, T['symbiont-2'], mix(c, T['ark'], .4)]), seed=rnd.randint(0, 999)))
        elif k < 0.75:
            rr = rnd.uniform(6, 14) * sc
            out.append(shadow(d, x + rr * 0.4, y + 1, rr * 1.3, rr * 0.35, 0.5) + f'<path d="M{f(x - rr)} {f(y)}Q{f(x - rr * 0.8)} {f(y - rr * 1.1)} {f(x)} {f(y - rr)}Q{f(x + rr)} {f(y - rr * 0.8)} {f(x + rr)} {f(y)}Z" fill="{d.lin([(0, lit("#7d7488", .3)), (1, shade("#5a5266", .5))], 0, 0, 1, 1)}"/>')
        else:
            out.append(f'<path d="M{f(x)} {f(y)}q-4 -{f(14 * sc)} -{f(10 * sc)} -{f(18 * sc)}M{f(x)} {f(y)}q2 -{f(16 * sc)} {f(8 * sc)} -{f(22 * sc)}M{f(x)} {f(y)}q-1 -{f(10 * sc)} -{f(2 * sc)} -{f(14 * sc)}" stroke="{mix(c, "#2a3a2a", .45)}" stroke-width="{f(2 * sc)}" fill="none" stroke-linecap="round"/>')
    return ''.join(out)


def horizon_city(d, era):
    """지평선 너머 건물: 2시대 돔 몇 채, 3시대 탑 도시, 4시대 거대한 빛나무"""
    out = []
    y = HORIZON + 6
    if era == 2:
        for x, r in [(90, 22), (130, 14), (590, 18), (630, 26), (668, 12)]:
            out.append(dome(d, x, y, r, r * 0.8, '#5a6a86', glass=T['symbiont']) + glow(d, x, y - r * 0.4, r * 1.6, T['symbiont'], 0.25))
    elif era == 3:
        rnd = random.Random(33)
        for x in list(range(40, 280, 26)) + list(range(560, 820, 24)):
            h = rnd.uniform(30, 120)
            w = rnd.uniform(10, 18)
            g = d.lin([(0, '#3a4470'), (1, '#1e2548')], 0, 0, 1, 0)
            out.append(f'<path d="M{f(x - w / 2)} {y}V{f(y - h)}L{f(x)} {f(y - h - w)}L{f(x + w / 2)} {f(y - h)}V{y}Z" fill="{g}"/>')
            for k in range(int(h / 14)):
                out.append(f'<rect x="{f(x - w / 4)}" y="{f(y - h + 6 + k * 14)}" width="{f(w / 2)}" height="3" fill="{rnd.choice([T["ark"], T["accent"], T["ark-2"]])}" opacity="0.85"/>')
            out.append(glow(d, x, y - h - w, 8, T['ark'], 0.5))
        out.append(glow(d, 160, y - 30, 160, T['ark'], 0.18) + glow(d, 690, y - 30, 160, T['ark'], 0.18))
    elif era == 4:
        x0 = 110
        out.append(glow(d, x0, y - 120, 150, T['symbiont-2'], 0.3))
        out.append(f'<path d="M{x0 - 16} {y}Q{x0 - 22} {y - 80} {x0 - 4} {y - 150}Q{x0 + 6} {y - 80} {x0 + 18} {y}Z" fill="{d.lin([(0, "#6a5a78"), (1, "#3a2a48")], 0, 0, 1, 0)}"/>')
        rnd = random.Random(44)
        for k in range(16):
            a = rnd.uniform(-1.4, 1.4)
            r = rnd.uniform(40, 110)
            ex, ey = x0 + math.sin(a) * r, y - 150 - math.cos(a) * r * 0.6
            out.append(f'<path d="M{x0 - 2} {y - 146}Q{f((x0 + ex) / 2)} {f(ey + 20)} {f(ex)} {f(ey)}" stroke="#4a3a58" stroke-width="3" fill="none"/>')
            out.append(glow(d, ex, ey, 18, rnd.choice([T['symbiont'], T['symbiont-2'], T['ring3']]), 0.7) + f'<circle cx="{f(ex)}" cy="{f(ey)}" r="3.4" fill="#ffffff" opacity="0.8"/>')
        for x, r in [(600, 16), (640, 24), (700, 14)]:
            out.append(dome(d, x, y, r, r * 0.8, '#7a7a86', glass=T['ring3']))
    return ''.join(out)


def sky_extra(d, era):
    out = []
    if era == 1:
        out.append(ringed_planet(d, 640, 96, 46, '#c98a6a', '#f4c56a'))
        out.append(f'<circle cx="160" cy="70" r="12" fill="{d.rad([(0, "#f5ecdf"), (1, "#8a8098")], .35, .35, .8)}"/>')
    elif era == 2:
        b = d.blur(14)
        for k, (c, y, a) in enumerate([(T['symbiont'], 70, 0.5), (T['symbiont-2'], 110, 0.35), (T['ark'], 50, 0.3)]):
            out.append(f'<path d="M-20 {y + 40}Q200 {y - 40} 420 {y + 10}T860 {y - 10}" stroke="{c}" stroke-width="{36 - k * 8}" fill="none" opacity="{a}" filter="{b}"/>')
            for j in range(14):
                x = 30 + j * 60
                out.append(f'<line x1="{x}" y1="{y + 10}" x2="{x + 10}" y2="{y + 70}" stroke="{c}" stroke-width="10" opacity="{a * 0.35}" filter="{b}"/>')
        out.append(ringed_planet(d, 700, 70, 30, '#8a9ac9', '#b996ff'))
    elif era == 3:
        rg = d.lin([(0, T['ark'], 0), (0.3, T['ark-2'], 0.85), (0.7, T['ark-2'], 0.85), (1, T['ark'], 0)], 0, 0, 1, 0)
        out.append(f'<path d="M-40 150Q420 -10 880 120" stroke="{rg}" stroke-width="6" fill="none"/>')
        out.append(f'<path d="M-40 160Q420 0 880 130" stroke="{T["ark"]}" stroke-width="1.5" fill="none" opacity="0.6"/>')
        for t in (0.15, 0.38, 0.62, 0.85):
            x = -40 + 920 * t
            y = (1 - t) ** 2 * 150 + 2 * (1 - t) * t * -10 + t * t * 120
            out.append(f'<rect x="{f(x - 10)}" y="{f(y - 5)}" width="20" height="10" rx="3" fill="#c9d3e6"/><rect x="{f(x - 26)}" y="{f(y - 2)}" width="52" height="4" fill="{T["ark"]}" opacity="0.8"/>' + glow(d, x, y, 18, T['ark-2'], 0.5))
        out.append(ringed_planet(d, 140, 80, 34, '#6a7ab9', '#9cc2ff', tilt=12))
    else:
        out.append(glow(d, 560, HORIZON - 10, 260, T['ring3'], 0.55))
        out.append(f'<circle cx="560" cy="{HORIZON - 6}" r="40" fill="{d.rad([(0, "#fffbe8"), (0.7, "#ffe29a"), (1, "#ffd67a", 0)], .5, .5, .5)}"/>')
        rnd = random.Random(4)
        for _ in range(40):
            x, y = rnd.uniform(0, W), rnd.uniform(40, HORIZON + 300)
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(1.4, 3))}" fill="{rnd.choice([T["symbiont-2"], T["ring3"]])}" opacity="0.7"/>')
    return ''.join(out)


def scene(era, layout):
    e = ERA[era]
    d = Doc(W, H, prefix=f'e{era}')
    slots = layout['slots']
    sky = d.lin([(0, e['sky'][0]), (0.45, e['sky'][1]), (0.8, e['sky'][2]), (1, e['sky'][3])], 0, 0, 0, 1)
    pf = d.paint_filter(disp=3, streak=0.3, freq=0.02, brush='0.02 0.07', seed=era * 3)
    body = [f'<rect width="{W}" height="{HORIZON + 40}" fill="{sky}"/>']
    body.append(nebula(d, [(e['sky'][2], 0.5), (e['haze'], 0.18), (T['ring2'], 0.18)], era))
    body.append(stars(d, {1: 60, 2: 140, 3: 160, 4: 30}[era], era, HORIZON - 30))
    body.append(sky_extra(d, era))
    # 먼 능선 2겹(뒤가 옅다)
    for k, (c, y0, amp) in enumerate([(e['ridge'][0], HORIZON - 34, 26), (e['ridge'][1], HORIZON - 10, 16)]):
        g = d.lin([(0, mix(c, e['haze'], 0.35 - k * 0.15)), (1, c)], 0, 0, 0, 1)
        body.append(f'<path d="{hill(y0, amp, era * 10 + k, 4)}" fill="{g}"/>')
    body.append(glow(d, W * 0.3, HORIZON, 360, e['haze'], 0.22))
    body.append(horizon_city(d, era))
    # 땅: 겹친 언덕 띠, 위(먼 곳)는 밝고 따뜻하게, 아래(가까운 곳)는 어둡게
    gnd = e['ground']
    bands = [(HORIZON + 4, 6, 0), (HORIZON + 120, 14, 1), (HORIZON + 330, 18, 2), (HORIZON + 560, 16, 3)]
    for y0, amp, k in bands:
        top = gnd[k]
        bot = gnd[min(3, k + 1)]
        g = d.lin([(0, lit(top, 0.18)), (0.25, top), (1, bot)], 0, 0, 0, 1)
        body.append(f'<path d="{hill(y0, amp, era * 100 + k)}" fill="{g}"/>')
        body.append(f'<path d="{hill(y0, amp, era * 100 + k).split("L")[0]}" stroke="{mix(lit(top, .5), e["key"], .3)}" stroke-width="2.5" fill="none" opacity="0.35"/>')
    body.append(mottle(d, era, era * 31))
    # 따뜻한 키 라이트 웅덩이(왼쪽 위) + 아래 비네트
    body.append(glow(d, 220, 420, 520, e['key'], 0.12))
    body.append(paths(d, era, slots))
    # 빈 터
    for k, s in slots.items():
        if k == 'idle':
            continue
        kind = 'unit' if k in ('guard', 'rider', 'battery', 'flyer') else 'legacy' if k == 'legacy' else 'building'
        rx = (layout['unit']['w'] * 0.4 if kind == 'unit' else 96 if kind == 'building' else 110) * s['scale']
        body.append(plot(d, s['x'], s['base'] - 2, rx, era, kind))
    lp = slots['legacy']
    body.append(f'<ellipse cx="{lp["x"]}" cy="{lp["base"] - 2}" rx="70" ry="18" fill="{mix(e["ground"][0], "#a59fb2", .4)}" opacity="0.65"/>')
    # 착륙선(유휴 정착민이 기다리는 곳)
    il = slots['idle']
    if era == 1:
        body.append(lander(d, il['x'] + 10, il['base'] - 6, 0.85))
        body.append(block(d, il['x'] - 80, il['base'] + 4, 22, 16, 10, '#b39577') + block(d, il['x'] - 62, il['base'] + 10, 16, 12, 8, '#9a8060'))
    elif era == 2:
        body.append(lander(d, il['x'] + 20, il['base'] - 8, 0.78))
        body.append(dome(d, il['x'] - 56, il['base'] + 6, 30, 24, '#8d98b4', ribs=2) + glow(d, il['x'] - 56, il['base'] - 4, 26, T['accent'], 0.35))
    elif era == 3:
        body.append(cyl(d, il['x'] + 14, il['base'] - 4, 40, 120, '#7d88a6'))
        body.append(dome(d, il['x'] + 14, il['base'] - 124, 34, 22, '#c9d3e6', glass=T['ark']))
        body.append(f'<rect x="{il["x"] - 40}" y="{il["base"] - 76}" width="108" height="6" fill="#8d99b8"/>' + glow(d, il['x'] + 14, il['base'] - 140, 40, T['ark'], 0.45))
        body.append(lander(d, il['x'] - 54, il['base'] + 2, 0.5))
    else:
        body.append(lander(d, il['x'] + 14, il['base'] - 8, 0.8, lights=T['ring3']))
        body.append(plant(d, il['x'] - 60, il['base'] + 4, 40, T['symbiont-2'], 5) + plant(d, il['x'] + 80, il['base'] + 6, 30, T['ring3'], 6))
    # 식생(빈 터는 피함)
    avoid = [(s['x'], s['base'] - 40, 120, 90) for s in slots.values()]
    body.append(flora(d, era, era * 7, {1: 26, 2: 46, 3: 34, 4: 60}[era], HORIZON + 30, H - 10, avoid))
    # 포자 안개
    b = d.blur(22)
    rnd = random.Random(era * 5)
    for _ in range(7):
        body.append(f'<ellipse cx="{f(rnd.uniform(0, W))}" cy="{f(rnd.uniform(HORIZON + 40, H - 60))}" rx="{f(rnd.uniform(120, 240))}" ry="{f(rnd.uniform(14, 30))}" fill="{rnd.choice([T["symbiont"], e["haze"], T["ring2"]])}" opacity="{f(rnd.uniform(0.06, 0.14))}" filter="{b}"/>')
    body.append(framing(d, era))
    vg = d.rad([(0, '#000000', 0), (0.7, '#000000', 0), (1, '#05070f', 0.6)], 0.5, 0.45, 0.75)
    d.add(f'<g filter="{pf}">{"".join(body)}</g>')
    d.add(f'<rect width="{W}" height="{H}" fill="{vg}"/>')
    # 장면 아래쪽은 자원 트레이로 이어지게 살짝 어둡게
    d.add(f'<rect y="{H - 120}" width="{W}" height="120" fill="{d.lin([(0, "#0a0f1f", 0), (1, "#0a0f1f", 0.55)])}"/>')
    return d
