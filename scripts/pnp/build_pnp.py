"""LIGHTCONE 출력용 종이 프로토타입(Print & Play) PDF 생성기.

룰북 기준: rules/rulebook.md (단순판). 수량은 components/components.md를 따른다.
실행: python scripts/pnp/build_pnp.py  → print/ 폴더에 PDF 생성
"""
from collections import deque
from pathlib import Path

from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.pagesizes import A4, A3, landscape
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "print"
VERSION = "v0.7"

pdfmetrics.registerFont(TTFont("KR", "C:/Windows/Fonts/malgun.ttf"))
pdfmetrics.registerFont(TTFont("KRB", "C:/Windows/Fonts/malgunbd.ttf"))

# ---------------------------------------------------------------- 지도 데이터
ADJ = {
    "A": ["1", "2", "3"],
    "1": ["A", "2", "4", "5"], "2": ["A", "1", "3", "5", "6"], "3": ["A", "2", "6", "7"],
    "4": ["1", "5", "8"], "5": ["1", "2", "4", "6", "8", "9"],
    "6": ["2", "3", "5", "7", "9", "10"], "7": ["3", "6", "10"],
    "8": ["4", "5", "9", "11", "12"], "9": ["5", "6", "8", "10", "12", "13"],
    "10": ["6", "7", "9", "13", "14"],
    "11": ["8", "12", "15"], "12": ["8", "9", "11", "13", "15", "16"],
    "13": ["9", "10", "12", "14", "16", "17"], "14": ["10", "13", "17"],
    "15": ["11", "12", "16", "B"], "16": ["12", "13", "15", "17", "B"], "17": ["13", "14", "16", "B"],
    "B": ["15", "16", "17"],
}
PLANETS = ["2", "4", "7", "8", "9", "10", "11", "14", "16"]
SYSTEMS = ["A"] + [str(i) for i in range(1, 18)] + ["B"]
# 열(x)과 행(y) 좌표. 성계 9(3, 2) 기준 점대칭.
POS = {
    "A": (0, 2), "1": (1, 1), "2": (1, 2), "3": (1, 3),
    "4": (2, 0.5), "5": (2, 1.5), "6": (2, 2.5), "7": (2, 3.5),
    "8": (3, 1), "9": (3, 2), "10": (3, 3),
    "11": (4, 0.5), "12": (4, 1.5), "13": (4, 2.5), "14": (4, 3.5),
    "15": (5, 1), "16": (5, 2), "17": (5, 3), "B": (6, 2),
}


def bfs(src):
    d = {src: 0}
    q = deque([src])
    while q:
        u = q.popleft()
        for v in ADJ[u]:
            if v not in d:
                d[v] = d[u] + 1
                q.append(v)
    return d


DA, DB = bfs("A"), bfs("B")
RIPPLE = {s: max(DA[s], DB[s]) for s in SYSTEMS}
for s in SYSTEMS:  # 인접표 대칭 검사
    for t in ADJ[s]:
        assert s in ADJ[t], (s, t)

# ---------------------------------------------------------------- 스타일
PLAYER = {
    "A": {"name": "플레이어 A", "main": HexColor("#2563A8"), "light": HexColor("#DCE8F6"), "dark": HexColor("#173E6B")},
    "B": {"name": "플레이어 B", "main": HexColor("#C2551D"), "light": HexColor("#F8E3D6"), "dark": HexColor("#7A3311")},
}
INK = HexColor("#1F2328")
MUTED = HexColor("#6B7280")
LINE = HexColor("#9AA3AE")
PLANET = HexColor("#2F855A")
STRENGTH = {1: 2, 2: 2, 3: 3}
CW, CH = 40 * mm, 55 * mm  # 카드 크기

# 수량 (components/components.md)
STAY_PER_FLEET = 3
PLANET_COPIES = 2
DECOYS = 3
HOLD_MARKERS = 9
STRIKE_MARKERS = 6


def label(s):
    return {"A": "A", "B": "B"}.get(s, s)


def text_c(c, x, y, s, font="KR", size=8, color=INK):
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawCentredString(x, y, s)


def footer(c, w, title):
    c.setFont("KR", 7)
    c.setFillColor(MUTED)
    c.drawString(10 * mm, 6 * mm, f"LIGHTCONE {VERSION} 출력용 프로토타입 · {title}")


# ---------------------------------------------------------------- 지도 그리기
def draw_map(c, ox, oy, sx, sy, node_r, slot=None):
    """ox, oy: 왼쪽 위 기준 원점(PDF 좌표). sx, sy: 열·행 간격."""
    def xy(s):
        x, y = POS[s]
        return ox + x * sx, oy - y * sy

    c.setStrokeColor(LINE)
    c.setLineWidth(1.6 if slot is None else 0.8)
    drawn = set()
    for s in SYSTEMS:
        for t in ADJ[s]:
            key = tuple(sorted((s, t)))
            if key in drawn:
                continue
            drawn.add(key)
            (x1, y1), (x2, y2) = xy(s), xy(t)
            c.line(x1, y1, x2, y2)

    for s in SYSTEMS:
        x, y = xy(s)
        if slot is not None:
            w, h = slot
            fill = PLAYER[s]["light"] if s in PLAYER else (HexColor("#E8F3EC") if s in PLANETS else white)
            c.setFillColor(fill)
            c.setStrokeColor(INK)
            c.setLineWidth(0.8)
            c.roundRect(x - w / 2, y - h / 2, w, h, 2 * mm, fill=1, stroke=1)
            text_c(c, x, y + h / 2 - 7 * mm, label(s), "KRB", 16)
            sub = "모항성" if s in PLAYER else ("행성" if s in PLANETS else "성계")
            text_c(c, x, y + h / 2 - 11 * mm, sub, "KR", 7, MUTED)
            text_c(c, x, y - h / 2 + 3 * mm, "함대 1 · 2 · 3 카드를 겹쳐 둔다", "KR", 5.5, MUTED)
            continue
        if s in PLAYER:
            p = PLAYER[s]
            c.setFillColor(p["main"])
            c.setStrokeColor(p["dark"])
            c.setLineWidth(2)
            c.circle(x, y, node_r * 1.35, fill=1, stroke=1)
            text_c(c, x, y + 1.2 * mm, label(s), "KRB", 18, white)
            text_c(c, x, y - 4.5 * mm, "모항성", "KR", 7, white)
            continue
        is_p = s in PLANETS
        c.setFillColor(HexColor("#E8F3EC") if is_p else white)
        c.setStrokeColor(PLANET if is_p else INK)
        c.setLineWidth(2.4 if is_p else 1.2)
        c.circle(x, y, node_r, fill=1, stroke=1)
        text_c(c, x, y - 1.5 * mm if not is_p else y - 0.5 * mm, label(s), "KRB", 14)
        if is_p:
            text_c(c, x, y - 5.5 * mm, "행성", "KR", 6, PLANET)
            # 파문 거리 배지
            bx, by = x + node_r * 0.85, y + node_r * 0.85
            c.setFillColor(PLANET)
            c.circle(bx, by, 3.6 * mm, fill=1, stroke=0)
            text_c(c, bx, by - 1.3 * mm, str(RIPPLE[s]), "KRB", 9, white)


def page_main_board(c):
    w, h = landscape(A4)
    c.setPageSize((w, h))
    text_c(c, w / 2, h - 12 * mm, "LIGHTCONE 메인 보드", "KRB", 14)
    text_c(c, w / 2, h - 17.5 * mm, "초록 원 = 행성 · 초록 배지 숫자 = 파문 거리(행성 카드를 놓는 칸 번호)", "KR", 8, MUTED)
    draw_map(c, 26 * mm, h - 30 * mm, 40.5 * mm, 37 * mm, 9.5 * mm)
    # 라운드 트랙
    tx, ty = 48 * mm, 14 * mm
    c.setFont("KRB", 9)
    c.setFillColor(INK)
    c.drawString(20 * mm, ty + 2 * mm, "라운드")
    for i in range(1, 11):
        x = tx + (i - 1) * 21 * mm
        c.setStrokeColor(INK)
        c.setFillColor(HexColor("#FFF7D6") if i == 10 else white)
        c.roundRect(x, ty - 3 * mm, 17 * mm, 10 * mm, 1.5 * mm, fill=1, stroke=1)
        text_c(c, x + 8.5 * mm, ty, str(i), "KRB", 11)
    text_c(c, tx + 9 * 21 * mm + 8.5 * mm, ty - 6.5 * mm, "끝나면 마지막 빛", "KR", 6, MUTED)
    footer(c, w, "메인 보드 (A4 가로)")
    c.showPage()


def page_card_mat(c, a3=True):
    w, h = landscape(A3)
    c.setPageSize((w, h))
    text_c(c, w / 2, h - 10 * mm, "카드 매트 — 가림막 뒤에 두고 성계 카드를 제자리에 겹쳐 둔다", "KRB", 12)
    draw_map(c, 30 * mm, h - 52 * mm, 60 * mm, 62 * mm, 0, slot=(CW + 3 * mm, CH + 3 * mm))
    footer(c, w, "카드 매트 (A3 가로)")
    c.showPage()


def card_mat_tiled():
    """A3 카드 매트를 A4 세로 2장으로 나눈다(가운데에서 이어 붙임)."""
    path = OUT / "lightcone-card-mat-A4x2.pdf"
    c = canvas.Canvas(str(path))
    w3, h3 = landscape(A3)
    for half in (0, 1):
        c.setPageSize(A4)
        c.saveState()
        c.translate(-half * (w3 / 2), 0)
        # 같은 내용을 다시 그린다
        text_c(c, w3 / 2, h3 - 10 * mm, "카드 매트 — 가림막 뒤에 두고 성계 카드를 제자리에 겹쳐 둔다", "KRB", 12)
        draw_map(c, 30 * mm, h3 - 52 * mm, 60 * mm, 62 * mm, 0, slot=(CW + 3 * mm, CH + 3 * mm))
        c.restoreState()
        c.setFont("KR", 7)
        c.setFillColor(MUTED)
        c.drawString(8 * mm, 5 * mm, f"LIGHTCONE {VERSION} 카드 매트 {half + 1}/2 — {'오른쪽' if half == 0 else '왼쪽'} 가장자리를 맞춰 이어 붙인다")
        c.showPage()
    c.save()
    return path


# ---------------------------------------------------------------- 컨베이어 판
def slot_box(c, x, y, title, sub="", fill=white):
    c.setFillColor(fill)
    c.setStrokeColor(INK)
    c.setDash(3, 2)
    c.setLineWidth(0.9)
    c.roundRect(x, y, CW + 2 * mm, CH + 2 * mm, 2 * mm, fill=1, stroke=1)
    c.setDash()
    text_c(c, x + CW / 2 + 1 * mm, y + CH / 2 + 3 * mm, title, "KRB", 11, MUTED)
    if sub:
        text_c(c, x + CW / 2 + 1 * mm, y + CH / 2 - 3 * mm, sub, "KR", 7, MUTED)


def arrow(c, x1, y, x2, color=INK):
    c.setStrokeColor(color)
    c.setFillColor(color)
    c.setLineWidth(1.4)
    c.line(x1, y, x2 - 3 * mm, y)
    p = c.beginPath()
    p.moveTo(x2, y)
    p.lineTo(x2 - 3.5 * mm, y + 2 * mm)
    p.lineTo(x2 - 3.5 * mm, y - 2 * mm)
    p.close()
    c.drawPath(p, fill=1, stroke=0)


def page_light_conveyor(c, pid):
    p = PLAYER[pid]
    w, h = landscape(A4)
    c.setPageSize((w, h))
    c.setFillColor(p["main"])
    c.rect(0, h - 16 * mm, w, 16 * mm, fill=1, stroke=0)
    text_c(c, w / 2, h - 10.5 * mm, f"{p['name']} · 광선 컨베이어 (지연 2)", "KRB", 14, white)
    for i, f in enumerate((1, 2, 3)):
        y = h - 19 * mm - (i + 1) * (CH + 3 * mm) + 3 * mm
        c.setFillColor(p["light"])
        c.roundRect(12 * mm, y, 34 * mm, CH + 2 * mm, 2 * mm, fill=1, stroke=0)
        text_c(c, 29 * mm, y + CH / 2 + 6 * mm, f"함대 {f}", "KRB", 15, p["dark"])
        text_c(c, 29 * mm, y + CH / 2 - 1 * mm, f"전력 {STRENGTH[f]}", "KR", 9, p["dark"])
        text_c(c, 29 * mm, y + CH / 2 - 7 * mm, "새 카드 →", "KR", 8, MUTED)
        slot_box(c, 58 * mm, y, "앞 칸", "현재 실체 위치")
        arrow(c, 102 * mm, y + CH / 2, 116 * mm)
        slot_box(c, 118 * mm, y, "뒤 칸", "1라운드 전")
        arrow(c, 162 * mm, y + CH / 2, 178 * mm)
        c.setFillColor(INK)
        c.setFont("KRB", 10)
        c.drawString(181 * mm, y + CH / 2 + 2 * mm, "밀려 나오면 공개")
        c.setFont("KR", 8)
        c.setFillColor(MUTED)
        c.drawString(181 * mm, y + CH / 2 - 4 * mm, "→ 잔상을 그 성계로 옮긴다")
        c.drawString(181 * mm, y + CH / 2 - 9 * mm, "→ 잔상과 같거나 이웃한 성계여야 한다")
    c.setFont("KR", 7.5)
    c.setFillColor(MUTED)
    c.drawString(12 * mm, 12 * mm, "실체 위치: 앞 칸 카드. 앞 칸이 머무름이면 뒤 칸 카드. 둘 다 머무름이면 잔상 위치. 컨베이어에 있는 성계 카드는 고를 수 없다(관성).")
    footer(c, w, f"{p['name']} 광선 컨베이어")
    c.showPage()


def page_ripple_conveyor(c, pid):
    p = PLAYER[pid]
    w, h = landscape(A4)
    c.setPageSize((w, h))
    c.setFillColor(p["main"])
    c.rect(0, h - 16 * mm, w, 16 * mm, fill=1, stroke=0)
    text_c(c, w / 2, h - 10.5 * mm, f"{p['name']} · 파문 컨베이어", "KRB", 14, white)
    y = h / 2 - CH / 2 - 4 * mm
    x0 = 14 * mm
    for i, n in enumerate((5, 4, 3, 2, 1)):
        x = x0 + i * (CW + 9 * mm)
        slot_box(c, x, y, f"{n}번 칸", "여러 장 겹쳐 둔다", p["light"])
        if i < 4:
            arrow(c, x + CW + 2.5 * mm, y + CH / 2, x + CW + 8.5 * mm)
    ax = x0 + 5 * (CW + 9 * mm) - 6 * mm
    arrow(c, ax - 4 * mm, y + CH / 2, ax + 6 * mm, PLANET)
    c.setFillColor(PLANET)
    c.setFont("KRB", 12)
    c.drawString(ax + 8 * mm, y + CH / 2 + 2 * mm, "도달")
    c.setFont("KR", 8)
    c.drawString(ax + 8 * mm, y + CH / 2 - 4 * mm, "공개 → 점령 확정")
    c.setFillColor(MUTED)
    c.setFont("KR", 8)
    lines = [
        "파문 진행: 매 라운드 모든 카드를 1칸씩 오른쪽(낮은 번호)으로 옮긴다. 1번 칸에서 옮겨지는 카드는 도달한다.",
        "점령 처리: 행성 카드는 그 행성의 파문 거리 번호 칸(성운이면 +1)에, 위장 카드는 3·4·5번 칸 중 하나에 놓는다. (파문 진행이 점령 처리보다 먼저)",
        "도달한 행성 카드: 그 행성에 내 점령 마커를 놓는다(상대 마커는 치운다). 같은 라운드에 양쪽이 같은 행성에 도달하면 중립.",
        "마지막 빛: 10라운드가 끝나면 1번, 2번, 3번 칸 순서로 처리한다. 4번 칸 이상은 치운다. 봉쇄는 마지막 빛에도 쓸 수 있다.",
    ]
    for i, s in enumerate(lines):
        c.drawString(14 * mm, 40 * mm - i * 6 * mm, s)
    footer(c, w, f"{p['name']} 파문 컨베이어")
    c.showPage()


# ---------------------------------------------------------------- 카드
def card_frame(c, x, y, fill, stroke):
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(0.6)
    c.roundRect(x, y, CW, CH, 2.5 * mm, fill=1, stroke=1)


def card_system(c, x, y, pid, fleet, s):
    p = PLAYER[pid]
    card_frame(c, x, y, white, p["main"])
    c.setFillColor(p["main"])
    c.roundRect(x, y + CH - 9 * mm, CW, 9 * mm, 2.5 * mm, fill=1, stroke=0)
    c.rect(x, y + CH - 9 * mm, CW, 4 * mm, fill=1, stroke=0)
    text_c(c, x + CW / 2, y + CH - 6.3 * mm, f"함대 {fleet} · 성계", "KRB", 7.5, white)
    big = label(s)
    text_c(c, x + CW / 2, y + CH / 2 - 2 * mm, big, "KRB", 30, PLANET if s in PLANETS else INK)
    if s in PLANETS:
        text_c(c, x + CW / 2, y + CH / 2 - 9 * mm, f"행성 · 파문 {RIPPLE[s]}", "KR", 7, PLANET)
    elif s in PLAYER:
        text_c(c, x + CW / 2, y + CH / 2 - 9 * mm, "모항성", "KR", 7, MUTED)
    nb = "·".join(label(t) for t in ADJ[s])
    c.setStrokeColor(LINE)
    c.line(x + 3 * mm, y + 10 * mm, x + CW - 3 * mm, y + 10 * mm)
    text_c(c, x + CW / 2, y + 6.2 * mm, "이웃 성계", "KR", 5.5, MUTED)
    text_c(c, x + CW / 2, y + 2.6 * mm, nb, "KRB", 7.5)


def card_stay(c, x, y, pid, fleet):
    p = PLAYER[pid]
    card_frame(c, x, y, p["light"], p["main"])
    text_c(c, x + CW / 2, y + CH - 6.3 * mm, f"함대 {fleet}", "KRB", 8, p["dark"])
    c.setFillColor(p["dark"])
    c.rect(x + CW / 2 - 6 * mm, y + CH / 2 - 2 * mm, 4 * mm, 12 * mm, fill=1, stroke=0)
    c.rect(x + CW / 2 + 2 * mm, y + CH / 2 - 2 * mm, 4 * mm, 12 * mm, fill=1, stroke=0)
    text_c(c, x + CW / 2, y + CH / 2 - 9 * mm, "머무름", "KRB", 14, p["dark"])
    text_c(c, x + CW / 2, y + 4 * mm, "실체가 제자리에 머문다", "KR", 6, MUTED)


def card_strike(c, x, y, pid, fleet):
    p = PLAYER[pid]
    card_frame(c, x, y, p["dark"], p["dark"])
    text_c(c, x + CW / 2, y + CH - 7 * mm, f"함대 {fleet}", "KRB", 9, white)
    text_c(c, x + CW / 2, y + CH / 2 - 1 * mm, "공격", "KRB", 20, white)
    text_c(c, x + CW / 2, y + CH / 2 - 8 * mm, f"전력 {STRENGTH[fleet]}", "KR", 9, white)
    text_c(c, x + CW / 2, y + 7 * mm, "공개하면 위치를 증명한다", "KR", 6, white)
    text_c(c, x + CW / 2, y + 3.5 * mm, "이번 라운드 점령 불가", "KR", 6, white)


def card_planet(c, x, y, pid, s):
    p = PLAYER[pid]
    card_frame(c, x, y, HexColor("#E8F3EC"), PLANET)
    text_c(c, x + CW / 2, y + CH - 7 * mm, f"{p['name']} · 행성", "KR", 6.5, PLANET)
    text_c(c, x + CW / 2, y + CH / 2 - 1 * mm, label(s), "KRB", 30, PLANET)
    c.setFillColor(PLANET)
    c.roundRect(x + 6 * mm, y + 4 * mm, CW - 12 * mm, 8 * mm, 2 * mm, fill=1, stroke=0)
    text_c(c, x + CW / 2, y + 6.6 * mm, f"파문 {RIPPLE[s]}번 칸", "KRB", 8, white)


def card_decoy(c, x, y, pid):
    p = PLAYER[pid]
    card_frame(c, x, y, HexColor("#F3F4F6"), MUTED)
    text_c(c, x + CW / 2, y + CH - 7 * mm, f"{p['name']}", "KR", 6.5, MUTED)
    text_c(c, x + CW / 2, y + CH / 2 - 1 * mm, "위장", "KRB", 20, MUTED)
    text_c(c, x + CW / 2, y + CH / 2 - 8 * mm, "3·4·5번 칸", "KR", 8, MUTED)
    text_c(c, x + CW / 2, y + 4 * mm, "도달하면 아무 일도 없다", "KR", 6, MUTED)


def back_fleet(c, x, y, pid, fleet):
    p = PLAYER[pid]
    card_frame(c, x, y, p["main"], p["dark"])
    c.setStrokeColor(white)
    c.setLineWidth(0.5)
    for r in (6, 10, 14):
        c.circle(x + CW / 2, y + CH / 2, r * mm, fill=0, stroke=1)
    text_c(c, x + CW / 2, y + CH / 2 - 4 * mm, str(fleet), "KRB", 24, white)
    text_c(c, x + CW / 2, y + 5 * mm, "LIGHTCONE", "KRB", 7, white)
    text_c(c, x + CW / 2, y + CH - 7 * mm, f"함대 {fleet}", "KR", 7, white)


def back_ripple(c, x, y, pid):
    p = PLAYER[pid]
    card_frame(c, x, y, p["dark"], p["dark"])
    c.setStrokeColor(p["light"])
    c.setLineWidth(0.6)
    for r in (4, 8, 12, 16):
        c.circle(x + CW / 2, y + CH / 2, r * mm, fill=0, stroke=1)
    text_c(c, x + CW / 2, y + 5 * mm, "파문", "KRB", 8, white)


def build_cards():
    """카드 앞면·뒷면 PDF. 뒷면 페이지는 긴 변 양면 인쇄용으로 좌우를 뒤집는다."""
    path = OUT / "lightcone-cards.pdf"
    c = canvas.Canvas(str(path), pagesize=A4)
    w, h = A4
    cols, rows, gap = 4, 5, 2 * mm
    gx = (w - (cols * CW + (cols - 1) * gap)) / 2
    gy = (h - (rows * CH + (rows - 1) * gap)) / 2

    def slots():
        for r in range(rows):
            for col in range(cols):
                yield r, col

    def pos(r, col, mirror=False):
        cc = cols - 1 - col if mirror else col
        return gx + cc * (CW + gap), h - gy - (r + 1) * CH - r * gap

    for pid in ("A", "B"):
        groups = []
        fleet_cards = []
        for f in (1, 2, 3):
            for s in SYSTEMS:
                fleet_cards.append((lambda c_, x, y, f=f, s=s: card_system(c_, x, y, pid, f, s),
                                    lambda c_, x, y, f=f: back_fleet(c_, x, y, pid, f)))
            for _ in range(STAY_PER_FLEET):
                fleet_cards.append((lambda c_, x, y, f=f: card_stay(c_, x, y, pid, f),
                                    lambda c_, x, y, f=f: back_fleet(c_, x, y, pid, f)))
            fleet_cards.append((lambda c_, x, y, f=f: card_strike(c_, x, y, pid, f),
                                lambda c_, x, y, f=f: back_fleet(c_, x, y, pid, f)))
        groups.append(("함대 카드", fleet_cards))
        ripple_cards = []
        for s in PLANETS:
            for _ in range(PLANET_COPIES):
                ripple_cards.append((lambda c_, x, y, s=s: card_planet(c_, x, y, pid, s),
                                     lambda c_, x, y: back_ripple(c_, x, y, pid)))
        for _ in range(DECOYS):
            ripple_cards.append((lambda c_, x, y: card_decoy(c_, x, y, pid),
                                 lambda c_, x, y: back_ripple(c_, x, y, pid)))
        groups.append(("행성·위장 카드", ripple_cards))

        for gname, cards in groups:
            for start in range(0, len(cards), cols * rows):
                chunk = cards[start:start + cols * rows]
                for side in ("앞면", "뒷면"):
                    c.setPageSize(A4)
                    for (r, col), (front, back) in zip(slots(), chunk):
                        x, y = pos(r, col, mirror=(side == "뒷면"))
                        (front if side == "앞면" else back)(c, x, y)
                    c.setFont("KR", 6.5)
                    c.setFillColor(MUTED)
                    c.drawString(8 * mm, 3 * mm, f"LIGHTCONE {VERSION} · {PLAYER[pid]['name']} {gname} {side} "
                                 f"({start + 1}–{start + len(chunk)}/{len(cards)}) · 40×55mm · 양면 인쇄: 긴 변 넘김")
                    c.showPage()
    c.save()
    return path


# ---------------------------------------------------------------- 토큰과 요약
def build_tokens_and_reference():
    path = OUT / "lightcone-tokens-reference.pdf"
    c = canvas.Canvas(str(path), pagesize=A4)
    w, h = A4
    text_c(c, w / 2, h - 14 * mm, "토큰 — 오려서 쓴다", "KRB", 13)
    y = h - 26 * mm
    for pid in ("A", "B"):
        p = PLAYER[pid]
        c.setFont("KRB", 10)
        c.setFillColor(p["dark"])
        c.drawString(14 * mm, y, f"{p['name']}")
        # 잔상 말
        y -= 14 * mm
        c.setFont("KR", 8)
        c.setFillColor(INK)
        c.drawString(14 * mm, y + 9 * mm, "잔상 말 (반으로 접어 세운다)")
        for f in (1, 2, 3):
            x = 16 * mm + (f - 1) * 30 * mm
            for k, yy in enumerate((y - 8 * mm, y)):
                c.setFillColor(p["main"])
                c.setStrokeColor(p["dark"])
                c.roundRect(x, yy, 22 * mm, 8 * mm, 1.5 * mm, fill=1, stroke=1)
                text_c(c, x + 11 * mm, yy + 2.6 * mm, f"잔상 {f} · 전력 {STRENGTH[f]}", "KRB", 7, white)
        # 점령 마커
        c.setFillColor(INK)
        c.setFont("KR", 8)
        c.drawString(110 * mm, y + 9 * mm, f"점령 마커 ×{HOLD_MARKERS}")
        for i in range(HOLD_MARKERS):
            cx = 114 * mm + (i % 5) * 16 * mm
            cy = y + 2 * mm - (i // 5) * 14 * mm
            c.setFillColor(p["main"])
            c.setStrokeColor(p["dark"])
            c.circle(cx, cy, 6 * mm, fill=1, stroke=1)
            text_c(c, cx, cy - 1.5 * mm, "점령", "KRB", 6.5, white)
        # 공격 표식
        y -= 34 * mm
        c.setFillColor(INK)
        c.setFont("KR", 8)
        c.drawString(14 * mm, y + 9 * mm, f"공격 표식 ×{STRIKE_MARKERS} (가운데를 접어 양면으로 만든다: 앞면 → 다음 라운드에 뒷면 → 그다음 라운드에 확인)")
        for i in range(STRIKE_MARKERS):
            x = 16 * mm + i * 30 * mm
            c.setStrokeColor(p["dark"])
            c.setFillColor(p["light"])
            c.rect(x, y - 2 * mm, 12 * mm, 10 * mm, fill=1, stroke=1)
            text_c(c, x + 6 * mm, y + 1.5 * mm, "앞", "KRB", 9, p["dark"])
            c.setFillColor(p["dark"])
            c.rect(x + 12 * mm, y - 2 * mm, 12 * mm, 10 * mm, fill=1, stroke=1)
            text_c(c, x + 18 * mm, y + 1.5 * mm, "뒤", "KRB", 9, white)
        y -= 22 * mm
    # 성운 타일과 성운 카드
    c.setFillColor(INK)
    c.setFont("KRB", 10)
    c.drawString(14 * mm, y, "성운 타일 ×2 · 성운 카드 ×4 (준비 때 성운 카드 1장을 뽑는다)")
    for i in range(2):
        cx = 26 * mm + i * 28 * mm
        c.setFillColor(HexColor("#5B4B8A"))
        c.circle(cx, y - 16 * mm, 10 * mm, fill=1, stroke=0)
        text_c(c, cx, y - 15 * mm, "성운", "KRB", 9, white)
        text_c(c, cx, y - 20 * mm, "파문 +1", "KR", 7, white)
    for i, txt in enumerate(("4 · 14", "7 · 11", "8 · 10", "9")):
        x = 80 * mm + i * 24 * mm
        c.setFillColor(HexColor("#EDE9F6"))
        c.setStrokeColor(HexColor("#5B4B8A"))
        c.roundRect(x, y - 30 * mm, 21 * mm, 28 * mm, 2 * mm, fill=1, stroke=1)
        text_c(c, x + 10.5 * mm, y - 9 * mm, "성운", "KR", 7, HexColor("#5B4B8A"))
        text_c(c, x + 10.5 * mm, y - 18 * mm, txt, "KRB", 11, HexColor("#5B4B8A"))
    footer(c, w, "토큰")
    c.showPage()

    # 라운드 요약표 (플레이어마다 1장)
    for pid in ("A", "B"):
        p = PLAYER[pid]
        c.setPageSize(A4)
        c.setFillColor(p["main"])
        c.rect(0, h - 18 * mm, w, 18 * mm, fill=1, stroke=0)
        text_c(c, w / 2, h - 12 * mm, f"라운드 요약 · {p['name']}", "KRB", 14, white)
        steps = [
            ("계획 단계", ["함대마다 성계 카드 1장 또는 머무름 카드 1장을 골라 엎어 둔다.",
                         "이웃 성계만 고를 수 있다. 컨베이어에 있는 카드는 못 고른다(관성)."]),
            ("1. 이동 처리", ["고른 카드를 앞 칸에 넣는다 → 뒤 칸 카드가 밀려 나와 공개된다.",
                          "공개된 성계로 잔상을 옮긴다(머무름이면 그대로). 잔상과 같거나 이웃한 성계여야 한다."]),
            ("2. 공격 처리", ["공격할 함대의 공격 카드를 동시에 공개하고, 그 함대의 위치를 증명한다.",
                          "상대는 그 성계에 실체가 있는지 답한다. '있다'면 위치 증명 후 교전(전력 합 비교).",
                          "'없다'면 공격 표식을 놓는다 → 2라운드 뒤 공개 카드로 확인한다. 거짓이면 패배.",
                          "진 쪽은 귀환(동률이면 공격받은 쪽, 쌍방 공격 동률이면 아무도 귀환하지 않음).",
                          "귀환: 컨베이어 카드 공개(남은 공격 표식 확인) → 머무름(앞)·모항성(뒤)으로 채운다."]),
            ("3. 파문 진행", ["파문 컨베이어의 모든 카드를 1칸씩 옮긴다. 1번 칸에서 나온 카드는 도달한다.",
                          "상대 카드가 도달한 행성에 내 실체가 있으면 위치를 증명해 봉쇄(무효)할 수 있다. 공격한 함대는 봉쇄 불가.",
                          "행성 카드가 도달하면 그 행성에 점령 마커를 놓는다. 같은 라운드 양쪽 도달은 중립."]),
            ("4. 점령 처리", ["행성에 있는 함대(공격·귀환하지 않은)로 점령: 행성 카드를 파문 거리 칸에 놓는다.",
                          "성운 행성은 1칸 높은 칸에. 위장 카드는 3·4·5번 칸. 칸별로 손에 쥐고 동시에 놓는다.",
                          "놓는 카드 수 ≤ 이번 라운드에 공격·귀환하지 않은 함대 수."]),
            ("5. 승리 확인", ["확정 점령 6개 이상이면 즉시 승리.",
                          "10라운드 뒤 마지막 빛: 남은 공격 표식 확인 → 1·2·3번 칸 순서로 처리 → 많은 쪽 승리."]),
        ]
        y = h - 32 * mm
        for title, lines in steps:
            c.setFillColor(p["light"])
            c.roundRect(12 * mm, y - (len(lines) * 6 + 4) * mm, w - 24 * mm, (len(lines) * 6 + 10) * mm, 2 * mm, fill=1, stroke=0)
            c.setFillColor(p["dark"])
            c.setFont("KRB", 11)
            c.drawString(16 * mm, y, title)
            c.setFillColor(INK)
            c.setFont("KR", 9)
            for i, s in enumerate(lines):
                c.drawString(20 * mm, y - (i + 1) * 6 * mm, s)
            y -= (len(lines) * 6 + 16) * mm
        c.setFont("KR", 8)
        c.setFillColor(MUTED)
        c.drawString(14 * mm, 14 * mm, "전력: 함대 1 = 2, 함대 2 = 2, 함대 3 = 3. 잔상은 실체의 2라운드 전 위치다.")
        footer(c, w, "라운드 요약")
        c.showPage()
    c.save()
    return path


def build_boards():
    path = OUT / "lightcone-boards.pdf"
    c = canvas.Canvas(str(path))
    page_main_board(c)
    for pid in ("A", "B"):
        page_light_conveyor(c, pid)
        page_ripple_conveyor(c, pid)
    c.save()
    return path


def build_mat_a3():
    path = OUT / "lightcone-card-mat-A3.pdf"
    c = canvas.Canvas(str(path))
    for _ in ("A", "B"):
        page_card_mat(c)
    c.save()
    return path


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for f in (build_boards(), build_cards(), build_mat_a3(), card_mat_tiled(), build_tokens_and_reference()):
        print(f.relative_to(ROOT))
    print("파문 거리:", {s: RIPPLE[s] for s in PLANETS})
