# -*- coding: utf-8 -*-
"""
AstralTab 플레이어용 규칙 설명서 PDF (notes/Rule.pdf) 생성 스크립트.

규칙 정본은 notes/Rules.md 다. Rules.md 가 바뀌면(카드 수치, 상수, 맵 등) 이 스크립트의 해당 값도
손으로 맞춰 다시 실행한다. 이 스크립트는 텍스트를 Rules.md 에서 자동으로 읽어오지 않는다 —
플레이어에게 더 쉬운 말로 풀어 쓴 별도 문서이기 때문이다.

의존성: reportlab (Windows 시스템 폰트 맑은 고딕 사용, ai/.venv 와는 무관한 별도 설치가 필요하다)
    pip install reportlab
실행:
    python scripts/build-rulebook.py
출력: notes/Rule.pdf
"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as canvas_mod
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, NextPageTemplate, PageBreak,
    Paragraph, Spacer, Table, TableStyle, Preformatted, KeepTogether,
    FrameBreak,
)
from reportlab.platypus.tableofcontents import TableOfContents

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO_ROOT, "notes", "Rule.pdf")

# --- 폰트 (Windows 맑은 고딕, 한글 지원) --------------------------------------
FONT_DIR = r"C:\Windows\Fonts"
pdfmetrics.registerFont(TTFont("Malgun", os.path.join(FONT_DIR, "malgun.ttf")))
pdfmetrics.registerFont(TTFont("Malgun-Bold", os.path.join(FONT_DIR, "malgunbd.ttf")))
pdfmetrics.registerFontFamily("Malgun", normal="Malgun", bold="Malgun-Bold")

# --- 컬러 (AstralTab 게임 세계 팔레트, tokens.css 값 그대로) ------------------
DEEP = HexColor("#402060")      # Moonlight Deep — 헤딩
NAVY = HexColor("#1a2352")      # Corca Navy — 본문 헤딩 보조
CREAM = HexColor("#fff3b7")     # Moonlight Cream — 강조
AMBER = HexColor("#fdd484")     # 에너지·건물
VIOLET = HexColor("#777cdc")    # 마법
STEEL = HexColor("#36597d")     # 격자선·보조
SLATE = HexColor("#324158")     # 본문
MUTED = HexColor("#8a8a9a")
SURFACE = HexColor("#f1f5f9")
BLUE0 = HexColor("#419eff")     # 좌석 0
WHITE = colors.white

PAGE_W, PAGE_H = A4
MARGIN = 20 * mm

# ---------------------------------------------------------------------------
# 스타일
# ---------------------------------------------------------------------------
def style(name, **kw):
    base = dict(fontName="Malgun", fontSize=10, leading=15, textColor=SLATE)
    base.update(kw)
    return ParagraphStyle(name, **base)

S_TITLE = style("Title", fontName="Malgun-Bold", fontSize=34, leading=40, textColor=WHITE, alignment=TA_CENTER)
S_SUBTITLE = style("Subtitle", fontName="Malgun", fontSize=14, leading=20, textColor=CREAM, alignment=TA_CENTER)
S_COVER_META = style("CoverMeta", fontName="Malgun", fontSize=10, leading=14, textColor=HexColor("#d8cdea"), alignment=TA_CENTER)
S_H1 = style("H1", fontName="Malgun-Bold", fontSize=19, leading=24, textColor=DEEP, spaceBefore=4, spaceAfter=10)
S_H2 = style("H2", fontName="Malgun-Bold", fontSize=13, leading=17, textColor=NAVY, spaceBefore=12, spaceAfter=6)
S_BODY = style("Body", spaceAfter=6)
S_BODY_TIGHT = style("BodyTight", spaceAfter=2)
S_LEAD = style("Lead", fontSize=11.5, leading=17, textColor=NAVY, spaceAfter=10)
S_BULLET = style("Bullet", spaceAfter=4, leftIndent=12, bulletIndent=0)
S_NUM = style("Num", spaceAfter=6, leftIndent=14, bulletIndent=0)
S_CELL = style("Cell", fontSize=8.3, leading=11)
S_CELL_C = style("CellC", fontSize=8.3, leading=11, alignment=TA_CENTER)
S_CELL_HEAD = style("CellHead", fontSize=8.3, leading=11, fontName="Malgun-Bold", textColor=WHITE, alignment=TA_CENTER)
S_CELL_NAME = style("CellName", fontSize=8.5, leading=11, fontName="Malgun-Bold", textColor=NAVY)
S_MAP_TITLE = style("MapTitle", fontName="Malgun-Bold", fontSize=11.5, leading=15, textColor=NAVY, spaceBefore=10, spaceAfter=2)
S_MAP_META = style("MapMeta", fontSize=9, leading=13, textColor=MUTED, spaceAfter=4)
S_MONO = ParagraphStyle("Mono", fontName="Courier", fontSize=7.6, leading=9.6, textColor=NAVY)
S_TOC1 = style("TOC1", fontName="Malgun-Bold", fontSize=12, leading=20, textColor=NAVY)
S_CAPTION = style("Caption", fontSize=8.5, leading=12, textColor=MUTED)

# ---------------------------------------------------------------------------
# 표 스타일 헬퍼
# ---------------------------------------------------------------------------
def data_table(rows, col_widths, header_bg=NAVY, band=SURFACE, header_rows=1, align_first_left=True):
    t = Table(rows, colWidths=col_widths, repeatRows=header_rows)
    cmds = [
        ("BACKGROUND", (0, 0), (-1, header_rows - 1), header_bg),
        ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#c7d2e0")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]
    for i in range(header_rows, len(rows)):
        if (i - header_rows) % 2 == 1:
            cmds.append(("BACKGROUND", (0, i), (-1, i), band))
    t.setStyle(TableStyle(cmds))
    return t


def p(text, s=S_CELL):
    return Paragraph(text, s)


def pc(text, s=S_CELL_C):
    return Paragraph(text, s)


def ph(text):
    return Paragraph(text, S_CELL_HEAD)

# ---------------------------------------------------------------------------
# 문서 템플릿 (표지 / 본문 프레임 + 헤더·풋터)
# ---------------------------------------------------------------------------
TITLE_TEXT = "AstralTab 규칙 설명서"

def draw_cover(c: canvas_mod.Canvas, doc):
    c.saveState()
    c.setFillColor(DEEP)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    # 장식 밴드
    c.setFillColor(HexColor("#4d2876"))
    c.rect(0, PAGE_H * 0.62, PAGE_W, PAGE_H * 0.02, fill=1, stroke=0)
    c.setFillColor(CREAM)
    c.rect(0, PAGE_H * 0.60, PAGE_W, 1.4, fill=1, stroke=0)
    # 코어 점 장식 (좌석 0 파랑)
    c.setFillColor(BLUE0)
    c.circle(PAGE_W * 0.22, PAGE_H * 0.80, 3.2, fill=1, stroke=0)
    c.setFillColor(VIOLET)
    c.circle(PAGE_W * 0.78, PAGE_H * 0.86, 2.4, fill=1, stroke=0)
    c.setFillColor(AMBER)
    c.circle(PAGE_W * 0.70, PAGE_H * 0.74, 2.0, fill=1, stroke=0)
    c.restoreState()


def header_footer(c: canvas_mod.Canvas, doc):
    c.saveState()
    c.setFont("Malgun", 8)
    c.setFillColor(MUTED)
    c.drawString(MARGIN, PAGE_H - 13 * mm, TITLE_TEXT)
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 13 * mm, "v2 · 2026-09-22")
    c.setStrokeColor(HexColor("#dfe4ee"))
    c.setLineWidth(0.6)
    c.line(MARGIN, PAGE_H - 15 * mm, PAGE_W - MARGIN, PAGE_H - 15 * mm)
    c.line(MARGIN, 14 * mm, PAGE_W - MARGIN, 14 * mm)
    c.setFillColor(MUTED)
    c.drawCentredString(PAGE_W / 2, 9 * mm, f"{doc.page - 1}")
    c.restoreState()


doc = BaseDocTemplate(
    OUT, pagesize=A4,
    leftMargin=MARGIN, rightMargin=MARGIN, topMargin=18 * mm, bottomMargin=16 * mm,
    title="AstralTab 규칙 설명서", author="AstralTab",
)

cover_frame = Frame(0, 0, PAGE_W, PAGE_H, id="cover", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
body_frame = Frame(MARGIN, 16 * mm, PAGE_W - 2 * MARGIN, PAGE_H - 34 * mm, id="body")

doc.addPageTemplates([
    PageTemplate(id="Cover", frames=[cover_frame], onPage=draw_cover),
    PageTemplate(id="Body", frames=[body_frame], onPage=header_footer),
])


class ChapterTOC(TableOfContents):
    def __init__(self):
        super().__init__()
        self.levelStyles = [S_TOC1]


toc = ChapterTOC()

story = []

def add_heading(text, level=1, key=None):
    style_ = S_H1 if level == 1 else S_H2
    para = Paragraph(text, style_)
    story.append(para)
    if level == 1:
        key = key or text
        story[-1] = _BookmarkedH1(text, key)


class _BookmarkedH1(Paragraph):
    """H1 은 TOC 항목이자 PDF 북마크가 된다."""
    def __init__(self, text, key):
        super().__init__(text, S_H1)
        self._bmk_key = key
        self._bmk_text = text

    def draw(self):
        Paragraph.draw(self)
        c = self.canv
        c.bookmarkPage(self._bmk_key)
        c.addOutlineEntry(self._bmk_text, self._bmk_key, level=0, closed=False)

    def afterFlowable(self, *_):
        pass


def on_flowable(flowable):
    if isinstance(flowable, _BookmarkedH1):
        doc.notify("TOCEntry", (0, flowable._bmk_text, doc.page))

doc.afterFlowable = on_flowable

# ---------------------------------------------------------------------------
# 표지
# ---------------------------------------------------------------------------
story.append(Spacer(1, PAGE_H * 0.30))
story.append(Paragraph("ASTRALTAB", S_TITLE))
story.append(Spacer(1, 6))
story.append(Paragraph("우주 전략 보드게임 규칙 설명서", S_SUBTITLE))
story.append(Spacer(1, 26))
story.append(Paragraph("바둑처럼 마커를 하나씩 놓아 영토를 넓히는 카드 기반 전략 게임", S_COVER_META))
story.append(Paragraph("2~4인 · 규칙 v2 · 2026-09-22", S_COVER_META))
story.append(NextPageTemplate("Body"))
story.append(PageBreak())

# ---------------------------------------------------------------------------
# 차례
# ---------------------------------------------------------------------------
story.append(Paragraph("차례", S_H1))
story.append(Spacer(1, 4))
story.append(toc)
story.append(PageBreak())

# ---------------------------------------------------------------------------
# 1. 게임 소개
# ---------------------------------------------------------------------------
add_heading("1. 게임 소개")
story.append(Paragraph(
    "AstralTab 은 <b>바둑처럼 번갈아 마커를 하나씩 놓아 영토를 넓히는 게임</b>입니다. "
    "다만 바둑과 다른 점이 다섯 가지 있습니다.", S_LEAD))
bullets = [
    "아무 칸에나 놓을 수 없습니다. <b>내 마커의 시야 안</b>에만 놓을 수 있습니다.",
    "돌이 모두 같지 않습니다. <b>손패의 카드를 내서</b> 유닛·건물·마법 중 무엇을 놓을지 정합니다.",
    "마커마다 <b>비용</b>이 있어 에너지가 있어야 놓을 수 있습니다.",
    "마커는 <b>움직이지 않습니다.</b> 대신 공격력이 있는 마커는 매 턴 자동으로 사거리 안의 적을 공격합니다.",
    "승부는 <b>점수</b>(영토 + 마커)로 가리며, 상대 코어를 부수면 그 즉시 그 사람은 탈락합니다.",
]
for b in bullets:
    story.append(Paragraph(f"•  {b}", S_BULLET))

# ---------------------------------------------------------------------------
# 2. 게임 구성
# ---------------------------------------------------------------------------
add_heading("2. 게임 구성")
story.append(Paragraph("<b>플레이어</b> — 2~4명. 사람 또는 AI가 함께할 수 있습니다. 턴 순서는 로비에서 정해진 좌석 순서입니다.", S_BODY))
story.append(Paragraph("<b>보드</b> — 육각 타일입니다. 맵에 따라 11×11 / 13×13 / 15×15 크기가 있습니다. "
                        "왼쪽 위가 (0, 0)이고, 오른쪽이 x, 아래가 y 방향이며, 홀수 행은 반 칸 오른쪽으로 밀려 있습니다.", S_BODY))
story.append(Spacer(1, 2))
story.append(Paragraph("지형", S_H2))
terrain_rows = [
    [ph("지형"), ph("설명")],
    [p("빈 우주"), p("기본 칸. 마커를 놓을 수 있습니다.")],
    [p("소행성"), p("마커를 놓을 수 없습니다. 시야와 사거리는 그대로 통과하지만, 영토로는 계산하지 않습니다.")],
    [p("광맥"), p("마커를 놓을 수 있고, 여기 지은 <b>건물</b>은 생산이 +1 됩니다. 유닛·마법은 보너스가 없습니다.")],
]
story.append(data_table(terrain_rows, [30 * mm, None]))
story.append(Spacer(1, 6))
story.append(Paragraph(
    "<b>맵</b> — 6개의 맵이 있습니다(2인용 2개, 3인용 2개, 4인용 2개). 맵마다 코어 위치·지형·라운드 제한이 다릅니다. "
    "자세한 내용은 10장을 참고하세요.", S_BODY))
story.append(Paragraph(
    "<b>카드</b> — 기본 덱 22장(모든 플레이어 동일)과, 게임 시작 전 직접 고르는 특수 카드 3장(건물·유닛·마법 각 1장)을 "
    "합쳐 총 25장으로 자신만의 덱을 구성합니다.", S_BODY))

# ---------------------------------------------------------------------------
# 3. 게임 준비
# ---------------------------------------------------------------------------
add_heading("3. 게임 준비")
prep_items = [
    "방장이 맵을 고릅니다. 맵의 인원수와 로비 인원이 같아야 시작할 수 있습니다.",
    "각 플레이어가 특수 카드를 건물·유닛·마법 종류별로 1장씩, 총 3장을 고릅니다.",
    "게임 시작 시 시스템이 자동으로 준비를 마칩니다.",
]
for i, t in enumerate(prep_items, 1):
    story.append(Paragraph(f"{i}.  {t}", S_NUM))
auto_items = [
    "좌석 순서대로 코어를 맵이 정한 위치에 놓습니다.",
    "각자 덱(기본 22 + 특수 3장)을 무작위로 섞고 손패 4장을 뽑습니다.",
    "에너지를 5로 맞춥니다.",
]
for t in auto_items:
    story.append(Paragraph(f"–  {t}", ParagraphStyle("sub", parent=S_BULLET, leftIndent=26, textColor=SLATE)))
story.append(Paragraph("4.  좌석 0번부터 좌석 번호 순으로 턴을 진행합니다.", S_NUM))
story.append(Spacer(1, 4))
story.append(Paragraph(
    "<b>덱 빌딩 팁</b> — 특수 카드는 되돌릴 수 없으니 신중하게 고르세요. 건물은 경제, 유닛은 전투, 마법은 "
    "한 번에 큰 효과를 냅니다. 9장의 카드 스펙은 9장에서 확인할 수 있습니다.", S_BODY))

# ---------------------------------------------------------------------------
# 4. 턴 진행
# ---------------------------------------------------------------------------
add_heading("4. 턴 진행")
story.append(Paragraph(
    "턴은 한 플레이어의 것입니다. 시작 단계와 종료 단계는 자동으로 처리되고, "
    "행동 단계에서만 플레이어가 선택합니다.", S_LEAD))

story.append(Paragraph("4.1 시작 단계 (자동, 이 순서대로)", S_H2))
start_rows = [
    [ph("순서"), ph("단계"), ph("내용")],
    [pc("1"), p("전투", S_CELL_NAME), p("공격력이 있는 내 마커 전부가 자동으로 공격합니다. (6장)")],
    [pc("2"), p("정비", S_CELL_NAME), p("`정비` 키워드가 있는 마커가 주변 아군을 회복시킵니다.")],
    [pc("3"), p("지속 마법 만료", S_CELL_NAME), p("내 지속형 마법 마커의 남은 턴이 1 줄고, 0이 되면 제거됩니다.")],
    [pc("4"), p("수입", S_CELL_NAME), p("에너지가 코어 기본 수입(1) + 내 건물 생산 합(광맥 보너스 포함)만큼 늘어납니다.")],
    [pc("5"), p("드로우", S_CELL_NAME), p("손패가 5장 미만이고 덱이 남아 있으면 1장을 뽑습니다.")],
]
story.append(data_table(start_rows, [12 * mm, 30 * mm, None]))
story.append(Paragraph("첫 턴에도 시작 단계를 그대로 수행합니다. 다만 아직 상대가 없어 전투는 아무 일도 일어나지 않습니다.", S_CAPTION))

story.append(Paragraph("4.2 행동 단계 (정확히 하나를 고릅니다)", S_H2))
action_rows = [
    [ph("행동"), ph("내용")],
    [p("배치", S_CELL_NAME), p("손패 카드 1장을 내고 마커를 놓습니다(5장 참고). 카드는 버려지고, 즉시 턴이 끝납니다.")],
    [p("패스", S_CELL_NAME), p("아무것도 하지 않고 턴을 넘깁니다. 손패에 놓을 수 있는 카드가 없으면 패스만 가능합니다.")],
    [p("기권", S_CELL_NAME), p("그 자리에서 즉시 탈락합니다.")],
]
story.append(data_table(action_rows, [22 * mm, None]))
story.append(Paragraph("한 턴에 마커는 <b>하나만</b> 놓을 수 있습니다. 에너지가 남아도 두 개를 놓을 수 없습니다.", S_CAPTION))

story.append(Paragraph("4.3 종료 단계 (자동)", S_H2))
for i, t in enumerate([
    "파괴된 마커를 정리하고 탈락 처리를 합니다.",
    "점수를 다시 계산합니다.",
    "종료 조건을 확인합니다. 끝이 아니면 다음 생존 플레이어에게 턴을 넘깁니다.",
], 1):
    story.append(Paragraph(f"{i}.  {t}", S_NUM))

# ---------------------------------------------------------------------------
# 5. 배치 규칙
# ---------------------------------------------------------------------------
add_heading("5. 배치 규칙")
story.append(Paragraph("카드 한 장을 칸 하나에 놓으려면 다음 조건을 모두 만족해야 합니다. 하나라도 어긋나면 놓을 수 없습니다.", S_BODY))
for i, t in enumerate([
    "그 카드가 내 손패에 있어야 합니다.",
    "내 에너지가 카드의 비용 이상이어야 합니다.",
    "그 칸이 보드 안이고, 소행성이 아니며, 비어 있어야 합니다.",
    "그 칸이 내 <b>시야 영역</b> 안이어야 합니다. 즉, 내 마커 중 하나라도 그 칸까지의 거리가 그 마커의 시야 이내여야 합니다. "
    "(단, <b>침투</b> 키워드가 있는 카드는 대신 \"적 마커로부터 거리 1 이내\"에도 놓을 수 있습니다.)",
    "마법 카드도 같은 조건으로 빈 칸에 놓습니다. 즉발형 마법은 그 칸을 중심으로 효과를 낸 뒤 사라지고, "
    "지속형 마법은 마커로 남습니다.",
], 1):
    story.append(Paragraph(f"{i}.  {t}", S_NUM))
story.append(Spacer(1, 2))
story.append(Paragraph(
    "배치가 성립하면 순서대로 일어납니다: 비용 차감 → 마커 생성(체력은 최대치로 시작) → "
    "마법이면 즉발 효과 적용 → 파괴 정리 → 턴 종료.", S_BODY))

# ---------------------------------------------------------------------------
# 6. 전투
# ---------------------------------------------------------------------------
add_heading("6. 전투")
story.append(Paragraph("6.1 자동 공격", S_H2))
story.append(Paragraph(
    "시작 단계의 전투에서, <b>턴 플레이어의 공격력이 있는 마커 각각</b>이 사거리 안의 적을 하나씩 공격합니다.", S_BODY))
for t in [
    "대상 후보 — 사거리(육각 거리) 안의 적 마커 전부. 코어와 지속 마법 마커도 포함되고, 아군과 소행성은 제외됩니다.",
    "대상 선택 순서 — 거리가 가까운 쪽 → 남은 체력이 적은 쪽 → y좌표가 작은 쪽 → x좌표가 작은 쪽. 이 순서로 딱 하나만 공격합니다.",
    "피해는 공격력 그대로 들어갑니다. 방어력이라는 개념은 없습니다.",
    "모든 공격은 전투가 시작되는 순간의 상태를 기준으로 대상을 정하고, 피해는 한꺼번에 동시에 적용됩니다.",
    "피해를 받은 뒤 체력이 0 이하인 마커는 한꺼번에 제거됩니다.",
]:
    story.append(Paragraph(f"•  {t}", S_BULLET))
story.append(Paragraph(
    "턴 플레이어의 마커만 공격합니다. 상대는 자기 턴이 왔을 때 반격합니다. 그래서 마커를 놓은 직후에는 공격하지 않고, "
    "한 바퀴 돌아 내 턴이 왔을 때 처음 공격합니다.", S_CAPTION))

story.append(Paragraph("6.2 즉발 마법", S_H2))
story.append(Paragraph("배치 즉시 효과를 내고 사라집니다. 효과의 중심은 놓은 칸입니다.", S_BODY))
magic_rows = [
    [ph("효과"), ph("설명")],
    [p("피해 N, 반경 R", S_CELL_NAME), p("중심에서 거리 R 이내의 적 마커 전부에 N 피해를 줍니다.")],
    [p("회복 N, 반경 R", S_CELL_NAME), p("중심에서 거리 R 이내의 아군 마커 전부의 체력을 N만큼 회복시킵니다(최대 체력까지).")],
    [p("에너지 +N", S_CELL_NAME), p("즉시 에너지를 N만큼 얻습니다.")],
]
story.append(data_table(magic_rows, [30 * mm, None]))

story.append(Paragraph("6.3 파괴와 탈락", S_H2))
for t in [
    "체력이 0 이하가 된 마커는 보드에서 사라집니다. 그 마커의 시야·생산·점수는 <b>즉시</b> 없어집니다.",
    "<b>코어</b>가 파괴되면 그 플레이어는 <b>탈락</b>합니다. 탈락한 플레이어의 남은 마커도 전부 함께 제거됩니다.",
    "기권도 탈락으로 처리됩니다.",
    "탈락한 플레이어는 이후 턴에서 건너뜁니다.",
]:
    story.append(Paragraph(f"•  {t}", S_BULLET))

# ---------------------------------------------------------------------------
# 7. 시야와 영토
# ---------------------------------------------------------------------------
add_heading("7. 시야와 영토")
story.append(Paragraph(
    "내 <b>시야 영역</b>은 내 모든 마커에 대해, 거리가 그 마커의 시야 이내인 칸을 전부 모은 것입니다. "
    "마커가 놓인 칸 자체는 시야가 0이어도 포함됩니다. 시야는 소행성이나 다른 마커에 가려지지 않습니다.", S_BODY))
story.append(Paragraph("영토 판정 — 칸마다 다음 규칙을 적용합니다.", S_BODY))
for t in [
    "마커가 놓인 칸은 그 마커 소유자의 영토입니다.",
    "빈 칸이 정확히 한 플레이어의 시야 영역 안이면 그 플레이어의 영토입니다.",
    "둘 이상의 시야가 겹치거나(경합) 아무 시야에도 속하지 않으면 누구의 영토도 아닙니다.",
    "소행성 칸은 누구의 영토도 아닙니다.",
]:
    story.append(Paragraph(f"•  {t}", S_BULLET))
story.append(Paragraph(
    "시야 하나로 \"어디에 놓을 수 있는가\"와 \"어디가 내 땅인가\"를 함께 정합니다. 시야를 넓히면 땅이 늘고, "
    "적 시야와 겹치면 그 땅은 경합 지역이 되어 아무에게도 속하지 않습니다.", S_CAPTION))

# ---------------------------------------------------------------------------
# 8. 점수와 승리
# ---------------------------------------------------------------------------
add_heading("8. 점수와 승리")
story.append(Paragraph("8.1 점수", S_H2))
story.append(Paragraph("점수 = 영토 칸 수 × 1  +  (내 마커들의 점수 합)", ParagraphStyle(
    "formula", parent=S_BODY, fontName="Malgun-Bold", fontSize=11.5, textColor=DEEP, spaceAfter=6)))
story.append(Paragraph(
    "코어의 점수는 0입니다. 즉발 마법은 마커로 남지 않으므로 점수에 기여하지 않습니다. "
    "점수는 매 턴 종료 단계마다 다시 계산되어 상태 화면에 항상 표시됩니다.", S_BODY))

story.append(Paragraph("8.2 종료 조건 (먼저 만족하는 것이 적용됩니다)", S_H2))
end_rows = [
    [ph("조건"), ph("설명")],
    [p("① 최후 생존", S_CELL_NAME), p("생존 플레이어가 1명이 되는 순간 그 플레이어가 즉시 승리합니다.")],
    [p("② 전원 패스", S_CELL_NAME), p("생존 플레이어 전원이 한 바퀴 연속으로 패스하면 그 자리에서 점수를 정산합니다. "
                                      "누군가 배치하면 \"패스 중\" 표시가 전원 지워집니다.")],
    [p("③ 라운드 제한", S_CELL_NAME), p("맵이 정한 라운드 제한에 도달하면 그 라운드의 생존자 전원이 턴을 마친 뒤 정산합니다.")],
]
story.append(data_table(end_rows, [26 * mm, None]))

story.append(Paragraph("8.3 순위", S_H2))
for i, t in enumerate([
    "생존자는 점수가 높은 순서대로 순위가 매겨집니다.",
    "점수가 같으면 좌석 번호가 더 큰(나중 순서) 플레이어가 위입니다. 먼저 두는 사람이 유리하므로 이렇게 보정합니다.",
    "탈락자는 항상 생존자 아래입니다. 탈락자끼리는 더 늦게 탈락한 쪽이 위입니다.",
], 1):
    story.append(Paragraph(f"{i}.  {t}", S_NUM))

# ---------------------------------------------------------------------------
# 9. 카드 목록
# ---------------------------------------------------------------------------
add_heading("9. 카드 목록")
story.append(Paragraph(
    "거리는 모두 육각 거리(6방향 1칸)로 잽니다. \"-\" 는 해당 없음을 뜻합니다.", S_BODY))

story.append(Paragraph("9.1 코어 (덱에 없음, 시작 시 자동 배치)", S_H2))
core_head = [ph("이름"), ph("비용"), ph("시야"), ph("체력"), ph("공격"), ph("사거리"), ph("생산"), ph("점수")]
core_rows = [core_head, [p("코어", S_CELL_NAME), pc("-"), pc("1"), pc("20"), pc("0"), pc("-"), pc("1"), pc("0")]]
story.append(data_table(core_rows, [22 * mm] + [None] * 7))

story.append(Paragraph("9.2 기본 덱 (22장, 전원 동일)", S_H2))
story.append(Paragraph("게임을 시작하면 누구나 이 22장을 똑같이 갖습니다.", S_CAPTION))
base_head = [ph("이름"), ph("종류"), ph("비용"), ph("시야"), ph("체력"), ph("공격"), ph("사거리"), ph("생산"), ph("점수"), ph("장수"), ph("비고")]
base_data = [
    ("채굴기", "건물", "2", "1", "4", "0", "-", "+1", "2", "4", "경제의 기본"),
    ("전초기지", "건물", "3", "2", "6", "0", "-", "0", "3", "3", "시야·영토 확장"),
    ("방어탑", "건물", "4", "1", "6", "2", "2", "0", "2", "2", "고정 방어"),
    ("정찰 드론", "유닛", "1", "2", "2", "1", "1", "-", "1", "3", "값싼 시야 확장"),
    ("전투기", "유닛", "3", "1", "4", "2", "1", "-", "1", "3", "근접 압박"),
    ("포격함", "유닛", "4", "1", "3", "3", "3", "-", "1", "2", "긴 사거리, 낮은 체력"),
    ("순양함", "유닛", "5", "1", "7", "3", "2", "-", "2", "1", "중견 전력"),
    ("유성우", "마법(즉발)", "3", "-", "-", "피해 3, 반경 1", "-", "-", "0", "1", "범위 피해"),
    ("차폐막", "마법(즉발)", "2", "-", "-", "회복 3, 반경 1", "-", "-", "0", "1", "범위 회복"),
    ("에너지 결정", "마법(즉발)", "0", "-", "-", "에너지 +3", "-", "-", "0", "2", "초반 경제 보조"),
]
base_rows = [base_head] + [
    [p(n, S_CELL_NAME), pc(k), pc(c), pc(s), pc(h), pc(a), pc(r), pc(pr), pc(sc), pc(cp), p(note)]
    for (n, k, c, s, h, a, r, pr, sc, cp, note) in base_data
]
base_widths = [20 * mm, 14 * mm, 9 * mm, 9 * mm, 9 * mm, 18 * mm, 13 * mm, 11 * mm, 9 * mm, 9 * mm, None]
story.append(data_table(base_rows, base_widths))

story.append(PageBreak())
story.append(Paragraph("9.3 특수 카드 (덱 빌딩에서 종류별로 1장씩 선택)", S_H2))
story.append(Paragraph("게임 시작 전 건물·유닛·마법에서 각각 1장을 골라 나만의 덱에 더합니다.", S_CAPTION))
special_head = [ph("이름"), ph("종류"), ph("비용"), ph("시야"), ph("체력"), ph("공격"), ph("사거리"), ph("생산"), ph("점수"), ph("키워드 / 효과")]
special_data = [
    ("정제소", "건물", "5", "1", "5", "0", "-", "+3", "4", "-"),
    ("관측소", "건물", "4", "3", "4", "0", "-", "0", "3", "넓은 시야"),
    ("요새", "건물", "6", "2", "12", "2", "2", "0", "5", "-"),
    ("전함", "유닛", "8", "2", "12", "4", "2", "-", "3", "-"),
    ("스텔스함", "유닛", "5", "1", "4", "3", "1", "-", "1", "침투: 적 마커 거리 1 이내에도 배치 가능"),
    ("수리 드론", "유닛", "3", "1", "2", "0", "-", "-", "1", "정비: 내 턴 시작 시 반경 1 아군 체력 +1"),
    ("중력파", "마법(즉발)", "5", "-", "-", "피해 2, 반경 2", "-", "-", "0", "-"),
    ("워프 게이트", "마법(지속 3턴)", "3", "3", "2", "0", "-", "-", "0", "시야 3 제공, 파괴 가능. 소유자 턴마다 남은 턴 -1"),
    ("에너지 폭풍", "마법(즉발)", "2", "-", "-", "에너지 +6", "-", "-", "0", "-"),
]
special_rows = [special_head] + [
    [p(n, S_CELL_NAME), pc(k), pc(c), pc(s), pc(h), pc(a), pc(r), pc(pr), pc(sc), p(kw)]
    for (n, k, c, s, h, a, r, pr, sc, kw) in special_data
]
special_widths = [20 * mm, 20 * mm, 9 * mm, 9 * mm, 9 * mm, 18 * mm, 13 * mm, 11 * mm, 9 * mm, None]
story.append(data_table(special_rows, special_widths))
story.append(Paragraph(
    "키워드 — <b>침투</b>: 적 마커 거리 1 이내에도 배치할 수 있습니다. "
    "<b>정비</b>: 내 턴 시작 시(전투 직후) 반경 1 안의 아군 체력을 1 회복시킵니다. 자기 자신도 포함되고, 여러 개가 있으면 중첩됩니다.",
    S_BODY))

# ---------------------------------------------------------------------------
# 10. 맵
# ---------------------------------------------------------------------------
story.append(PageBreak())
add_heading("10. 맵 (6개)")
story.append(Paragraph(
    "기호 — <font face=\"Courier\">.</font> 빈 우주  "
    "<font face=\"Courier\">#</font> 소행성  "
    "<font face=\"Courier\">o</font> 광맥  "
    "숫자는 그 좌석의 코어입니다. 왼쪽이 x=0, 위쪽이 y=0 입니다.", S_BODY))

MAPS = [
    ("10.1 쌍성", "2인 · 11×11 · 20라운드",
     "코어: 좌석0 (3,2), 좌석1 (8,8). 광맥 (5,5), (1,4), (6,10). 소행성 없음. 좌석별 조건(배치 가능 칸·광맥 거리·경계 여유)이 완전히 같다.",
     """. . . . . . . . . . .
. . . . . . . . . . .
. . . 0 . . . . . . .
. . . . . . . . . . .
. o . . . . . . . . .
. . . . . o . . . . .
. . . . . . . . . . .
. . . . . . . . . . .
. . . . . . . . 1 . .
. . . . . . . . . . .
. . . . . . o . . . ."""),
    ("10.2 소행성대", "2인 · 13×13 · 20라운드",
     "코어: 좌석0 (1,6), 좌석1 (11,6). 중앙 장벽(육각 점대칭 10칸). 광맥 (1,3)(11,3)(0,9)(10,9). 좌석별 조건이 완전히 같다.",
     """. . . . . . # . . . . . .
. . . . . . # . . . . . .
. . . . . . . # . . . . .
. o . . . . # . . . . o .
. . . . . . # . . . . . .
. . . . . . . . . . . . .
. 0 . . . . . . . . . 1 .
. . . . . . . . . . . . .
. . . . . . # . . . . . .
o . . . . # . . . . o . .
. . . . . # . . . . . . .
. . . . . # . . . . . . .
. . . . . . # . . . . . ."""),
    ("10.3 삼각 성운", "3인 · 13×13 · 18라운드",
     "코어: 좌석0 (4,2), 좌석1 (10,6), 좌석2 (4,10). 광맥 (1,2)(7,6)(1,10)(6,6, 중심). 소행성 없음. 중심 120° 회전 완전 대칭(정사각과 달리 3인도 완전 대칭이라 후공 보정이 필요 없다).",
     """. . . . . . . . . . . . .
. . . . . . . . . . . . .
. o . . 0 . . . . . . . .
. . . . . . . . . . . . .
. . . . . . . . . . . . .
. . . . . . . . . . . . .
. . . . . . o o . . 1 . .
. . . . . . . . . . . . .
. . . . . . . . . . . . .
. . . . . . . . . . . . .
. o . . 2 . . . . . . . .
. . . . . . . . . . . . .
. . . . . . . . . . . . ."""),
    ("10.4 성간 항로", "3인 · 15×15 · 18라운드",
     "코어: 좌석0 (5,2), 좌석1 (12,7), 좌석2 (5,12). 중앙에서 세 갈래로 뻗은 소행성 살(120° 회전 대칭). 광맥 (2,3)(10,8)(2,13).",
     """. . . . . . . . . . . . . . .
. . . . . . . . . . . . . . .
. . . . . 0 . . . . . . . . .
. . o . . . . . . . . . . . .
. . . . . . # . . . . . . . .
. . . . . . # . . . . . . . .
. . . . . . . # . . . . . . .
. . . . . . . . # # # . 1 . .
. . . . . . . # . . o . . . .
. . . . . . # . . . . . . . .
. . . . . . # . . . . . . . .
. . . . . . . . . . . . . . .
. . . . . 2 . . . . . . . . .
. . o . . . . . . . . . . . .
. . . . . . . . . . . . . . ."""),
    ("10.5 사분면", "4인 · 15×15 · 16라운드",
     "코어: 좌석0 (4,3), 좌석1 (10,3), 좌석2 (4,11), 좌석3 (10,11). 중앙 육각 고리 소행성 + 중심 광맥. 광맥 (7,2)(13,2)(7,10)(13,10). 육각은 90° 완전 대칭이 없어 좌표 계산으로 4좌석 거리 프로필을 동일하게 맞췄다.",
     """. . . . . . . . . . . . . . .
. . . . . . . . . . . . . . .
. . . . . . . o . . . . . o .
. . . . 0 . . . . . 1 . . . .
. . . . . . . . . . . . . . .
. . . . . . . . . . . . . . .
. . . . . . . # # . . . . . .
. . . . . . # o # . . . . . .
. . . . . . . # # . . . . . .
. . . . . . . . . . . . . . .
. . . . . . . o . . . . . o .
. . . . 2 . . . . . 3 . . . .
. . . . . . . . . . . . . . .
. . . . . . . . . . . . . . .
. . . . . . . . . . . . . . ."""),
    ("10.6 사건의 지평선", "4인 · 15×15 · 16라운드",
     "코어: 좌석0 (4,2), 좌석1 (11,2), 좌석2 (4,12), 좌석3 (11,12). 중앙 소행성 덩어리(반경 1 육각, 7칸). 광맥 (1,3)(8,3)(1,13)(8,13). 육각은 90° 완전 대칭이 없어 좌표 계산으로 4좌석 거리 프로필을 동일하게 맞췄다.",
     """. . . . . . . . . . . . . . .
. . . . . . . . . . . . . . .
. . . . 0 . . . . . . 1 . . .
. o . . . . . . o . . . . . .
. . . . . . . . . . . . . . .
. . . . . . . . . . . . . . .
. . . . . . # # . . . . . . .
. . . . . . # # # . . . . . .
. . . . . . . # # . . . . . .
. . . . . . . . . . . . . . .
. . . . . . . . . . . . . . .
. . . . . . . . . . . . . . .
. . . . 2 . . . . . . 3 . . .
. o . . . . . . o . . . . . .
. . . . . . . . . . . . . . ."""),
]

for i, (name, meta, desc, grid) in enumerate(MAPS):
    block = [
        Paragraph(name, S_MAP_TITLE),
        Paragraph(meta, S_MAP_META),
        Paragraph(desc, S_BODY_TIGHT),
        Spacer(1, 3),
        Table([[Preformatted(grid, S_MONO)]], colWidths=[None],
              style=TableStyle([
                  ("BACKGROUND", (0, 0), (-1, -1), SURFACE),
                  ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#c7d2e0")),
                  ("LEFTPADDING", (0, 0), (-1, -1), 8),
                  ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                  ("TOPPADDING", (0, 0), (-1, -1), 6),
                  ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
              ])),
    ]
    story.append(KeepTogether(block))
    story.append(Spacer(1, 4))

# ---------------------------------------------------------------------------
# 11. 용어 정리
# ---------------------------------------------------------------------------
story.append(PageBreak())
add_heading("11. 용어 정리")
glossary = [
    ("마커", "보드에 놓이는 것의 통칭. 유닛·건물·마법 세 종류가 있고, 칸 하나에 마커 하나만 놓입니다."),
    ("코어", "각 플레이어의 시작 지점 마커. 게임 시작 시 맵이 정한 위치에 자동으로 놓입니다. 파괴되면 탈락합니다."),
    ("카드", "마커 한 종류에 대응하는 손패 항목. 카드를 내면 그 마커가 보드에 놓입니다."),
    ("비용", "마커를 놓기 위해 지불하는 에너지의 양입니다."),
    ("시야", "마커에서 몇 칸 거리까지 다른 마커를 놓을 수 있는지를 나타냅니다. 거리는 육각 거리입니다."),
    ("시야 영역", "내 모든 마커의 시야를 합친 칸의 집합. 배치 가능 범위이자 영토 판정의 근거입니다."),
    ("영토", "한 플레이어의 시야 영역에만 속한 칸. 칸 하나당 1점입니다."),
    ("점수", "영토 점수와 마커 점수를 더한 값. 순위와 승자를 정하는 기준입니다."),
    ("에너지", "게임의 단일 자원. 턴 시작 시 수입만큼 늘고, 마커를 놓을 때 비용만큼 줄어듭니다."),
    ("수입", "턴 시작 시 얻는 에너지. 코어 기본 수입과 내 건물 생산의 합입니다."),
    ("손패 / 덱", "손패는 지금 낼 수 있는 카드(최대 5장), 덱은 아직 뽑지 않은 카드입니다."),
]
gloss_rows = [[ph("용어"), ph("뜻")]] + [[p(k, S_CELL_NAME), p(v)] for k, v in glossary]
story.append(data_table(gloss_rows, [26 * mm, None]))

# ---------------------------------------------------------------------------
# 12. 부록: 상수 요약표
# ---------------------------------------------------------------------------
story.append(Spacer(1, 10))
add_heading("12. 부록: 상수 요약표")
const_rows = [
    [ph("항목"), ph("값"), ph("비고")],
    [p("시작 에너지", S_CELL_NAME), pc("5"), p("-")],
    [p("코어 기본 수입", S_CELL_NAME), pc("1 / 턴"), p("건물이 하나도 없어도 굶지 않도록")],
    [p("코어 체력 / 시야", S_CELL_NAME), pc("20 / 1"), p("-")],
    [p("초기 손패", S_CELL_NAME), pc("4장"), p("-")],
    [p("손패 상한", S_CELL_NAME), pc("5장"), p("상한이면 드로우를 생략합니다")],
    [p("턴당 드로우", S_CELL_NAME), pc("1장"), p("-")],
    [p("덱 구성", S_CELL_NAME), pc("기본 22 + 특수 3"), p("총 25장")],
    [p("라운드 제한", S_CELL_NAME), pc("2인 20 / 3인 18 / 4인 16"), p("맵마다 정해집니다")],
    [p("광맥 건물 보너스", S_CELL_NAME), pc("생산 +1"), p("-")],
    [p("영토 1칸", S_CELL_NAME), pc("1점"), p("-")],
    [p("동점 처리", S_CELL_NAME), pc("좌석 번호 큰 쪽 승"), p("덤은 없습니다")],
]
story.append(data_table(const_rows, [34 * mm, 34 * mm, None]))
story.append(Spacer(1, 14))
story.append(Paragraph("즐거운 대국 되세요!", ParagraphStyle(
    "closing", parent=S_LEAD, alignment=TA_CENTER, textColor=DEEP, fontName="Malgun-Bold", fontSize=13)))

# ---------------------------------------------------------------------------
# 빌드 (TOC 페이지 번호 해석을 위해 2회 빌드)
# ---------------------------------------------------------------------------
doc.multiBuild(story)
print("done:", OUT)
