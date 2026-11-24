"""rules/rulebook.md를 제출용 규칙서(docx, pdf)로 만든다.
실행: python submission/tools/build_rulebook.py
결과: submission/out/SIGHTLINE_규칙서.docx (+ LibreOffice가 있으면 .pdf)

- 그림 1(ASCII 설계도)은 figures/layout_A.png로 바꿔 넣는다.
- 지원하는 문법: #~### 제목, 문단, -/숫자 목록(들여쓰기 한 단계), 표, ``` 코드 블록, > 인용(예시 상자), **굵게**, `코드`.
"""
import os
import re
import subprocess
import docx
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC = os.path.join(ROOT, "rules", "rulebook.md")
OUTDIR = os.path.join(ROOT, "submission", "out")
OUT = os.path.join(OUTDIR, "SIGHTLINE_규칙서.docx")
FIG = os.path.join(ROOT, "submission", "figures")
FONT = "맑은 고딕"
MONO = "D2Coding" if os.path.exists("C:/Windows/Fonts/D2Coding.ttf") else "Consolas"
SOFFICE = "C:/Program Files/LibreOffice/program/soffice.exe"


def fonts(run, size=None, name=FONT, bold=None, color=None):
    run.font.name = name
    rpr = run._element.get_or_add_rPr()
    rf = rpr.find(qn("w:rFonts"))
    if rf is None:
        rf = OxmlElement("w:rFonts")
        rpr.append(rf)
    rf.set(qn("w:eastAsia"), FONT if name == MONO else name)
    if size:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if color:
        run.font.color.rgb = RGBColor.from_string(color)


def rich(par, text, size=10):
    for part in re.split(r"(\*\*[^*]+\*\*|`[^`]+`)", text):
        if not part:
            continue
        if part.startswith("**"):
            fonts(par.add_run(part[2:-2]), size, bold=True)
        elif part.startswith("`"):
            fonts(par.add_run(part[1:-1]), size - 0.5, name=MONO)
        else:
            fonts(par.add_run(part), size)


def shade(cell_or_par, fill):
    el = cell_or_par._element
    if el.tag == qn("w:tc"):
        pr = el.get_or_add_tcPr()
    else:
        pr = el.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    pr.append(shd)


def para_border_left(par, color="B8902A"):
    ppr = par._element.get_or_add_pPr()
    bdr = OxmlElement("w:pBdr")
    left = OxmlElement("w:left")
    left.set(qn("w:val"), "single")
    left.set(qn("w:sz"), "18")
    left.set(qn("w:space"), "6")
    left.set(qn("w:color"), color)
    bdr.append(left)
    ppr.append(bdr)


def spacing(par, before=0, after=3, line=1.15):
    pf = par.paragraph_format
    pf.space_before = Pt(before)
    pf.space_after = Pt(after)
    pf.line_spacing = line


def add_table(d, rows):
    cells = [[c.strip() for c in r.strip().strip("|").split("|")] for r in rows]
    header, body = cells[0], [r for r in cells[2:]]
    t = d.add_table(rows=1 + len(body), cols=len(header))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, row in enumerate([header] + body):
        for j, txt in enumerate(row[:len(header)]):
            c = t.rows[i].cells[j]
            p = c.paragraphs[0]
            spacing(p, 1, 1, 1.05)
            rich(p, txt.replace("\\|", "|"), 9)
            if i == 0:
                for r in p.runs:
                    r.bold = True
                shade(c, "E9E2D0")
    d.add_paragraph()


def build():
    lines = open(SRC, encoding="utf-8").read().split("\n")
    d = docx.Document()
    sec = d.sections[0]
    sec.page_width, sec.page_height = Cm(21), Cm(29.7)
    sec.left_margin = sec.right_margin = Cm(2.2)
    sec.top_margin = sec.bottom_margin = Cm(2.0)
    st = d.styles["Normal"]
    st.font.name = FONT
    st.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    st.font.size = Pt(10)
    # 쪽 번호
    fp = sec.footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for kind, txt in (("begin", None), (None, "PAGE"), ("end", None)):
        r = fp.add_run()
        if kind:
            fc = OxmlElement("w:fldChar")
            fc.set(qn("w:fldCharType"), kind)
            r._element.append(fc)
        else:
            it = OxmlElement("w:instrText")
            it.text = txt
            r._element.append(it)
        fonts(r, 9)

    i = 0
    in_fig1 = False
    while i < len(lines):
        line = lines[i]
        s = line.strip()
        if s.startswith("**그림 1."):
            p = d.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.add_run().add_picture(os.path.join(FIG, "layout_A.png"), width=Cm(12.5))
            c = d.add_paragraph()
            c.alignment = WD_ALIGN_PARAGRAPH.CENTER
            rich(c, "**그림 1. 정원 설계도 A** — 초록 막대: 생울타리, 가운데: 정자, 노란 칸: 접선 지점, 칸 안의 화살표: 시작 칸 방향", 9)
            in_fig1 = True
            i += 1
            continue
        if s.startswith("```"):
            j = i + 1
            block = []
            while j < len(lines) and not lines[j].strip().startswith("```"):
                block.append(lines[j])
                j += 1
            i = j + 1
            if in_fig1:  # ASCII 그림 1과 바로 뒤 범례 표는 이미지로 대체
                in_fig1 = False
                while i < len(lines) and not lines[i].strip():
                    i += 1
                while i < len(lines) and lines[i].strip().startswith("|"):
                    i += 1
                continue
            p = d.add_paragraph()
            spacing(p, 2, 6, 1.0)
            shade(p, "F4F1EA")
            for k, bl in enumerate(block):
                r = p.add_run(bl)
                fonts(r, 8.5, name=MONO)
                if k < len(block) - 1:
                    r.add_break()
            continue
        if s.startswith("| ") and i + 1 < len(lines) and re.match(r"^\s*\|[-| :]+\|\s*$", lines[i + 1]):
            j = i
            rows = []
            while j < len(lines) and lines[j].strip().startswith("|"):
                rows.append(lines[j])
                j += 1
            add_table(d, rows)
            i = j
            continue
        if s.startswith("# "):
            p = d.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            spacing(p, 0, 10)
            fonts(p.add_run("SIGHTLINE"), 26, bold=True, color="3F6B35")
            p2 = d.add_paragraph()
            p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
            fonts(p2.add_run("사이트라인 — 가면무도회의 시선 · 규칙서"), 13, color="5A5246")
            spacing(p2, 0, 12)
        elif s.startswith("## "):
            p = d.add_paragraph()
            spacing(p, 14, 6)
            fonts(p.add_run(s[3:]), 15, bold=True, color="3F6B35")
        elif s.startswith("### "):
            p = d.add_paragraph()
            spacing(p, 8, 3)
            fonts(p.add_run(s[4:]), 12, bold=True, color="5A5246")
        elif s == "---":
            pass
        elif s.startswith(">"):
            j = i
            quote = []
            while j < len(lines) and lines[j].strip().startswith(">"):
                quote.append(lines[j].strip()[1:].strip())
                j += 1
            i = j
            for k, q in enumerate(quote):
                p = d.add_paragraph()
                spacing(p, 4 if k == 0 else 0, 4 if k == len(quote) - 1 else 0, 1.15)
                p.paragraph_format.left_indent = Cm(0.4)
                shade(p, "FBF6E6")
                para_border_left(p)
                rich(p, q, 9.5)
            continue
        elif re.match(r"^\s*(-|\d+\.)\s", line):
            indent = (len(line) - len(line.lstrip())) // 2
            m = re.match(r"^\s*(-|\d+\.)\s+(.*)$", line)
            mark, body = m.group(1), m.group(2)
            p = d.add_paragraph()
            spacing(p, 0, 2)
            base = 0.6 + 0.6 * min(indent, 2)
            p.paragraph_format.left_indent = Cm(base)
            p.paragraph_format.first_line_indent = Cm(-0.5)
            rich(p, ("• " if mark == "-" else mark + " ") + body, 10)
        elif s:
            buf = [s]
            j = i + 1
            while j < len(lines):
                n = lines[j].strip()
                if not n or n.startswith(("#", ">", "|", "```", "- ", "**그림")) or re.match(r"^\d+\.\s", n) or n == "---":
                    break
                buf.append(n)
                j += 1
            p = d.add_paragraph()
            spacing(p, 0, 5)
            rich(p, " ".join(buf), 10)
            i = j
            continue
        i += 1

    os.makedirs(OUTDIR, exist_ok=True)
    d.save(OUT)
    print("saved", OUT)
    if os.path.exists(SOFFICE):
        subprocess.run([SOFFICE, "--headless", "--convert-to", "pdf", "--outdir", OUTDIR, OUT],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        print("pdf", os.path.exists(OUT[:-5] + ".pdf"))


if __name__ == "__main__":
    build()
