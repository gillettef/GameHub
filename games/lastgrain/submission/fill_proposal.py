"""공식 기획안 양식(forms/공모전기획안 양식.docx)에 LASTGRAIN 기획안을 채운다.

사용: python submission/fill_proposal.py [작가명]
출력: submission/LASTGRAIN_기획안.docx
본문 원문은 submission/proposal.md. 칸 높이가 고정이라 여기 문장은 압축본이다.
"""
import sys
from pathlib import Path

import docx
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Cm, Pt

HERE = Path(__file__).resolve().parent
TEMPLATE = HERE / "forms" / "공모전기획안 양식.docx"
OUT = HERE / "LASTGRAIN_기획안.docx"
AUTHOR = sys.argv[1] if len(sys.argv) > 1 else ""
SIZE = Pt(10)

THEME = ("끝없는 사막에서 두 모래술사가 모래로 병사를 빚어 고대 유적을 다툰다. "
         "병사의 몸에 박힌 작은 모래시계의 마지막 모래알이 떨어지면, 병사는 다시 모래로 무너진다. "
         "사막의 샘에 닿은 병사만이 모래시계를 뒤집어 흘러간 시간을 되돌릴 수 있다.")

SUMMARY = [
    "말마다 꽂힌 실물 모래시계(1·2·3분)의 남은 모래가 곧 체력이자 수명이다.",
    "내 차례에만 내 모래가 흐른다. 오래 고민할수록 내 군대만 줄어든다.",
    "차례마다 병사 1개를 소환하고, 병사마다 이동이나 공격을 1번 한다.",
    "공격은 강제 뒤집기(가득 찬 적을 시한부로) 또는 밀어내기(장외는 소멸).",
    "차례 시작 시 내 병사가 선 유적마다 1점. 25점 선취 또는 20분 종료 시 고득점 승리.",
]

FEATURES = [
    ("체력 = 모래.", " 토큰 없이 실물이 상태를 보여 주어 판이 한눈에 읽힌다."),
    ("고민이 곧 비용.", " 말이 곧 시계라 외부 타이머가 필요 없다. 상대 차례에 생각하고 내 차례엔 빠르게 움직인다."),
    ("양날의 뒤집기.", " 같은 조작이 회복도 치명상도 된다."),
    ("물리가 처리하는 규칙.", " 계산·기록 없음. 시판 모래시계 11개로 제작한다."),
]

INTENT = ("전략 게임의 장고는 보통 별도 타이머로 막지만, 게임 밖의 규칙이라 긴장보다 피로를 준다. "
          "LASTGRAIN은 모래시계를 말의 생명으로 삼아 고민하는 시간 자체를 내 군대의 손실로 만들었고, "
          "‘뒤집으면 시간이 역전된다’는 성질을 핵심 판단으로 삼았다. "
          "직관으로 읽히지만 할수록 ‘언제 뒤집을까’의 깊이가 드러나는 20~30분 2인 결투를 지향한다.")


def fmt(p, align=None):
    pf = p.paragraph_format
    pf.space_before = Pt(0)
    pf.space_after = Pt(1)
    pf.line_spacing = 1.08
    if align is not None:
        p.alignment = align


def run(p, text, bold=False):
    r = p.add_run(text)
    r.font.size = SIZE
    r.bold = bold
    return r


def clear(cell):
    first = cell.paragraphs[0]
    for p in cell.paragraphs[1:]:
        p._element.getparent().remove(p._element)
    for r in list(first.runs):
        r._element.getparent().remove(r._element)
    return first


def set_text(cell, text, align=WD_ALIGN_PARAGRAPH.CENTER):
    p = clear(cell)
    fmt(p, align)
    run(p, text)


def set_lines(cell, items, marker):
    p = clear(cell)
    for i, item in enumerate(items):
        if i:
            p = cell.add_paragraph()
        fmt(p, WD_ALIGN_PARAGRAPH.LEFT)
        p.paragraph_format.left_indent = Cm(0.35)
        p.paragraph_format.first_line_indent = Cm(-0.35)
        m = marker(i)
        if isinstance(item, tuple):
            run(p, m + item[0], bold=True)
            run(p, item[1])
        else:
            run(p, m + item)


def main():
    d = docx.Document(str(TEMPLATE))
    t0, t1, t2 = d.tables

    set_text(t0.cell(0, 1), "LASTGRAIN (라스트그레인)")
    set_text(t0.cell(1, 1), AUTHOR)
    set_text(t0.cell(3, 0), "20~30분")
    set_text(t0.cell(3, 1), "2인")
    set_text(t0.cell(3, 2), "실물 모래시계 수명 관리(실시간), 격자 전술, 영역 점령")

    set_text(t1.cell(0, 1), THEME, WD_ALIGN_PARAGRAPH.LEFT)
    set_lines(t1.cell(1, 1), SUMMARY, lambda i: "• ")
    set_lines(t1.cell(2, 1), FEATURES, lambda i: "①②③④"[i] + " ")
    set_text(t1.cell(3, 1), INTENT, WD_ALIGN_PARAGRAPH.LEFT)

    cell = t2.cell(1, 0)
    p = clear(cell)
    fmt(p, WD_ALIGN_PARAGRAPH.CENTER)
    p.paragraph_format.space_before = Pt(6)
    p.add_run().add_picture(str(HERE / "figures" / "fig1-board.png"), width=Cm(15.0))
    c = cell.add_paragraph()
    fmt(c, WD_ALIGN_PARAGRAPH.CENTER)
    run(c, "그림 1. 선 플레이어의 차례: 세운 내 모래시계만 흐르고, 상대 모래시계는 눕혀져 멈춰 있다.")
    p2 = cell.add_paragraph()
    fmt(p2, WD_ALIGN_PARAGRAPH.CENTER)
    p2.paragraph_format.space_before = Pt(10)
    p2.add_run().add_picture(str(HERE / "figures" / "fig2-flip.png"), width=Cm(15.0))
    c2 = cell.add_paragraph()
    fmt(c2, WD_ALIGN_PARAGRAPH.CENTER)
    run(c2, "그림 2. 핵심 조작 세 가지: 샘에서 뒤집기, 강제 뒤집기, 밀어내기.")
    n = cell.add_paragraph()
    fmt(n, WD_ALIGN_PARAGRAPH.CENTER)
    n.paragraph_format.space_before = Pt(8)
    r = run(n, "※ 실물 프로토타입 제작 전, 탁자 위 구성물 배치를 그린 그림입니다.")
    r.font.size = Pt(9)

    d.save(str(OUT))
    print("saved", OUT)


if __name__ == "__main__":
    main()
