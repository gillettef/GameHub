"""proposal.md를 공모전 기획안 양식(docx)에 채운다.
실행: python submission/tools/fill_proposal.py
결과: submission/out/SIGHTLINE_기획안.docx
"""
import os
import re
import docx
import docx.enum.table
from docx.shared import Pt, Cm
from docx.oxml.ns import qn

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
FORM = os.path.join(ROOT, "forms", "공모전기획안 양식.docx")
SRC = os.path.join(ROOT, "proposal.md")
OUT = os.path.join(ROOT, "out", "SIGHTLINE_기획안.docx")
FONT = "맑은 고딕"


def parse(md):
    sec, cur = {}, None
    for line in open(md, encoding="utf-8"):
        line = line.rstrip("\n")
        if line.startswith("## "):
            cur = line[3:].strip()
            sec[cur] = []
        elif cur and not line.startswith(">"):
            sec[cur].append(line)
    return {k: "\n".join(v).strip() for k, v in sec.items()}


def set_font(run, size):
    run.font.size = Pt(size)
    run.font.name = FONT
    run._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)


def add_rich(par, text, size):
    for part in re.split(r"(\*\*[^*]+\*\*)", text):
        if not part:
            continue
        bold = part.startswith("**")
        r = par.add_run(part[2:-2] if bold else part)
        r.bold = bold
        set_font(r, size)


def fill_cell(cell, text, size=9, align=None):
    for p in list(cell.paragraphs)[1:]:
        p._element.getparent().remove(p._element)
    first = cell.paragraphs[0]
    for r in list(first.runs):
        r._element.getparent().remove(r._element)
    lines = [l for l in text.split("\n") if l.strip()]
    for i, line in enumerate(lines):
        par = first if i == 0 else cell.add_paragraph()
        pf = par.paragraph_format
        pf.space_before = Pt(0)
        pf.space_after = Pt(1)
        pf.line_spacing = 1.1
        if align is not None:
            par.alignment = align
        if line.startswith("- "):
            pf.left_indent = Cm(0.3)
            pf.first_line_indent = Cm(-0.3)
            add_rich(par, "· " + line[2:], size)
        else:
            add_rich(par, line, size)


def main():
    s = parse(SRC)
    d = docx.Document(FORM)
    t0, t1, t2 = d.tables
    # 기본 정보: 제목·작가명은 2~3열이 병합된 칸
    fill_cell(t0.rows[0].cells[1], s["게임 제목"], 11)
    author = s["작가명"]
    fill_cell(t0.rows[1].cells[1], "" if author.startswith("(") else author, 10)
    fill_cell(t0.rows[3].cells[0], s["플레이 시간"], 9.5, 1)
    fill_cell(t0.rows[3].cells[1], s["플레이 인원"], 9.5, 1)
    fill_cell(t0.rows[3].cells[2], s["주요 메커니즘"], 9, 1)
    keys = ["테마 소개", "게임 요약", "특장점 및 다른 게임과의 차별점", "기획 의도"]
    sizes = [8.5, 8, 8, 8.5]
    for row, k, sz in zip(t1.rows, keys, sizes):
        fill_cell(row.cells[1], s[k], sz)
        # 양식의 고정 최소 높이(4.1cm) 대신 내용에 맞춰 줄어들게 한다
        row.height = Cm(2.4)
        row.height_rule = docx.enum.table.WD_ROW_HEIGHT_RULE.AT_LEAST
    # 사진 표는 2쪽에서 시작한다
    prev = t2._element.getprevious()
    if prev is not None and prev.tag == qn("w:p"):
        from docx.text.paragraph import Paragraph
        from docx.enum.text import WD_BREAK
        Paragraph(prev, d._body).add_run().add_break(WD_BREAK.PAGE)
    # 사진
    cell = t2.rows[1].cells[0]
    for p in list(cell.paragraphs)[1:]:
        p._element.getparent().remove(p._element)
    first = True
    widths = [Cm(11.8), Cm(15.2)]
    for (line, w) in zip([l for l in s["사진"].split("\n") if l.startswith("- ")], widths):
        path, cap = [x.strip() for x in line[2:].split("|", 1)]
        par = cell.paragraphs[0] if first else cell.add_paragraph()
        first = False
        par.alignment = 1
        par.add_run().add_picture(os.path.join(ROOT, path), width=w)
        cp = cell.add_paragraph()
        cp.alignment = 1
        cp.paragraph_format.space_after = Pt(6)
        add_rich(cp, cap, 8)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    d.save(OUT)
    print("saved", OUT)


if __name__ == "__main__":
    main()
