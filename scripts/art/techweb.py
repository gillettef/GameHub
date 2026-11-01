# 테크 웹 바탕: 착륙지를 중심으로 한 행성 지도 회화(768x768 = viewBox 384 의 2배, 중심 384,384).
# 방향 순서는 판마다 달라서 방향별 색은 굽지 않는다(노드·고리 색은 SVG 가 CSS 변수로 그린다).
import math
import random

from paint import T, Doc, f, glow, mix

S = 768
C = S / 2


def blob(rnd, cx, cy, r, n=10):
    pts = []
    for k in range(n):
        a = k / n * math.tau
        rr = r * rnd.uniform(0.65, 1.15)
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr * 0.9))
    d = f'M{f((pts[0][0] + pts[-1][0]) / 2)} {f((pts[0][1] + pts[-1][1]) / 2)}'
    for i, p in enumerate(pts):
        q = pts[(i + 1) % n]
        d += f'Q{f(p[0])} {f(p[1])} {f((p[0] + q[0]) / 2)} {f((p[1] + q[1]) / 2)}'
    return d + 'Z'


def map_doc():
    d = Doc(S, S, prefix='tw')
    rnd = random.Random(7)
    pf = d.paint_filter(disp=4, streak=0.3, freq=0.02, brush='0.03 0.08', seed=5)
    clip = d.id('c')
    d.defs.append(f'<clipPath id="{clip}"><circle cx="{C}" cy="{C}" r="372"/></clipPath>')
    body = []
    sea = d.rad([(0, '#1d2a48'), (0.6, '#141d38'), (1, '#0c1226')], 0.5, 0.5, 0.5)
    body.append(f'<rect width="{S}" height="{S}" fill="{sea}"/>')
    b18, b6 = d.blur(18), d.blur(5)
    # 대륙(흐린 황토·이끼 덩이)
    for _ in range(9):
        a, r = rnd.uniform(0, math.tau), rnd.uniform(60, 300)
        c = rnd.choice(['#3a3a40', '#3d4238', '#463c3a', '#33404a'])
        body.append(f'<path d="{blob(rnd, C + math.cos(a) * r, C + math.sin(a) * r, rnd.uniform(70, 150))}" fill="{c}" opacity="0.85" filter="{b6}"/>')
        body.append(f'<path d="{blob(rnd, C + math.cos(a) * r + 10, C + math.sin(a) * r - 8, rnd.uniform(30, 80))}" fill="{mix(c, "#8a7a5a", .3)}" opacity="0.5" filter="{b18}"/>')
    # 생물발광 강줄기: 중심에서 바깥으로 구불구불
    for k in range(7):
        a = k / 7 * math.tau + rnd.uniform(-0.2, 0.2)
        x, y = C, C
        dd = f'M{f(x)} {f(y)}'
        for step in range(8):
            a += rnd.uniform(-0.45, 0.45)
            nx, ny = x + math.cos(a) * 48, y + math.sin(a) * 48
            dd += f'Q{f(x + math.cos(a + 0.6) * 30)} {f(y + math.sin(a + 0.6) * 30)} {f(nx)} {f(ny)}'
            x, y = nx, ny
        col = rnd.choice([T['symbiont'], T['ark'], T['symbiont-2']])
        body.append(f'<path d="{dd}" stroke="{col}" stroke-width="7" fill="none" opacity="0.18" filter="{b6}"/>')
        body.append(f'<path d="{dd}" stroke="{col}" stroke-width="1.6" fill="none" opacity="0.4"/>')
    # 분화구
    for _ in range(14):
        x, y, r = rnd.uniform(60, S - 60), rnd.uniform(60, S - 60), rnd.uniform(8, 26)
        body.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="#0b1022" opacity="0.45"/><path d="M{f(x - r)} {f(y)}A{f(r)} {f(r)} 0 0 1 {f(x + r)} {f(y)}" stroke="#8a90a8" stroke-width="1.4" fill="none" opacity="0.35"/>')
    # 포자 안개
    for _ in range(8):
        body.append(f'<ellipse cx="{f(rnd.uniform(0, S))}" cy="{f(rnd.uniform(0, S))}" rx="{f(rnd.uniform(80, 180))}" ry="{f(rnd.uniform(30, 60))}" fill="{rnd.choice([T["symbiont"], T["ring2"]])}" opacity="0.08" filter="{b18}"/>')
    # 측량 격자(위도·경도 느낌)
    for r in range(80, 380, 60):
        body.append(f'<circle cx="{C}" cy="{C}" r="{r}" fill="none" stroke="#c9d3e6" stroke-width="0.8" opacity="0.07"/>')
    for k in range(12):
        a = k / 12 * math.tau
        body.append(f'<line x1="{C}" y1="{C}" x2="{f(C + math.cos(a) * 380)}" y2="{f(C + math.sin(a) * 380)}" stroke="#c9d3e6" stroke-width="0.8" opacity="0.05"/>')
    body.append(glow(d, C, C, 90, T['accent'], 0.3))
    d.add(f'<g clip-path="url(#{clip})"><g filter="{pf}">{"".join(body)}</g></g>')
    # 행성 가장자리: 대기 테두리 + 바깥으로 서서히 투명
    d.add(f'<circle cx="{C}" cy="{C}" r="372" fill="{d.rad([(0, "#000", 0), (0.8, "#000", 0), (1, "#05070f", 0.55)], .5, .5, .5)}"/>')
    d.add(f'<circle cx="{C}" cy="{C}" r="372" fill="none" stroke="{T["ark"]}" stroke-width="3" opacity="0.35"/>')
    d.add(glow(d, C, C, 384, T['ark'], 0.0))
    return d
