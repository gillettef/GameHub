# 유닛 4계열 × 레벨 무리 그림. 칸 220x180, 땅선 y=158, 가운데 x=110
from paint import T, banner, block, cyl, f, figure, glow, lit, mix, shade, shadow

CX, BASE = 110, 158
CLOTH = '#8a6a4e'
STEEL = '#8d99b8'
PLATE = '#6c7896'
CRIMSON = '#d9564f'  # 군기(위험색 계열)


def squad(d, spots, armor, accent, kind, heavy=False, s=1.0):
    out = []
    for i, (x, y) in enumerate(sorted(spots, key=lambda p: p[1])):
        out.append(figure(d, x, y, s * (0.86 + (y - BASE + 30) / 200), armor, accent, kind, heavy, face=1 if i % 2 else -1))
    return ''.join(out)


def beast(d, x, base, s, c):
    """여섯 다리 토착 짐승(등에 기수)"""
    body = d.lin([(0, lit(c, .35)), (1, shade(c, .5))], 0, 0, 0, 1)
    out = [shadow(d, x + 4 * s, base + 1, 30 * s, 5 * s, 0.55)]
    for k in range(6):
        lx = x - 20 * s + k * 8 * s
        out.append(f'<path d="M{f(lx)} {f(base - 18 * s)}l{f((k % 2 * 2 - 1) * 3 * s)} {f(10 * s)}l{f(2 * s)} {f(8 * s)}" stroke="{shade(c, .55)}" stroke-width="{f(2.6 * s)}" fill="none" stroke-linecap="round"/>')
    out.append(f'<ellipse cx="{f(x)}" cy="{f(base - 24 * s)}" rx="{f(26 * s)}" ry="{f(10 * s)}" fill="{body}"/>')
    out.append(f'<path d="M{f(x + 20 * s)} {f(base - 28 * s)}Q{f(x + 34 * s)} {f(base - 46 * s)} {f(x + 40 * s)} {f(base - 40 * s)}" stroke="{c}" stroke-width="{f(6 * s)}" fill="none" stroke-linecap="round"/>')
    out.append(f'<ellipse cx="{f(x + 42 * s)}" cy="{f(base - 40 * s)}" rx="{f(7 * s)}" ry="{f(4.5 * s)}" fill="{lit(c, .2)}"/>')
    for k in range(4):
        out.append(f'<circle cx="{f(x - 14 * s + k * 9 * s)}" cy="{f(base - 29 * s)}" r="{f(1.8 * s)}" fill="{T["symbiont"]}"/>')
    out.append(glow(d, x + 44 * s, base - 41 * s, 5 * s, T['symbiont-2'], 0.9))
    return ''.join(out)


def hoverbike(d, x, base, s, c, accent):
    g = d.lin([(0, lit(c, .45)), (1, shade(c, .5))], 0, 0, 0, 1)
    y = base - 12 * s
    return (shadow(d, x, base, 26 * s, 4 * s, 0.5) + glow(d, x, base - 4 * s, 18 * s, accent, 0.55) +
            f'<path d="M{f(x - 26 * s)} {f(y)}Q{f(x - 20 * s)} {f(y - 10 * s)} {f(x)} {f(y - 10 * s)}L{f(x + 28 * s)} {f(y - 4 * s)}L{f(x + 22 * s)} {f(y + 3 * s)}H{f(x - 22 * s)}Z" fill="{g}"/>'
            f'<rect x="{f(x - 20 * s)}" y="{f(y + 1 * s)}" width="{f(36 * s)}" height="{f(2.4 * s)}" fill="{accent}"/>' +
            figure(d, x - 2 * s, y - 6 * s, 0.62 * s, '#5b6584', accent, 'none', face=1))


def tank(d, x, base, s, c, accent):
    g = d.lin([(0, lit(c, .4)), (0.6, c), (1, shade(c, .55))], 0, 0, 0, 1)
    y = base - 14 * s
    return (shadow(d, x + 4 * s, base, 44 * s, 6 * s, 0.6) + glow(d, x, base - 4 * s, 34 * s, accent, 0.45) +
            f'<path d="M{f(x - 44 * s)} {f(y)}L{f(x - 36 * s)} {f(y - 18 * s)}H{f(x + 34 * s)}L{f(x + 46 * s)} {f(y - 4 * s)}L{f(x + 38 * s)} {f(y + 6 * s)}H{f(x - 38 * s)}Z" fill="{g}"/>'
            f'<path d="M{f(x - 18 * s)} {f(y - 18 * s)}Q{f(x - 14 * s)} {f(y - 32 * s)} {f(x + 4 * s)} {f(y - 32 * s)}Q{f(x + 18 * s)} {f(y - 30 * s)} {f(x + 18 * s)} {f(y - 18 * s)}Z" fill="{lit(c, .2)}"/>'
            f'<line x1="{f(x + 14 * s)}" y1="{f(y - 25 * s)}" x2="{f(x + 52 * s)}" y2="{f(y - 30 * s)}" stroke="{shade(c, .4)}" stroke-width="{f(4 * s)}" stroke-linecap="round"/>'
            f'<rect x="{f(x - 34 * s)}" y="{f(y + 1 * s)}" width="{f(68 * s)}" height="{f(3 * s)}" fill="{accent}"/>'
            f'<circle cx="{f(x - 4 * s)}" cy="{f(y - 25 * s)}" r="{f(2.6 * s)}" fill="{accent}"/>')


def guard(d, lv):
    s = []
    if lv == 0:
        s.append(banner(d, CX - 40, BASE - 92, 70, CRIMSON, 22))
        s.append(squad(d, [(CX - 26, BASE - 14), (CX + 4, BASE - 20), (CX + 32, BASE - 12), (CX - 4, BASE + 2), (CX + 24, BASE + 4)], CLOTH, T['accent'], 'spear'))
    elif lv == 1:
        s.append(banner(d, CX - 50, BASE - 96, 76, CRIMSON, 22) + banner(d, CX + 50, BASE - 90, 70, CRIMSON, 18))
        s.append(squad(d, [(CX - 34, BASE - 16), (CX - 6, BASE - 20), (CX + 22, BASE - 16), (CX - 22, BASE + 2), (CX + 8, BASE + 4), (CX + 36, BASE + 2)], STEEL, T['ark'], 'shield'))
    elif lv == 2:
        s.append(banner(d, CX - 56, BASE - 100, 80, CRIMSON, 24))
        s.append(squad(d, [(CX - 30, BASE - 14), (CX + 8, BASE - 18), (CX + 42, BASE - 10), (CX - 10, BASE + 4), (CX + 26, BASE + 6)], PLATE, T['symbiont'], 'rifle', heavy=True, s=1.15))
    else:
        for x, y, sc in [(CX - 40, BASE - 6, 0.92), (CX + 34, BASE + 2, 1.0)]:
            s.append(mech(d, x, y, sc))
        s.append(banner(d, CX - 2, BASE - 104, 70, CRIMSON, 24))
    return ''.join(s)


def mech(d, x, base, s):
    c = '#7684a6'
    g = d.lin([(0, lit(c, .4)), (0.6, c), (1, shade(c, .55))], 0, 0, 1, 0)
    out = [shadow(d, x + 4 * s, base, 30 * s, 5 * s, 0.6)]
    for dx in (-10, 10):
        out.append(f'<path d="M{f(x + dx * s)} {f(base - 44 * s)}l{f(dx * 0.5 * s)} {f(22 * s)}l{f(-dx * 0.4 * s)} {f(20 * s)}" stroke="{shade(c, .4)}" stroke-width="{f(7 * s)}" fill="none" stroke-linejoin="round" stroke-linecap="round"/>')
        out.append(f'<rect x="{f(x + dx * s - 7 * s)}" y="{f(base - 4 * s)}" width="{f(14 * s)}" height="{f(4 * s)}" rx="{f(1.5 * s)}" fill="{shade(c, .5)}"/>')
    out.append(f'<path d="M{f(x - 22 * s)} {f(base - 46 * s)}L{f(x - 18 * s)} {f(base - 74 * s)}H{f(x + 20 * s)}L{f(x + 24 * s)} {f(base - 46 * s)}Z" fill="{g}"/>')
    out.append(f'<rect x="{f(x - 12 * s)}" y="{f(base - 68 * s)}" width="{f(24 * s)}" height="{f(6 * s)}" rx="{f(2 * s)}" fill="{mix(T["danger"], "#ffffff", .3)}"/>' + glow(d, x, base - 65 * s, 14 * s, T['danger'], 0.6))
    out.append(f'<line x1="{f(x + 22 * s)}" y1="{f(base - 60 * s)}" x2="{f(x + 42 * s)}" y2="{f(base - 56 * s)}" stroke="{shade(c, .3)}" stroke-width="{f(6 * s)}" stroke-linecap="round"/>')
    out.append(f'<line x1="{f(x - 22 * s)}" y1="{f(base - 60 * s)}" x2="{f(x - 30 * s)}" y2="{f(base - 40 * s)}" stroke="{lit(c, .2)}" stroke-width="{f(6 * s)}" stroke-linecap="round"/>')
    return ''.join(out)


def rider(d, lv):
    s = []
    if lv == 1:
        s.append(banner(d, CX - 56, BASE - 98, 70, CRIMSON, 20))
        for x, y, sc in [(CX - 30, BASE - 18, 0.9), (CX + 20, BASE + 2, 1.05)]:
            s.append(beast(d, x, y, sc, '#7a6a8e'))
            s.append(figure(d, x - 4 * sc, y - 30 * sc, 0.7 * sc, CLOTH, T['accent'], 'spear', face=1))
    elif lv == 2:
        s.append(banner(d, CX - 62, BASE - 96, 70, CRIMSON, 20))
        for x, y, sc in [(CX - 34, BASE - 22, 0.9), (CX + 26, BASE - 14, 0.95), (CX - 4, BASE + 4, 1.05)]:
            s.append(hoverbike(d, x, y, sc, '#8e9abb', T['ark']))
    else:
        s.append(banner(d, CX - 70, BASE - 96, 70, CRIMSON, 22))
        s.append(tank(d, CX - 18, BASE - 22, 0.8, '#6f7c9c', T['ark']))
        s.append(tank(d, CX + 22, BASE + 2, 0.95, '#6f7c9c', T['ark']))
    return ''.join(s)


def battery(d, lv):
    s = []
    if lv == 1:
        s.append(shadow(d, CX + 6, BASE, 64, 9, 0.6))
        s.append(block(d, CX - 56, BASE + 2, 104, 12, 14, '#6e6458'))
        s.append(f'<path d="M{CX - 20} {BASE - 10}l-14 12M{CX - 4} {BASE - 10}v12M{CX + 12} {BASE - 10}l14 12" stroke="#3b3f52" stroke-width="3"/>')
        g = d.lin([(0, lit(STEEL, .4)), (1, shade(STEEL, .5))], 0, 0, 0, 1)
        s.append(f'<rect x="{CX - 22}" y="{BASE - 28}" width="34" height="20" rx="4" fill="{g}"/>')
        s.append(f'<path d="M{CX + 6} {BASE - 24}L{CX + 68} {BASE - 52}L{CX + 70} {BASE - 44}L{CX + 8} {BASE - 14}Z" fill="{g}"/>')
        s.append(f'<path d="M{CX + 20} {BASE - 26}L{CX + 66} {BASE - 47}" stroke="{T["sci"]}" stroke-width="1.6"/>' + glow(d, CX + 70, BASE - 48, 10, T['sci'], 0.7))
        s.append(figure(d, CX - 40, BASE - 4, 0.8, CLOTH, T['accent'], 'none', face=1))
        s.append(banner(d, CX - 62, BASE - 74, 60, CRIMSON, 18, flip=True))
    else:
        s.append(shadow(d, CX + 6, BASE, 82, 10, 0.6))
        for k in range(5):
            s.append(f'<ellipse cx="{CX - 60 + k * 28}" cy="{BASE}" rx="16" ry="8" fill="{d.lin([(0, lit("#8a7a62", .3)), (1, shade("#6a5a44", .4))])}"/>')
        s.append(block(d, CX - 44, BASE - 6, 80, 30, 22, '#5e6886'))
        s.append(cyl(d, CX - 4, BASE - 36, 46, 14, '#76829f'))
        g = d.lin([(0, lit('#8d99b8', .4)), (1, shade('#6c7896', .5))], 0, 0, 0, 1)
        s.append(f'<path d="M{CX + 8} {BASE - 52}L{CX + 86} {BASE - 92}L{CX + 92} {BASE - 80}L{CX + 14} {BASE - 40}Z" fill="{g}"/>')
        for k in range(4):
            x = CX + 26 + k * 16
            s.append(f'<ellipse cx="{x}" cy="{BASE - 56 - k * 8}" rx="3.4" ry="7" fill="{T["synth"]}" transform="rotate(-27 {x} {BASE - 56 - k * 8})"/>')
        s.append(glow(d, CX + 50, BASE - 70, 30, T['synth'], 0.45) + glow(d, CX + 92, BASE - 88, 14, mix(T['synth'], '#ffffff', .4), 0.9))
        s.append(banner(d, CX - 72, BASE - 80, 66, CRIMSON, 20, flip=True))
    return ''.join(s)


def flyer(d, lv):
    c = '#7d8aac'
    g = d.lin([(0, lit(c, .5)), (0.6, c), (1, shade(c, .55))], 0, 0, 0, 1)
    y = BASE - 70
    return ''.join([
        shadow(d, CX + 8, BASE, 54, 8, 0.55),
        f'<path d="M{CX - 70} {y + 4}L{CX - 10} {y - 6}L{CX + 66} {y + 2}L{CX - 6} {y + 14}Z" fill="{shade(c, .3)}"/>',
        f'<path d="M{CX - 50} {y}Q{CX - 40} {y - 22} {CX} {y - 22}Q{CX + 44} {y - 20} {CX + 62} {y - 4}Q{CX + 40} {y + 10} {CX - 44} {y + 8}Z" fill="{g}"/>',
        f'<path d="M{CX + 18} {y - 18}Q{CX + 40} {y - 16} {CX + 54} {y - 6}H{CX + 22}Z" fill="{mix(T["ark"], "#ffffff", .3)}" opacity="0.9"/>',
        f'<path d="M{CX - 46} {y - 4}L{CX - 64} {y - 26}L{CX - 52} {y - 26}L{CX - 30} {y - 8}Z" fill="{lit(c, .2)}"/>',
        glow(d, CX - 30, y + 14, 22, T['energy'], 0.6), glow(d, CX + 24, y + 14, 22, T['energy'], 0.6),
        f'<ellipse cx="{CX - 30}" cy="{y + 12}" rx="10" ry="3.4" fill="{mix(T["energy"], "#ffffff", .5)}"/>',
        f'<ellipse cx="{CX + 24}" cy="{y + 12}" rx="10" ry="3.4" fill="{mix(T["energy"], "#ffffff", .5)}"/>',
        f'<path d="M{CX - 34} {y + 18}l-4 34M{CX + 20} {y + 18}l4 34" stroke="{T["energy"]}" stroke-width="2" opacity="0.25"/>',
        f'<circle cx="{CX + 64}" cy="{y - 2}" r="3" fill="{T["danger"]}"/>' + glow(d, CX + 64, y - 2, 10, T['danger'], 0.8),
        banner(d, CX - 70, BASE - 48, 46, CRIMSON, 18, flip=True),
    ])


SCALE = {'guard': 1.4, 'rider': 1.3, 'battery': 1.12, 'flyer': 1.1}


def scaled(fn, k):
    def draw(d, lv):
        return f'<g transform="translate({CX} {BASE}) scale({SCALE[k]}) translate({-CX} {-BASE})">{fn(d, lv)}</g>'
    return draw


DRAW = {k: scaled(fn, k) for k, fn in {'guard': guard, 'rider': rider, 'battery': battery, 'flyer': flyer}.items()}
KINDS = ['guard', 'rider', 'battery', 'flyer']
LEVELS = {'guard': [0, 1, 2, 3], 'rider': [1, 2, 3], 'battery': [1, 2], 'flyer': [1]}
