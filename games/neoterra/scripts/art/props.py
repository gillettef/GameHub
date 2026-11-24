# 실물 토큰(정착민 말·자원 5종·행동 구슬)과 유산 기념물
from paint import T, Doc, block, cyl, f, glow, lit, mix, shade, shadow

PROP = 64  # props.webp 칸 크기(정사각)
PROPS = ['pawn', 'food', 'prod', 'energy', 'sci', 'culture', 'cmd', 'def', 'empty']


def pawn(d, cx, cy):
    """호박색 유리 말: 둥근 머리 + 종 모양 몸"""
    c = T['accent']
    g = d.rad([(0, mix(c, '#ffffff', .6)), (0.45, c), (1, shade(c, .55))], 0.35, 0.3, 0.8)
    return (shadow(d, cx + 3, cy + 26, 20, 5, 0.6) +
            f'<path d="M{cx - 18} {cy + 26}Q{cx - 18} {cy + 4} {cx - 7} {cy - 2}H{cx + 7}Q{cx + 18} {cy + 4} {cx + 18} {cy + 26}Z" fill="{g}"/>'
            f'<circle cx="{cx}" cy="{cy - 13}" r="11" fill="{g}"/>'
            f'<ellipse cx="{cx - 4}" cy="{cy - 17}" rx="4" ry="2.6" fill="#ffffff" opacity="0.7"/>'
            f'<path d="M{cx - 11} {cy + 6}Q{cx - 12} {cy + 18} {cx - 9} {cy + 24}" stroke="#ffffff" stroke-width="2.4" opacity="0.45" fill="none" stroke-linecap="round"/>')


def token(d, kind, cx, cy):
    c = T[kind]
    hi = mix(c, '#ffffff', .65)
    lo = shade(c, .5)
    s = [glow(d, cx, cy, 30, c, 0.35), shadow(d, cx + 2, cy + 16, 18, 5, 0.5)]
    if kind == 'food':  # 씨앗 꼬투리(둥근 원반)
        g = d.rad([(0, hi), (0.5, c), (1, lo)], 0.35, 0.3, 0.75)
        s.append(f'<ellipse cx="{cx}" cy="{cy + 2}" rx="20" ry="16" fill="{g}"/>')
        s.append(f'<path d="M{cx - 12} {cy + 2}Q{cx} {cy - 8} {cx + 12} {cy + 2}" stroke="{lo}" stroke-width="2" fill="none"/>')
    elif kind == 'prod':  # 청동 육각 덩이
        pts = ' '.join(f'{f(cx + 19 * __import__("math").cos(a))},{f(cy + 2 + 16 * __import__("math").sin(a))}' for a in [i * 1.0472 for i in range(6)])
        s.append(f'<polygon points="{pts}" fill="{d.lin([(0, hi), (0.5, c), (1, lo)], 0, 0, 1, 1)}"/>')
        s.append(f'<polygon points="{f(cx - 9)},{f(cy - 6)} {f(cx + 9)},{f(cy - 6)} {f(cx + 14)},{f(cy + 3)} {f(cx - 14)},{f(cy + 3)}" fill="{hi}" opacity="0.55"/>')
    elif kind == 'energy':  # 빛나는 원반
        s.append(glow(d, cx, cy, 26, c, 0.7))
        g = d.rad([(0, '#ffffff'), (0.35, hi), (0.8, c), (1, lo)], 0.4, 0.35, 0.7)
        s.append(f'<circle cx="{cx}" cy="{cy}" r="17" fill="{g}"/>')
    elif kind == 'sci':  # 푸른 결정 큐브
        s.append(f'<polygon points="{cx},{cy - 18} {cx + 17},{cy - 8} {cx},{cy + 2} {cx - 17},{cy - 8}" fill="{hi}"/>')
        s.append(f'<polygon points="{cx - 17},{cy - 8} {cx},{cy + 2} {cx},{cy + 20} {cx - 17},{cy + 10}" fill="{c}"/>')
        s.append(f'<polygon points="{cx + 17},{cy - 8} {cx},{cy + 2} {cx},{cy + 20} {cx + 17},{cy + 10}" fill="{lo}"/>')
    else:  # 문화 — 난초 보석(물방울)
        g = d.rad([(0, hi), (0.5, c), (1, lo)], 0.35, 0.35, 0.75)
        s.append(f'<path d="M{cx} {cy - 20}Q{cx + 18} {cy} {cx + 14} {cy + 10}Q{cx} {cy + 22} {cx - 14} {cy + 10}Q{cx - 18} {cy} {cx} {cy - 20}Z" fill="{g}"/>')
    s.append(f'<ellipse cx="{cx - 6}" cy="{cy - 6}" rx="5" ry="3" fill="#ffffff" opacity="0.6"/>')
    return ''.join(s)


def bead(d, kind, cx, cy):
    if kind == 'empty':
        g = d.rad([(0, '#05070f', .9), (0.8, '#141b33', .9), (1, '#3b4670', .9)], 0.5, 0.42, 0.55)
        return f'<circle cx="{cx}" cy="{cy}" r="20" fill="{g}"/><circle cx="{cx}" cy="{cy}" r="20" fill="none" stroke="#56628e" stroke-width="1.5" opacity="0.7"/>'
    c = '#e8ecf6' if kind == 'cmd' else '#e0413c'
    g = d.rad([(0, '#ffffff'), (0.3, mix(c, '#ffffff', .4)), (0.75, c), (1, shade(c, .6))], 0.36, 0.3, 0.75)
    return (shadow(d, cx + 3, cy + 18, 18, 5, 0.55) + f'<circle cx="{cx}" cy="{cy}" r="20" fill="{g}"/>'
            f'<ellipse cx="{cx - 7}" cy="{cy - 8}" rx="6" ry="4" fill="#ffffff" opacity="0.85"/>'
            f'<path d="M{cx + 8} {cy + 12}a14 14 0 0 0 9 -10" stroke="#ffffff" stroke-width="2" opacity="0.35" fill="none"/>')


def props_doc():
    d = Doc(PROP * len(PROPS), PROP, prefix='pr')
    for i, k in enumerate(PROPS):
        cx, cy = i * PROP + 32, 32
        if k == 'pawn':
            d.add(pawn(d, cx, cy + 2))
        elif k in ('cmd', 'def', 'empty'):
            d.add(bead(d, k, cx, cy - 2))
        else:
            d.add(token(d, k, cx, cy - 2))
    return d


# ───────────── 유산 기념물: 0 짓는 중(비계), 1~4 완성 ─────────────
CX, BASE = 60, 136
GOLD = T['ring3']


def monument(d, i):
    s = [shadow(d, CX + 5, BASE + 2, 44, 9, 0.6)]
    s.append(block(d, CX - 30, BASE + 4, 56, 12, 12, '#857f92'))
    if i == 0:
        s.append(f'<path d="M{CX - 14} {BASE - 8}L{CX - 8} {BASE - 66}H{CX + 6}L{CX + 12} {BASE - 8}Z" fill="{d.lin([(0, lit("#a9a2b6", .3)), (1, shade("#857f92", .4))], 0, 0, 1, 0)}"/>')
        for y in range(BASE - 12, BASE - 100, -18):
            s.append(f'<line x1="{CX - 26}" y1="{y}" x2="{CX + 24}" y2="{y}" stroke="#8a6a46" stroke-width="2.4"/>')
        for x in (CX - 24, CX + 22):
            s.append(f'<line x1="{x}" y1="{BASE - 8}" x2="{x}" y2="{BASE - 100}" stroke="#8a6a46" stroke-width="2.6"/>')
        s.append(f'<path d="M{CX - 24} {BASE - 30}L{CX + 22} {BASE - 66}M{CX - 24} {BASE - 66}L{CX + 22} {BASE - 30}" stroke="#6e5236" stroke-width="1.4"/>')
        s.append(f'<path d="M{CX + 34} {BASE - 4}V{BASE - 120}L{CX - 6} {BASE - 112}" stroke="#7f8aa6" stroke-width="3" fill="none"/>')
        s.append(f'<line x1="{CX - 2}" y1="{BASE - 112}" x2="{CX - 2}" y2="{BASE - 82}" stroke="#2b2f3e" stroke-width="1"/>')
        s.append(glow(d, CX - 2, BASE - 80, 10, T['warn'], 0.9))
    elif i == 1:  # 금빛 결정 오벨리스크
        s.append(glow(d, CX, BASE - 60, 50, GOLD, 0.4))
        g = d.lin([(0, mix(GOLD, '#ffffff', .6)), (0.45, GOLD), (0.55, shade(GOLD, .3)), (1, shade(GOLD, .6))], 0, 0, 1, 0)
        s.append(f'<path d="M{CX - 14} {BASE - 8}L{CX - 6} {BASE - 112}L{CX} {BASE - 128}L{CX + 6} {BASE - 112}L{CX + 14} {BASE - 8}Z" fill="{g}"/>')
        s.append(glow(d, CX, BASE - 126, 16, '#ffffff', 0.8))
    elif i == 2:  # 개척자 동상
        s.append(cyl(d, CX - 2, BASE - 8, 30, 30, '#9a94a8'))
        g = d.lin([(0, lit('#b6c0d8', .4)), (1, shade('#7b86a6', .5))], 0, 0, 1, 0)
        s.append(f'<path d="M{CX - 12} {BASE - 40}L{CX - 9} {BASE - 80}Q{CX - 2} {BASE - 88} {CX + 6} {BASE - 80}L{CX + 9} {BASE - 40}Z" fill="{g}"/>')
        s.append(f'<circle cx="{CX - 1}" cy="{BASE - 94}" r="8" fill="{g}"/>')
        s.append(f'<path d="M{CX + 6} {BASE - 76}L{CX + 24} {BASE - 110}" stroke="{lit("#b6c0d8", .3)}" stroke-width="5" stroke-linecap="round"/>')
        s.append(glow(d, CX + 25, BASE - 112, 14, GOLD, 0.9))
    elif i == 3:  # 떠 있는 고리를 인 아치
        g = d.lin([(0, lit('#a9a2b6', .35)), (1, shade('#857f92', .5))], 0, 0, 1, 0)
        s.append(f'<path d="M{CX - 30} {BASE - 8}V{BASE - 70}A30 30 0 0 1 {CX + 30} {BASE - 70}V{BASE - 8}H{CX + 18}V{BASE - 68}A18 18 0 0 0 {CX - 18} {BASE - 68}V{BASE - 8}Z" fill="{g}"/>')
        s.append(glow(d, CX, BASE - 50, 22, T['culture'], 0.6))
        s.append(f'<ellipse cx="{CX}" cy="{BASE - 118}" rx="20" ry="6" fill="none" stroke="{GOLD}" stroke-width="3.4"/>' + glow(d, CX, BASE - 118, 26, GOLD, 0.45))
    else:  # 생물발광 나무 조형
        s.append(f'<path d="M{CX - 6} {BASE - 8}Q{CX - 10} {BASE - 60} {CX} {BASE - 84}Q{CX + 8} {BASE - 60} {CX + 6} {BASE - 8}Z" fill="{d.lin([(0, lit("#6a5a78", .3)), (1, shade("#4a3a58", .4))], 0, 0, 1, 0)}"/>')
        for a, r in [(-40, 28), (-10, 34), (20, 30), (45, 24), (-70, 22)]:
            import math
            x = CX + math.sin(math.radians(a)) * r
            y = BASE - 84 - math.cos(math.radians(a)) * r * 0.8
            s.append(f'<path d="M{CX} {BASE - 80}Q{f((CX + x) / 2)} {f(y + 10)} {f(x)} {f(y)}" stroke="#5a4a68" stroke-width="3" fill="none"/>')
            s.append(glow(d, x, y, 16, T['symbiont'], 0.65) + f'<circle cx="{f(x)}" cy="{f(y)}" r="4" fill="{T["symbiont-2"]}"/>')
    return ''.join(s)
