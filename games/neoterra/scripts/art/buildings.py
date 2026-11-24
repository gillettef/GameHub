# 건물 5계열 × 레벨(기초·Lv1~3) 구조물 그림. 칸 240x200, 땅선 y=172, 가운데 x=120
from paint import T, Doc, block, cone, cyl, dome, f, glow, lit, mix, plant, shade, shadow, smoke, window, banner

CX, BASE = 120, 172
PREFAB = '#b39577'
STEEL = '#7f8aa6'
STONE = '#8b8698'
RUST = '#9a6a48'
DARK = '#2b3150'


def pad(d, cx, base, rx, c='#4a3d36'):
    g = d.rad([(0, lit(c, 0.25)), (0.7, c), (1, shade(c, 0.5), 0)], 0.45, 0.4, 0.6)
    return shadow(d, cx + 6, base + 2, rx * 1.05, rx * 0.3, 0.6) + f'<ellipse cx="{f(cx)}" cy="{f(base)}" rx="{f(rx)}" ry="{f(rx * 0.26)}" fill="{g}"/>'


def furrows(d, cx, base, rx, c, seed=0, sprout=None):
    ry = rx * 0.32
    g = d.rad([(0, lit('#6b4f3a', 0.2)), (1, shade('#4a3424', 0.3))], 0.4, 0.4, 0.7)
    s = [f'<ellipse cx="{f(cx)}" cy="{f(base)}" rx="{f(rx)}" ry="{f(ry)}" fill="{g}"/>']
    for k in range(-3, 4):
        y = base + k * ry / 4.2
        half = rx * (1 - (k / 4.2) ** 2) ** 0.5 * 0.9
        s.append(f'<path d="M{f(cx - half)} {f(y)}Q{f(cx)} {f(y - 2)} {f(cx + half)} {f(y)}" stroke="{shade("#5a4030", 0.4)}" stroke-width="1.6" fill="none"/>')
        if sprout and k % 2 == 0:
            for j in range(-3, 4):
                x = cx + j * half / 3.4
                s.append(f'<path d="M{f(x)} {f(y)}l-2 -5M{f(x)} {f(y)}l2 -6" stroke="{sprout}" stroke-width="1.6" stroke-linecap="round"/>')
                s.append(f'<circle cx="{f(x)}" cy="{f(y - 6)}" r="1.4" fill="{mix(sprout, "#ffffff", 0.5)}"/>')
    return ''.join(s)


def crate(d, x, base, s=1, c=PREFAB):
    return block(d, x, base, 14 * s, 11 * s, 6 * s, c)


def farm(d, lv):
    g = T['food']
    s = []
    if lv == 0:
        s.append(furrows(d, CX - 6, BASE - 6, 74, g, sprout=g))
        s.append(cone(d, CX + 58, BASE - 6, 40, 34, '#c8a46e'))
        s.append(glow(d, CX + 58, BASE - 14, 18, T['accent'], 0.6))
        s.append(crate(d, CX + 76, BASE + 2))
    elif lv == 1:
        s.append(furrows(d, CX + 40, BASE - 4, 48, g, sprout=g))
        s.append(pad(d, CX - 30, BASE, 56))
        s.append(dome(d, CX - 30, BASE - 4, 48, 46, '#9fb2c9', glass=g))
        s.append(plant(d, CX - 42, BASE - 6, 24, g, 1) + plant(d, CX - 14, BASE - 6, 20, mix(g, T['symbiont'], 0.5), 2))
        s.append(block(d, CX - 40, BASE - 2, 18, 12, 6, PREFAB))
    elif lv == 2:
        s.append(furrows(d, CX + 62, BASE + 2, 40, g, sprout=g))
        s.append(pad(d, CX - 10, BASE, 92))
        s.append(cyl(d, CX + 40, BASE - 6, 22, 56, STEEL))
        s.append(dome(d, CX + 40, BASE - 62, 12, 9, STEEL))
        s.append(f'<rect x="{CX + 31}" y="{BASE - 50}" width="18" height="6" fill="{g}" opacity="0.8"/>')
        s.append(dome(d, CX - 48, BASE - 2, 40, 38, '#9fb2c9', glass=g))
        s.append(f'<rect x="{CX - 12}" y="{BASE - 22}" width="26" height="12" fill="{d.lin([(0, lit(STEEL, .4)), (1, shade(STEEL, .4))])}"/>')
        s.append(dome(d, CX + 2, BASE + 4, 30, 30, '#9fb2c9', glass=mix(g, T['symbiont'], 0.4)))
        s.append(plant(d, CX - 56, BASE - 4, 22, g, 3) + plant(d, CX - 2, BASE + 2, 16, g, 4))
    else:
        s.append(pad(d, CX, BASE, 96))
        s.append(dome(d, CX - 66, BASE + 2, 28, 26, '#9fb2c9', glass=g))
        s.append(dome(d, CX + 70, BASE + 2, 24, 22, '#9fb2c9', glass=mix(g, T['symbiont'], 0.5)))
        tiers = [(64, 30), (54, 30), (44, 30), (34, 26)]
        y = BASE - 2
        for i, (w, h) in enumerate(tiers):
            s.append(cyl(d, CX, y, w, h, STEEL if i % 2 == 0 else '#8d9bb8'))
            s.append(f'<rect x="{f(CX - w / 2 + 2)}" y="{f(y - h * 0.62)}" width="{f(w - 4)}" height="{f(h * 0.3)}" fill="{d.lin([(0, mix(g, "#ffffff", .5)), (1, g)], 0, 0, 1, 0)}" opacity="0.9"/>')
            s.append(glow(d, CX, y - h * 0.5, w * 0.7, g, 0.3))
            for j in range(-2, 3):
                s.append(f'<circle cx="{f(CX + j * w / 5.5)}" cy="{f(y - h * 0.68)}" r="2.6" fill="{mix(g, T["symbiont-2"], 0.5)}"/>')
            y -= h
        s.append(dome(d, CX, y, 18, 18, '#9fb2c9', glass=T['symbiont-2']))
        s.append(glow(d, CX, y - 10, 30, T['symbiont-2'], 0.45))
    return ''.join(s)


def workshop(d, lv):
    o = T['prod']
    s = []
    if lv == 0:
        s.append(pad(d, CX, BASE, 78))
        # 고철 더미
        for k, (x, y, r) in enumerate([(CX + 46, BASE - 2, 16), (CX + 62, BASE, 12), (CX + 34, BASE + 2, 10)]):
            s.append(f'<path d="M{x - r} {y}L{x - r * 0.4} {y - r}L{x + r * 0.3} {y - r * 0.8}L{x + r} {y}Z" fill="{d.lin([(0, lit(RUST, .3)), (1, shade(RUST, .5))], 0, 0, 1, 1)}"/>')
        # 천막 지붕 + 작업대
        s.append(f'<line x1="{CX - 52}" y1="{BASE}" x2="{CX - 52}" y2="{BASE - 52}" stroke="#4a3a2e" stroke-width="3"/>')
        s.append(f'<line x1="{CX + 10}" y1="{BASE}" x2="{CX + 10}" y2="{BASE - 40}" stroke="#4a3a2e" stroke-width="3"/>')
        s.append(f'<path d="M{CX - 62} {BASE - 50}L{CX + 22} {BASE - 40}L{CX + 18} {BASE - 30}L{CX - 60} {BASE - 38}Z" fill="{d.lin([(0, lit("#c08a5a", .3)), (1, shade("#a06a3e", .3))], 0, 0, 1, 1)}"/>')
        s.append(block(d, CX - 44, BASE - 2, 42, 14, 8, '#7b5b42'))
        s.append(glow(d, CX - 22, BASE - 22, 16, o, 0.8))
        s.append(glow(d, CX - 22, BASE - 22, 5, '#ffffff', 0.9))
        # 기중기 팔
        s.append(f'<path d="M{CX + 76} {BASE - 4}V{BASE - 70}L{CX + 34} {BASE - 56}" stroke="{STEEL}" stroke-width="3.4" fill="none" stroke-linejoin="round"/>')
        s.append(f'<line x1="{CX + 40}" y1="{BASE - 58}" x2="{CX + 40}" y2="{BASE - 34}" stroke="#2b2f3e" stroke-width="1.2"/>')
    elif lv == 1:
        s.append(pad(d, CX, BASE, 84))
        s.append(cyl(d, CX + 28, BASE - 50, 12, 34, RUST))
        s.append(smoke(d, CX + 28, BASE - 92, n=4, seed=2))
        s.append(block(d, CX - 56, BASE - 2, 92, 50, 26, PREFAB, roof='#8d6e55', win=o, win_cols=3))
        s.append(f'<rect x="{CX - 14}" y="{BASE - 30}" width="20" height="28" fill="{shade("#5a4434", .3)}"/>')
        s.append(glow(d, CX - 4, BASE - 12, 18, o, 0.5))
        s.append(crate(d, CX + 50, BASE + 6) + crate(d, CX + 58, BASE - 5, 0.8))
    elif lv == 2:
        s.append(pad(d, CX, BASE, 96))
        for x, h in [(CX - 30, 74), (CX + 4, 88)]:
            s.append(cyl(d, x, BASE - 40, 16, h, '#6e5a4e'))
            s.append(f'<rect x="{x - 8}" y="{BASE - 40 - h + 8}" width="16" height="4" fill="{T["danger"]}" opacity="0.8"/>')
            s.append(smoke(d, x, BASE - 50 - h, c='#9aa0b4', n=5, seed=x))
        s.append(block(d, CX - 76, BASE, 128, 54, 30, '#6f7896', roof='#59627e', win=o, win_cols=4))
        s.append(f'<path d="M{CX - 30} {BASE}v-26a14 14 0 0 1 28 0v26Z" fill="#2a1a12"/>')
        s.append(glow(d, CX - 16, BASE - 12, 30, o, 0.85))
        s.append(f'<path d="M{CX - 26} {BASE}v-20a10 10 0 0 1 20 0v20Z" fill="{d.lin([(0, "#fff1c4"), (1, o)])}"/>')
        s.append(f'<rect x="{CX + 58}" y="{BASE - 16}" width="36" height="6" fill="{STEEL}"/>' + crate(d, CX + 66, BASE - 16, 0.8, RUST))
    else:
        s.append(pad(d, CX, BASE, 104))
        s.append(block(d, CX - 92, BASE, 150, 76, 34, '#66708f', roof='#4f5875', win=o, win_rows=2, win_cols=5))
        # 갠트리 크레인
        s.append(f'<path d="M{CX - 98} {BASE - 2}V{BASE - 120}M{CX + 72} {BASE - 18}V{BASE - 132}M{CX - 104} {BASE - 118}L{CX + 78} {BASE - 130}" stroke="{lit(STEEL, .2)}" stroke-width="4" fill="none"/>')
        for k in range(6):
            x = CX - 98 + k * 30
            s.append(f'<path d="M{x} {BASE - 116 - k * 2}l15 -1l-15 12" stroke="{STEEL}" stroke-width="1.2" fill="none" opacity="0.8"/>')
        s.append(f'<rect x="{CX - 10}" y="{BASE - 132}" width="22" height="12" fill="{o}"/>' + glow(d, CX + 1, BASE - 126, 18, o, 0.6))
        s.append(f'<line x1="{CX + 1}" y1="{BASE - 120}" x2="{CX + 1}" y2="{BASE - 86}" stroke="#2b2f3e" stroke-width="1.4"/>')
        s.append(block(d, CX - 8, BASE - 76, 20, 12, 8, T['prod']))
        for x in (CX + 88, CX + 100):
            s.append(cyl(d, x, BASE - 4, 12, 70, '#5e5060'))
            s.append(glow(d, x, BASE - 74, 10, o, 0.7))
        s.append(smoke(d, CX + 94, BASE - 88, c='#9aa0b4', n=5, seed=9))
        s.append(f'<path d="M{CX - 60} {BASE}v-30a18 18 0 0 1 36 0v30Z" fill="#20140e"/>' + glow(d, CX - 42, BASE - 14, 34, o, 0.9))
        s.append(f'<path d="M{CX - 54} {BASE}v-24a12 12 0 0 1 24 0v24Z" fill="{d.lin([(0, "#fff1c4"), (1, o)])}"/>')
    return ''.join(s)


def power(d, lv):
    e = T['energy']
    s = []
    if lv == 1:
        s.append(pad(d, CX, BASE, 92))
        for i, (x, y) in enumerate([(CX - 70, BASE - 8), (CX - 26, BASE - 12), (CX + 18, BASE - 8), (CX + 62, BASE - 2)]):
            s.append(f'<line x1="{x + 14}" y1="{y}" x2="{x + 14}" y2="{y - 22}" stroke="#4b5068" stroke-width="3"/>')
            g = d.lin([(0, '#3b5a9a'), (0.45, '#1c2d58'), (0.55, mix(e, '#ffffff', .3)), (0.62, '#22356a'), (1, '#121c3c')], 0, 0, 1, 1)
            s.append(f'<path d="M{x} {y - 20}L{x + 32} {y - 30}L{x + 36} {y - 50}L{x + 4} {y - 40}Z" fill="{g}" stroke="{lit(STEEL, .2)}" stroke-width="1.2"/>')
            s.append(glow(d, x + 20, y - 36, 12, e, 0.5))
        s.append(block(d, CX - 18, BASE + 10, 28, 16, 10, STEEL, win=e, win_cols=2))
    elif lv == 2:
        s.append(pad(d, CX, BASE, 98))
        tw = d.lin([(0, lit(STONE, .35)), (0.4, STONE), (1, shade(STONE, .55))], 0, 0, 1, 0)
        s.append(f'<path d="M{CX - 70} {BASE}Q{CX - 54} {BASE - 50} {CX - 62} {BASE - 104}H{CX - 10}Q{CX - 18} {BASE - 50} {CX - 2} {BASE}Z" fill="{tw}"/>')
        s.append(f'<ellipse cx="{CX - 36}" cy="{BASE - 104}" rx="26" ry="6" fill="{shade(STONE, .6)}"/>')
        s.append(smoke(d, CX - 36, BASE - 118, c='#dfe4f2', n=6, s=1.5, seed=4))
        s.append(block(d, CX + 6, BASE, 70, 46, 24, '#6f7896', win=e, win_cols=3))
        s.append(f'<path d="M{CX - 4} {BASE - 20}H{CX + 10}M{CX + 76} {BASE - 30}h14v30" stroke="{e}" stroke-width="3" fill="none" opacity="0.9"/>')
        s.append(glow(d, CX + 90, BASE - 4, 20, e, 0.7))
        s.append(glow(d, CX - 36, BASE - 6, 28, mix(e, T['danger'], .4), 0.5))
    else:
        s.append(pad(d, CX, BASE, 92))
        s.append(block(d, CX - 50, BASE, 80, 26, 22, '#5f6886', win=e, win_cols=4))
        sp = d.lin([(0, lit('#aeb9d6', .4)), (0.5, '#7d88a8'), (1, shade('#5d6788', .5))], 0, 0, 1, 0)
        s.append(f'<path d="M{CX - 18} {BASE - 26}L{CX - 4} {BASE - 150}L{CX + 6} {BASE - 150}L{CX + 22} {BASE - 26}Z" fill="{sp}"/>')
        for r, y in [(46, BASE - 64), (34, BASE - 104), (22, BASE - 136)]:
            s.append(f'<ellipse cx="{CX + 1}" cy="{y}" rx="{r}" ry="{r * 0.28}" fill="none" stroke="{e}" stroke-width="3" opacity="0.85"/>')
            s.append(f'<ellipse cx="{CX + 1}" cy="{y}" rx="{r}" ry="{r * 0.28}" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.6"/>')
            s.append(glow(d, CX + 1, y, r * 0.9, e, 0.25))
        s.append(f'<path d="M{CX + 1} {BASE - 178}l9 16l-9 14l-9 -14Z" fill="{d.lin([(0, "#ffffff"), (1, e)])}"/>')
        s.append(glow(d, CX + 1, BASE - 162, 34, e, 0.8))
    return ''.join(s)


def lab(d, lv):
    b = T['sci']
    s = []
    if lv == 0:
        s.append(pad(d, CX, BASE, 78))
        s.append(dome(d, CX - 18, BASE - 2, 46, 36, '#c4b38f', ribs=3))
        s.append(f'<path d="M{CX - 26} {BASE - 2}v-16a8 8 0 0 1 16 0v16Z" fill="#1c2340"/>' + glow(d, CX - 18, BASE - 10, 14, b, 0.7))
        s.append(f'<line x1="{CX + 46}" y1="{BASE}" x2="{CX + 46}" y2="{BASE - 92}" stroke="{STEEL}" stroke-width="2.6"/>')
        s.append(f'<path d="M{CX + 36} {BASE - 70}l10 -8l10 8M{CX + 38} {BASE - 50}l8 -6l8 6" stroke="{STEEL}" stroke-width="1.4" fill="none"/>')
        s.append(glow(d, CX + 46, BASE - 94, 10, T['danger'], 0.8))
        s.append(f'<path d="M{CX + 56} {BASE - 6}a16 10 -30 0 1 20 -22" stroke="{lit(STEEL, .3)}" stroke-width="3" fill="none"/>')
        s.append(crate(d, CX + 22, BASE + 6))
    elif lv == 1:
        s.append(pad(d, CX, BASE, 76))
        s.append(cyl(d, CX - 6, BASE - 2, 76, 40, '#8f98b4', cap=False))
        s.append(dome(d, CX - 6, BASE - 42, 40, 38, '#c9d1e4', ribs=2))
        s.append(f'<path d="M{CX - 12} {BASE - 42}L{CX - 6} {BASE - 80}L{CX} {BASE - 42}Z" fill="#141b33"/>')
        s.append(f'<line x1="{CX - 6}" y1="{BASE - 56}" x2="{CX + 16}" y2="{BASE - 92}" stroke="{lit(STEEL, .3)}" stroke-width="5" stroke-linecap="round"/>')
        s.append(glow(d, CX - 6, BASE - 60, 24, b, 0.6))
        s.append(window(d, CX - 30, BASE - 30, 10, 12, b) + window(d, CX + 2, BASE - 30, 10, 12, b))
    elif lv == 2:
        s.append(pad(d, CX, BASE, 98))
        s.append(block(d, CX - 82, BASE, 96, 44, 26, '#7b84a2', win=b, win_cols=4))
        s.append(dome(d, CX - 34, BASE - 44, 30, 26, '#c9d1e4', ribs=2))
        s.append(glow(d, CX - 34, BASE - 54, 18, b, 0.5))
        # 큰 접시 안테나
        s.append(f'<path d="M{CX + 58} {BASE}L{CX + 50} {BASE - 46}H{CX + 66}Z" fill="{STEEL}"/>')
        dg = d.lin([(0, lit('#dfe6f5', .3)), (1, shade('#9aa6c6', .5))], 0, 0, 1, 1)
        s.append(f'<path d="M{CX + 22} {BASE - 74}Q{CX + 40} {BASE - 30} {CX + 96} {BASE - 54}Q{CX + 70} {BASE - 92} {CX + 22} {BASE - 74}Z" fill="{dg}"/>')
        s.append(f'<line x1="{CX + 58}" y1="{BASE - 62}" x2="{CX + 54}" y2="{BASE - 92}" stroke="{lit(STEEL, .3)}" stroke-width="2"/>' + glow(d, CX + 54, BASE - 94, 10, b, 0.9))
    else:
        s.append(pad(d, CX, BASE, 100))
        s.append(block(d, CX - 76, BASE, 124, 34, 30, '#6d7798', win=b, win_cols=5))
        cg = d.lin([(0, mix(b, '#ffffff', .7)), (0.45, b), (0.55, shade(b, .3)), (1, shade(b, .6))], 0, 0, 1, 0)
        s.append(glow(d, CX - 6, BASE - 100, 70, b, 0.35))
        s.append(f'<path d="M{CX - 28} {BASE - 34}L{CX - 12} {BASE - 140}L{CX - 6} {BASE - 172}L{CX + 2} {BASE - 140}L{CX + 18} {BASE - 34}Z" fill="{cg}" opacity="0.95"/>')
        s.append(f'<path d="M{CX - 6} {BASE - 172}L{CX - 4} {BASE - 34}" stroke="#ffffff" stroke-width="1.2" opacity="0.6"/>')
        s.append(f'<path d="M{CX - 46} {BASE - 34}L{CX - 40} {BASE - 92}L{CX - 32} {BASE - 34}Z" fill="{cg}" opacity="0.85"/>')
        s.append(f'<path d="M{CX + 24} {BASE - 34}L{CX + 32} {BASE - 80}L{CX + 40} {BASE - 34}Z" fill="{cg}" opacity="0.85"/>')
        for r, y in [(40, BASE - 70), (28, BASE - 116)]:
            s.append(f'<ellipse cx="{CX - 4}" cy="{y}" rx="{r}" ry="{r * 0.25}" fill="none" stroke="{mix(b, "#ffffff", .5)}" stroke-width="2.2" opacity="0.8"/>')
        s.append(glow(d, CX - 6, BASE - 172, 22, '#ffffff', 0.8))
    return ''.join(s)


def hall(d, lv):
    c = T['culture']
    s = []
    if lv == 1:
        s.append(pad(d, CX, BASE, 92))
        tg = d.lin([(0, lit('#d9c7a6', .3)), (0.5, '#b9a17c'), (1, shade('#9a8160', .5))], 0, 0, 1, 0)
        s.append(f'<path d="M{CX - 86} {BASE - 4}Q{CX - 40} {BASE - 30} {CX} {BASE - 78}Q{CX + 40} {BASE - 30} {CX + 86} {BASE - 4}Q{CX} {BASE + 8} {CX - 86} {BASE - 4}Z" fill="{tg}"/>')
        for k in range(-3, 4):
            s.append(f'<path d="M{CX} {BASE - 78}Q{CX + k * 14} {BASE - 30} {CX + k * 26} {BASE + 1 - abs(k)}" stroke="{shade("#9a8160", .3)}" stroke-width="1.1" fill="none" opacity="0.7"/>')
        s.append(f'<path d="M{CX - 18} {BASE}v-22a18 12 0 0 1 36 0v22Z" fill="#26182f"/>' + glow(d, CX, BASE - 12, 26, c, 0.8))
        s.append(banner(d, CX, BASE - 112, 36, c, 18) + banner(d, CX - 74, BASE - 40, 36, c, 14, flip=True) + banner(d, CX + 74, BASE - 40, 36, c, 14))
        for x in (CX - 48, CX + 48):
            s.append(glow(d, x, BASE - 20, 10, T['accent'], 0.8))
    elif lv == 2:
        s.append(pad(d, CX, BASE, 98))
        s.append(block(d, CX - 76, BASE, 136, 16, 30, STONE))
        s.append(block(d, CX - 70, BASE - 16, 124, 46, 26, '#a59fb2'))
        s.append(f'<rect x="{CX - 60}" y="{BASE - 56}" width="104" height="40" fill="{shade("#3b2a48", .2)}"/>')
        s.append(glow(d, CX - 8, BASE - 36, 44, c, 0.55))
        for k in range(6):
            x = CX - 62 + k * 20
            s.append(cyl(d, x + 6, BASE - 16, 9, 44, '#d8d2e2', cap=False))
        s.append(f'<path d="M{CX - 78} {BASE - 60}L{CX - 8} {BASE - 98}L{CX + 62} {BASE - 60}Z" fill="{d.lin([(0, lit("#b8b0c8", .3)), (1, shade("#8a8098", .4))], 0, 0, 1, 1)}"/>')
        s.append(f'<path d="M{CX + 62} {BASE - 60}L{CX - 8} {BASE - 98}L{CX + 18} {BASE - 112}L{CX + 88} {BASE - 74}Z" fill="{shade("#8a8098", .5)}"/>')
        s.append(f'<circle cx="{CX - 8}" cy="{BASE - 74}" r="7" fill="{c}"/>' + glow(d, CX - 8, BASE - 74, 14, c, 0.7))
    else:
        s.append(pad(d, CX, BASE, 104))
        s.append(block(d, CX - 90, BASE, 160, 18, 32, STONE))
        s.append(block(d, CX - 80, BASE - 18, 140, 40, 28, '#b3acc2'))
        for k in range(8):
            s.append(cyl(d, CX - 72 + k * 18 + 4, BASE - 18, 8, 40, '#e6e0ee', cap=False))
        s.append(f'<rect x="{CX - 82}" y="{BASE - 66}" width="144" height="10" fill="{lit("#b3acc2", .2)}"/>')
        s.append(glow(d, CX - 10, BASE - 100, 74, c, 0.45))
        s.append(dome(d, CX - 10, BASE - 64, 52, 50, '#c9b8dc', glass=c))
        s.append(f'<line x1="{CX - 10}" y1="{BASE - 114}" x2="{CX - 10}" y2="{BASE - 156}" stroke="{lit(STEEL, .4)}" stroke-width="3"/>')
        s.append(f'<circle cx="{CX - 10}" cy="{BASE - 158}" r="5" fill="#ffffff"/>' + glow(d, CX - 10, BASE - 158, 22, c, 0.9))
        s.append(banner(d, CX - 86, BASE - 60, 40, c, 14, flip=True) + banner(d, CX + 66, BASE - 60, 40, c, 14))
    return ''.join(s)


DRAW = {'farm': farm, 'workshop': workshop, 'power': power, 'lab': lab, 'hall': hall}
KINDS = ['farm', 'workshop', 'power', 'lab', 'hall']
LEVELS = {'farm': [0, 1, 2, 3], 'workshop': [0, 1, 2, 3], 'power': [1, 2, 3], 'lab': [0, 1, 2, 3], 'hall': [1, 2, 3]}
