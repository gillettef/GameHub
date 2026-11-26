"""공식 기획안 양식(forms/공모전기획안_양식.docx)에 「냥냥 골목」 내용을 채운다.

사용(게임 폴더에서, 그림 PNG 를 먼저 만든다):
  node submission/tools/svg2png.mjs table2 table3
  python submission/build_plan.py
출력: submission/out/냥냥골목_기획안.docx

양식 표 구조: 표0 = 게임 제목 / 작가명 / (플레이 시간·인원·주요 메커니즘), 표1 = 테마 소개·게임 요약·특장점·기획 의도,
표2 = [필수] 게임 진행 모습 사진. 작가명은 개인 정보라 비워 둔다(직접 적는다). A4 2쪽 이내여야 한다.
"""
from pathlib import Path

import docx
from docx.enum.table import WD_ROW_HEIGHT_RULE
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Mm, Pt

SUB = Path(__file__).resolve().parent
OUT = SUB / "out"

TITLE = "냥냥 골목"
INFO = {
    "time": "20~25분\n(2인 15~20분)",
    "players": "2~3인\n10세 이상",
    "mech": "영역 다툼(1:1 쫓아내기), 육각 타일 놓기·돌리기, 공개 2장 드래프트",
}

SECTIONS = [
    (
        "테마 소개",
        [
            "오래된 골목의 치즈냥·턱시도냥·고등어냥 무리가 평상, 종이 상자, 지붕, 캣맘 급식소 같은 명당을 두고 벌이는 영역 다툼입니다. 고양이는 남의 자리에 비집고 들어가 **한 마리가 한 마리를 쫓아내고**, 명당은 누가 찾았든 **마지막에 그 자리를 지키는 무리의 것**입니다.",
        ],
    ),
    (
        "게임 요약",
        [
            "차례마다 ① 펼친 명당 타일 2개 중 1개나 주머니에서 1개를 가져와 ② 손의 2개 중 1개를 내 영역(또는 맞닿은 빈 칸)에 원하는 방향으로 돌려 놓고 ③ 타일에 그려진 수만큼 그 칸과 주변 칸에 고양이를 앉힙니다. 남의 고양이가 있으면 1마리가 1마리를 쫓아냅니다.",
            "무리는 16~18마리뿐이라 모자라면 가장 붐비는 내 칸에서 데려옵니다. 쉬는 고양이가 가장 많은 무리가 다음 라운드에 먼저 둡니다. 2인 12차례·3인 10차례 뒤 **내 칸 1칸당 1점 + 소문 카드 3장**으로 승부합니다.",
        ],
    ),
    (
        "특장점 및 다른 게임과의 차별점",
        [
            "**한 칸 한 색, 1:1 쫓아내기**: 다수결 영역 게임처럼 칸마다 수를 세어 비교하지 않습니다. 색만 보면 주인이 보이고 한 수로 판이 뒤집힙니다.",
            "**주인 없는 명당**: 놓으면 끝나는 확장 게임과 달리, 남이 놓은 명당도 고양이로 차지하면 내 점수입니다.",
            "**한정된 고양이**: 넓게 펼칠수록 얇아지고, 덜 펼친 무리가 먼저 두어 저절로 따라잡기가 됩니다.",
            "**검증**: 웹으로 구현해 봇 8종의 수천 판 대전으로 수치를 맞췄습니다(자리별 승률이 공정값에서 2인 4%p·3인 1%p 이내).",
        ],
    ),
    (
        "기획 의도",
        [
            "한 문장(\"한 마리가 한 마리를 쫓아낸다\")으로 설명되지만 매 차례 어느 타일을, 어느 칸에, 어느 방향으로 놓을지 고민하는 20분 전략 게임입니다. 능력 있는 명당은 9종 중 4종, 능력은 한 줄씩이라 처음 하는 사람도 바로 즐깁니다. 친근한 동네 고양이로 가족과 입문자가 함께하는 게임을 목표로 했습니다.",
        ],
    ),
]


def set_cell(cell, paragraphs, size=8.5, bold_all=False, align=None):
    """셀 내용을 문단 목록으로 바꾼다. **굵게** 표시를 지원한다."""
    cell.text = ""
    first = True
    for text in paragraphs:
        p = cell.paragraphs[0] if first else cell.add_paragraph()
        first = False
        p.paragraph_format.space_after = Pt(1.5)
        p.paragraph_format.line_spacing = 1.12
        if align is not None:
            p.alignment = align
        parts = text.split("**")
        for i, part in enumerate(parts):
            if not part:
                continue
            run = p.add_run(part)
            run.font.size = Pt(size)
            run.bold = bold_all or i % 2 == 1


def main() -> None:
    d = docx.Document(SUB / "forms" / "공모전기획안_양식.docx")
    t0, t1, t2 = d.tables
    set_cell(t0.rows[0].cells[1], [TITLE], size=12, bold_all=True)
    # 작가명(팀 대표자명) 칸은 비워 둔다
    set_cell(t0.rows[3].cells[0], INFO["time"].split("\n"), size=9, align=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell(t0.rows[3].cells[1], INFO["players"].split("\n"), size=9, align=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell(t0.rows[3].cells[2], [INFO["mech"]], size=9)
    # 양식의 칸 최소 높이(각 4.1cm)로는 1쪽을 넘친다. 글 길이에 맞춰 최소 높이만 줄인다(항목·표 구성은 그대로)
    for row, (_, paras), h in zip(t1.rows, SECTIONS, (24, 38, 50, 26)):
        set_cell(row.cells[1], paras)
        row.height = Mm(h)
        row.height_rule = WD_ROW_HEIGHT_RULE.AT_LEAST
    cell = t2.rows[1].cells[0]
    cell.text = ""
    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run().add_picture(str(OUT / "table2.png"), width=Mm(132))
    cap = cell.add_paragraph()
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = cap.add_run("2인 게임 중반 (치즈냥·턱시도냥, 14차례 진행)")
    r.font.size = Pt(8)
    p2 = cell.add_paragraph()
    p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p2.add_run().add_picture(str(OUT / "table3.png"), width=Mm(132))
    cap2 = cell.add_paragraph()
    cap2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r2 = cap2.add_run("3인 게임 중반 — 실물 부품(골목 조각·명당 타일·고양이 토큰·소문 카드)을 그린 그림")
    r2.font.size = Pt(8)
    OUT.mkdir(exist_ok=True)
    out = OUT / f"{TITLE.replace(' ', '')}_기획안.docx"
    d.save(out)
    print("saved", out)


if __name__ == "__main__":
    main()
