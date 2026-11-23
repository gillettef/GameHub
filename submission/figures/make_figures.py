"""기획안 2쪽용 '게임 진행 모습' 그림 생성기.

실물 프로토타입 사진 전 대체 그림이다(공모전 공지: 손그림·구성물 그림 허용).
규칙 기준: rules/rulebook.md v0.4.

사용: python submission/figures/make_figures.py
출력: submission/figures/fig1-board.svg, fig2-flip.svg (+ 같은 이름 .html)
PNG 변환은 render.sh(Chrome headless)로 한다.
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent
FONT = "'NanumBarunGothic','NanumGothic','Malgun Gothic',sans-serif"

BLUE, BLUE_D = "#2f6db5", "#1d4a80"   # 선 플레이어
RED, RED_D = "#b8442f", "#7f2a1b"     # 후 플레이어
SAND = {"scout": "#d9ccb0", "warrior": "#e0ac35", "giant": "#c8553d"}
SAND_EDGE = {"scout": "#8f8268", "warrior": "#a97c1c", "giant": "#8e3424"}
GLASS = "#9fb2bf"
WOOD, WOOD_D = "#7a5634", "#5a3d22"


def bulb_paths(cx, cy, w, h):
    """세운 모래시계의 윗칸·아랫칸 외곽(중심 cx,cy, 폭 w, 전체 높이 h)."""
    t, b, m = cy - h / 2, cy + h / 2, cy
    hw = w / 2
    top = f"M{cx-hw},{t} C{cx-hw},{m-h*0.18} {cx-2},{m-h*0.04} {cx},{m} C{cx+2},{m-h*0.04} {cx+hw},{m-h*0.18} {cx+hw},{t} Z"
    bot = f"M{cx-hw},{b} C{cx-hw},{m+h*0.18} {cx-2},{m+h*0.04} {cx},{m} C{cx+2},{m+h*0.04} {cx+hw},{m+h*0.18} {cx+hw},{b} Z"
    return top, bot


_clip_id = [0]


def standing(cx, cy, kind, frac, scale=1.0, flowing=True):
    """세운 모래시계. frac = 윗칸 잔량 비율(0~1)."""
    w, h = 34 * scale, 64 * scale
    top, bot = bulb_paths(cx, cy, w, h)
    t, b = cy - h / 2, cy + h / 2
    s = []
    _clip_id[0] += 1
    ct, cb = f"ct{_clip_id[0]}", f"cb{_clip_id[0]}"
    s.append(f'<clipPath id="{ct}"><path d="{top}"/></clipPath><clipPath id="{cb}"><path d="{bot}"/></clipPath>')
    s.append(f'<path d="{top}" fill="#f7fafc"/><path d="{bot}" fill="#f7fafc"/>')
    # 윗칸 모래: 아래(목 쪽)부터 frac만큼
    half = h / 2
    ys = cy - half * frac
    s.append(f'<rect x="{cx-w}" y="{ys}" width="{2*w}" height="{cy-ys}" fill="{SAND[kind]}" clip-path="url(#{ct})"/>')
    # 아랫칸 모래: 바닥부터 (1-frac)만큼, 위를 약간 봉긋하게
    yb = b - half * (1 - frac)
    s.append(f'<path d="M{cx-w},{b} L{cx-w},{yb+4*scale} Q{cx},{yb-6*scale} {cx+w},{yb+4*scale} L{cx+w},{b} Z" fill="{SAND[kind]}" clip-path="url(#{cb})"/>')
    if flowing and 0 < frac < 1:
        s.append(f'<line x1="{cx}" y1="{cy}" x2="{cx}" y2="{yb}" stroke="{SAND_EDGE[kind]}" stroke-width="{1.4*scale}" stroke-dasharray="{2*scale},{2*scale}"/>')
    s.append(f'<path d="{top}" fill="#fff" fill-opacity=".18" stroke="{GLASS}" stroke-width="{1.3*scale}"/>')
    s.append(f'<path d="{bot}" fill="#fff" fill-opacity=".18" stroke="{GLASS}" stroke-width="{1.3*scale}"/>')
    # 육각 프레임 기둥과 캡
    s.append(f'<rect x="{cx-w/2-5*scale}" y="{t-6*scale}" width="{w+10*scale}" height="{6*scale}" rx="{2*scale}" fill="{WOOD}"/>')
    s.append(f'<rect x="{cx-w/2-5*scale}" y="{b}" width="{w+10*scale}" height="{6*scale}" rx="{2*scale}" fill="{WOOD}"/>')
    s.append(f'<rect x="{cx-w/2-4*scale}" y="{t}" width="{3*scale}" height="{h}" fill="{WOOD_D}"/>')
    s.append(f'<rect x="{cx+w/2+1*scale}" y="{t}" width="{3*scale}" height="{h}" fill="{WOOD_D}"/>')
    return "".join(s)


def lying(cx, cy, kind, frac, toward="up", scale=1.0):
    """눕힌 모래시계(위에서 본 모습). 윗칸이 주인 쪽(toward)을 향한다."""
    # 위에서 보면 세운 모래시계를 그대로 눕힌 실루엣. toward=up이면 윗칸이 화면 위.
    g = standing(cx, cy, kind, frac, scale, flowing=False)
    if toward == "down":
        g = f'<g transform="rotate(180 {cx} {cy})">{g}</g>'
    return g


def base(cx, cy, color, dark, r=46, lying_piece=False):
    ry = r * (0.95 if lying_piece else 0.42)
    yy = cy if lying_piece else cy + 34
    return (f'<ellipse cx="{cx}" cy="{yy+3}" rx="{r+2}" ry="{ry+2}" fill="#000" opacity=".18"/>'
            f'<ellipse cx="{cx}" cy="{yy}" rx="{r}" ry="{ry}" fill="{color}" stroke="{dark}" stroke-width="2.5"/>')


def text(x, y, s, size=20, color="#3b2a17", anchor="middle", weight="normal"):
    return f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" fill="{color}" text-anchor="{anchor}" font-weight="{weight}">{s}</text>'


def arrow(x1, y1, x2, y2, color, width=6):
    return (f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{width}" stroke-linecap="round" marker-end="url(#ah-{color[1:]})"/>')


def markers(*colors):
    return "".join(
        f'<marker id="ah-{c[1:]}" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 Z" fill="{c}"/></marker>'
        for c in colors)


# ---------------------------------------------------------------- 그림 1
def fig1():
    W, H = 1500, 1000
    CELL, BX, BY = 150, 380, 115           # 보드 좌상단
    def cell(col, row):                    # col 'A'..'E', row 1..5 (1 = 선 플레이어 쪽, 화면 아래)
        c = "ABCDE".index(col)
        return BX + CELL * c + CELL / 2, BY + CELL * (5 - row) + CELL / 2

    s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">',
         f'<defs>{markers("#1d4a80", "#7f2a1b", "#3b2a17")}'
         '<pattern id="dune" width="46" height="20" patternUnits="userSpaceOnUse"><path d="M0 14 Q11.5 7 23 14 T46 14" fill="none" stroke="#cfae6f" stroke-width="1.3" opacity=".55"/></pattern>'
         '<pattern id="wood" width="120" height="16" patternUnits="userSpaceOnUse"><path d="M0 8 Q30 4 60 8 T120 8" fill="none" stroke="#6b4c30" stroke-width="1" opacity=".35"/></pattern>'
         '</defs>',
         f'<rect width="{W}" height="{H}" fill="#8a6847"/><rect width="{W}" height="{H}" fill="url(#wood)"/>']

    # 보드
    s.append(f'<rect x="{BX-26}" y="{BY-26}" width="{CELL*5+52}" height="{CELL*5+52}" rx="16" fill="#b8925a" stroke="#7d6036" stroke-width="3"/>')
    s.append(f'<rect x="{BX}" y="{BY}" width="{CELL*5}" height="{CELL*5}" fill="#efdcb3"/>')
    s.append(f'<rect x="{BX}" y="{BY}" width="{CELL*5}" height="{CELL*5}" fill="url(#dune)"/>')
    s.append(f'<rect x="{BX}" y="{BY}" width="{CELL*5}" height="{CELL}" fill="{RED}" opacity=".10"/>')
    s.append(f'<rect x="{BX}" y="{BY+CELL*4}" width="{CELL*5}" height="{CELL}" fill="{BLUE}" opacity=".10"/>')
    for i in range(1, 5):
        s.append(f'<line x1="{BX+CELL*i}" y1="{BY}" x2="{BX+CELL*i}" y2="{BY+CELL*5}" stroke="#b9975e" stroke-width="2"/>')
        s.append(f'<line x1="{BX}" y1="{BY+CELL*i}" x2="{BX+CELL*5}" y2="{BY+CELL*i}" stroke="#b9975e" stroke-width="2"/>')
    for i, c in enumerate("ABCDE"):
        s.append(text(BX + CELL * i + CELL / 2, BY + CELL * 5 + 52, c, 22, "#f3e6cc"))
    for r in range(1, 6):
        s.append(text(BX - 44, BY + CELL * (5 - r) + CELL / 2 + 8, str(r), 22, "#f3e6cc"))
    # 샘
    for col, row in [("B", 2), ("D", 2), ("B", 4), ("D", 4)]:
        x, y = cell(col, row)
        s.append(f'<ellipse cx="{x}" cy="{y}" rx="60" ry="50" fill="#79bfdc" stroke="#3f8fb3" stroke-width="3" opacity=".85"/>')
        s.append(f'<path d="M{x-30},{y+6} q15,-10 30,0 t30,0" fill="none" stroke="#e8f6fb" stroke-width="3"/>')
    # 유적
    for col in "ACE":
        x, y = cell(col, 3)
        s.append(f'<g fill="none" stroke="#8a6a44" stroke-width="5" stroke-linejoin="round" opacity=".85">'
                 f'<path d="M{x-50},{y+44} H{x+50} M{x-42},{y+44} V{y-18} M{x-14},{y+44} V{y-18} M{x+14},{y+44} V{y-18} M{x+42},{y+44} V{y-18} M{x-54},{y-18} H{x+54} L{x},{y-50} Z"/></g>')

    # 후 플레이어(빨강, 대기 중 → 눕힘, 윗칸이 화면 위 = 주인 쪽)
    reds = [("C", 4, "scout", 0.22), ("A", 3, "warrior", 0.35), ("D", 5, "giant", 0.95)]
    for col, row, kind, frac in reds:
        x, y = cell(col, row)
        s.append(base(x, y, RED, RED_D, lying_piece=True))
        s.append(lying(x, y, kind, frac, "up", 1.05))
    # 선 플레이어(파랑, 활성 → 세움)
    blues = [("C", 3, "warrior", 0.42), ("B", 2, "scout", 0.93), ("A", 2, "giant", 0.55), ("E", 1, "warrior", 0.97)]
    for col, row, kind, frac in blues:
        x, y = cell(col, row)
        s.append(base(x, y, BLUE, BLUE_D))
        s.append(standing(x, y - 6, kind, frac, 1.15))

    # 밀어내기 화살표: C3 전사 → C4 정찰병을 C5로
    x3, y3 = cell("C", 4)
    s.append(arrow(x3 + 58, y3 + 40, x3 + 58, y3 - 70, "#1d4a80", 7))
    ex, ey = cell("E", 4)
    s.append(f'<rect x="{ex-70}" y="{ey-34}" width="140" height="68" rx="10" fill="#fffaf0" stroke="#1d4a80" stroke-width="2"/>')
    s.append(text(ex, ey - 6, "밀어내기", 21, "#1d4a80", weight="bold"))
    s.append(text(ex, ey + 20, "C4 적을 C5로", 16, "#1d4a80"))
    # 샘 뒤집기 표시: B2 정찰병
    xb, yb = cell("B", 2)
    s.append(f'<path d="M{xb-64},{yb-30} a28,28 0 1,1 0,40" fill="none" stroke="#1d4a80" stroke-width="5" marker-end="url(#ah-1d4a80)"/>')
    s.append(f'<rect x="{xb-150}" y="{yb+44}" width="140" height="34" rx="8" fill="#fffaf0" stroke="#1d4a80" stroke-width="2"/>')
    s.append(text(xb - 80, yb + 68, "샘에서 뒤집기", 18, "#1d4a80", weight="bold"))

    # 대모래시계 (오른쪽)
    gx, gy = 1290, 330
    s.append(f'<ellipse cx="{gx}" cy="{gy+120}" rx="80" ry="22" fill="#000" opacity=".2"/>')
    s.append(standing(gx, gy, "warrior", 0.38, 3.2))
    s.append(f'<rect x="{gx-120}" y="{gy+150}" width="240" height="66" rx="10" fill="#fffaf0" stroke="#5a3d22" stroke-width="2"/>')
    s.append(text(gx, gy + 178, "대모래시계 20분", 22, "#3b2a17", weight="bold"))
    s.append(text(gx, gy + 204, "언제나 흐른다", 18, "#3b2a17"))

    # 비축 (오른쪽 아래: 파랑 / 오른쪽 위: 빨강)
    s.append(text(1290, 640, "선 플레이어 비축", 20, "#f3e6cc"))
    for i, (kind) in enumerate(["scout"]):
        s.append(base(1290, 715, BLUE, BLUE_D, r=40, lying_piece=True))
        s.append(lying(1290, 715, kind, 1.0, "down", 0.9))
    s.append(text(1290, 75, "후 플레이어 비축", 20, "#f3e6cc"))
    for i, kind in enumerate(["scout", "warrior"]):
        x = 1240 + i * 100
        s.append(base(x, 150, RED, RED_D, r=40, lying_piece=True))
        s.append(lying(x, 150, kind, 1.0, "up", 0.9))

    # 점수 트랙 (왼쪽)
    tx = 150
    s.append(f'<rect x="{tx-50}" y="{BY-26}" width="100" height="{CELL*5+52}" rx="12" fill="#b8925a" stroke="#7d6036" stroke-width="3"/>')
    for i in range(16):
        y = BY + CELL * 5 - 10 - i * 47
        s.append(f'<rect x="{tx-34}" y="{y-34}" width="68" height="40" rx="5" fill="#efdcb3" stroke="#b9975e"/>')
        s.append(text(tx, y - 7, str(i * 2), 16, "#6a5132"))
    def score_marker(points, color, dark, dx):
        i = points // 2
        y = BY + CELL * 5 - 10 - i * 47 - 14
        return f'<circle cx="{tx+dx}" cy="{y}" r="14" fill="{color}" stroke="{dark}" stroke-width="2.5"/>'
    s.append(score_marker(14, BLUE, BLUE_D, -52))
    s.append(score_marker(12, RED, RED_D, 52))
    s.append(text(tx, BY - 42, "점수 트랙", 20, "#f3e6cc"))

    # 플레이어 표시
    s.append(text(BX + CELL * 2.5, 60, "후 플레이어 (대기 중: 모래시계를 눕혀 멈춤)", 24, "#ffd9cf", weight="bold"))
    s.append(text(BX + CELL * 2.5, H - 18, "선 플레이어 (내 차례: 모래시계를 세워 흐름)", 24, "#d5e6ff", weight="bold"))
    s.append("</svg>")
    return "".join(s), W, H


# ---------------------------------------------------------------- 그림 2
def fig2():
    W, H = 1500, 560
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">',
         f'<defs>{markers("#3b2a17", "#1d4a80", "#7f2a1b")}</defs>',
         f'<rect width="{W}" height="{H}" fill="#fbf6ec"/>']
    panels = [
        ("① 샘에서 뒤집기", "거의 빈 아군 → 되살아남", "warrior", 0.12, 0.88, BLUE, BLUE_D),
        ("② 강제 뒤집기", "가득 찬 적 → 곧 무너짐", "warrior", 0.9, 0.1, RED, RED_D),
    ]
    for i, (title, sub, kind, a, b, col, dark) in enumerate(panels):
        x0 = 30 + i * 500
        s.append(f'<rect x="{x0}" y="24" width="470" height="{H-48}" rx="18" fill="#fff" stroke="#d9c7a3" stroke-width="2"/>')
        s.append(text(x0 + 235, 74, title, 30, "#3b2a17", weight="bold"))
        s.append(text(x0 + 235, H - 52, sub, 24, dark, weight="bold"))
        s.append(base(x0 + 120, 300, col, dark, r=58))
        s.append(standing(x0 + 120, 280, kind, a, 2.4))
        s.append(arrow(x0 + 200, 280, x0 + 270, 280, "#3b2a17", 7))
        s.append(base(x0 + 350, 300, col, dark, r=58))
        s.append(standing(x0 + 350, 280, kind, b, 2.4))
        s.append(text(x0 + 120, 420, f"잔량 {int(a*100)}%", 20))
        s.append(text(x0 + 350, 420, f"잔량 {int(b*100)}%", 20))
    # ③ 밀어내기
    x0 = 1030
    s.append(f'<rect x="{x0}" y="24" width="440" height="{H-48}" rx="18" fill="#fff" stroke="#d9c7a3" stroke-width="2"/>')
    s.append(text(x0 + 220, 74, "③ 밀어내기", 30, "#3b2a17", weight="bold"))
    s.append(text(x0 + 220, H - 52, "가장자리 밖으로 밀리면 소멸", 24, "#7f2a1b", weight="bold"))
    cw, gy = 120, 220
    for k in range(3):
        s.append(f'<rect x="{x0+40+k*cw}" y="{gy}" width="{cw}" height="{cw}" fill="#efdcb3" stroke="#b9975e" stroke-width="2"/>')
    s.append(f'<rect x="{x0+40+3*cw-6}" y="{gy-10}" width="10" height="{cw+20}" fill="#7d6036"/>')
    s.append(text(x0 + 40 + 2.5 * cw, gy + cw + 34, "보드 끝", 18, "#7d6036"))
    s.append(base(x0 + 40 + cw * 1.5, gy + cw / 2, BLUE, BLUE_D, r=42))
    s.append(standing(x0 + 40 + cw * 1.5, gy + cw / 2 - 26, "warrior", 0.5, 1.2))
    s.append(base(x0 + 40 + cw * 2.5, gy + cw / 2, RED, RED_D, r=42, lying_piece=True))
    s.append(lying(x0 + 40 + cw * 2.5, gy + cw / 2, "scout", 0.15, "up", 1.0))
    s.append(arrow(x0 + 40 + cw * 2.5 + 40, gy + cw / 2, x0 + 40 + cw * 3 + 50, gy + cw / 2, "#7f2a1b", 7))
    s.append(text(x0 + 220, gy - 30, "잔량이 적은 적은 뒤집지 말고 민다", 19))
    s.append("</svg>")
    return "".join(s), W, H


# ---------------------------------------------------------------- 그림 3: 룰북용 보드 배치도
def fig3():
    CELL, BX, BY = 110, 70, 70
    W, H = BX * 2 + CELL * 5 + 170, BY * 2 + CELL * 5
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<rect x="{BX}" y="{BY}" width="{CELL*5}" height="{CELL*5}" fill="#f3e4c2" stroke="#8a6a44" stroke-width="3"/>',
         f'<rect x="{BX}" y="{BY}" width="{CELL*5}" height="{CELL}" fill="{RED}" opacity=".13"/>',
         f'<rect x="{BX}" y="{BY+CELL*4}" width="{CELL*5}" height="{CELL}" fill="{BLUE}" opacity=".13"/>']
    for i in range(1, 5):
        s.append(f'<line x1="{BX+CELL*i}" y1="{BY}" x2="{BX+CELL*i}" y2="{BY+CELL*5}" stroke="#b9975e" stroke-width="2"/>')
        s.append(f'<line x1="{BX}" y1="{BY+CELL*i}" x2="{BX+CELL*5}" y2="{BY+CELL*i}" stroke="#b9975e" stroke-width="2"/>')
    for i, c in enumerate("ABCDE"):
        s.append(text(BX + CELL * i + CELL / 2, BY - 18, c, 24, weight="bold"))
    for r in range(1, 6):
        s.append(text(BX - 26, BY + CELL * (5 - r) + CELL / 2 + 8, str(r), 24, weight="bold"))
    def c(col, row):
        return BX + CELL * "ABCDE".index(col) + CELL / 2, BY + CELL * (5 - row) + CELL / 2
    for col, row in [("B", 2), ("D", 2), ("B", 4), ("D", 4)]:
        x, y = c(col, row)
        s.append(f'<ellipse cx="{x}" cy="{y}" rx="42" ry="34" fill="#79bfdc" stroke="#3f8fb3" stroke-width="3"/>')
        s.append(text(x, y + 8, "샘", 22, "#123b52", weight="bold"))
    for col in "ACE":
        x, y = c(col, 3)
        s.append(f'<g fill="none" stroke="#8a6a44" stroke-width="4" opacity=".7"><path d="M{x-36},{y+32} H{x+36} M{x-30},{y+32} V{y-12} M{x+30},{y+32} V{y-12} M{x-40},{y-12} H{x+40} L{x},{y-36} Z"/></g>')
        s.append(text(x, y + 22, "유적", 22, "#5a3d22", weight="bold"))
    lx = BX + CELL * 5 + 24
    s.append(text(lx, BY + CELL / 2 - 4, "후 플레이어", 20, RED_D, "start", "bold"))
    s.append(text(lx, BY + CELL / 2 + 22, "소환 줄", 20, RED_D, "start"))
    s.append(text(lx, BY + CELL * 4.5 - 4, "선 플레이어", 20, BLUE_D, "start", "bold"))
    s.append(text(lx, BY + CELL * 4.5 + 22, "소환 줄", 20, BLUE_D, "start"))
    s.append("</svg>")
    return "".join(s), W, H


def write(name, svg, w, h):
    (OUT / f"{name}.svg").write_text(svg, encoding="utf-8")
    html = (f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>{name}</title>'
            f'<style>html,body{{margin:0;background:#fff}}svg{{display:block}}</style></head><body>{svg}</body></html>')
    (OUT / f"{name}.html").write_text(html, encoding="utf-8")
    print(name, w, h)


if __name__ == "__main__":
    write("fig1-board", *fig1())
    write("fig2-flip", *fig2())
    write("fig3-layout", *fig3())
