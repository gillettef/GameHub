"""공모전 기획안 양식(docx)에 docs/submission/proposal.md 내용을 채운다.

사용: python -I scripts/fill_proposal.py <양식 docx 경로> [출력 경로]
- 양식 파일은 공모전 공고 첨부 '공모전기획안 양식.docx'를 쓴다(저장소에는 넣지 않는다).
- 작가명 칸은 비워 둔다. 제출 전에 직접 적는다.
"""
import re
import sys
from pathlib import Path

import docx
from docx.shared import Pt, Cm
from docx.enum.text import WD_LINE_SPACING
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'docs' / 'submission' / 'proposal.md'
IMG = ROOT / 'docs' / 'submission' / 'fold-diagram.png'


def parse(md: str):
    info = {}
    for row in re.findall(r'^\| ([^|]+) \| ([^|]+) \|$', md, re.M):
        info[row[0].strip()] = row[1].strip()
    sections = {}
    for title, body in re.findall(r'^## (.+?)\n(.*?)(?=^## |\Z)', md, re.M | re.S):
        sections[title.strip()] = body.strip()
    return info, sections


def plain(text: str) -> str:
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'`(.+?)`', r'\1', text)
    return text


def write_cell(cell, text: str, size=8):
    cell.text = ''
    lines = [l for l in text.split('\n') if l.strip()]
    first = True
    for line in lines:
        p = cell.paragraphs[0] if first else cell.add_paragraph()
        first = False
        line = plain(line.strip())
        line = re.sub(r'^- ', '· ', line)
        p.paragraph_format.space_after = Pt(1)
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY
        p.paragraph_format.line_spacing = Pt(size + 2.5)
        snap = OxmlElement('w:snapToGrid')
        snap.set(qn('w:val'), '0')
        p._p.get_or_add_pPr().append(snap)
        run = p.add_run(line)
        run.font.size = Pt(size)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    template = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'docs' / 'submission' / 'CREASE-기획안.docx'
    info, sec = parse(SRC.read_text(encoding='utf-8'))
    d = docx.Document(str(template))
    t0, t1, t2 = d.tables
    write_cell(t0.cell(0, 1), info['게임 제목'], 10)
    write_cell(t0.cell(1, 1), '', 10)
    write_cell(t0.cell(3, 0), info['플레이 시간'], 9)
    write_cell(t0.cell(3, 1), info['플레이 인원'], 9)
    write_cell(t0.cell(3, 2), info['주요 메커니즘'], 8.5)
    write_cell(t1.cell(0, 1), sec['테마 소개'])
    write_cell(t1.cell(1, 1), sec['게임 요약'])
    write_cell(t1.cell(2, 1), sec['특장점 및 다른 게임과의 차별점'])
    write_cell(t1.cell(3, 1), sec['기획 의도'])
    cell = t2.cell(1, 0)
    cell.text = ''
    cell.paragraphs[0].add_run().add_picture(str(IMG), width=Cm(15.5))
    cap = cell.add_paragraph()
    r = cap.add_run('그림 1. 펼친 보드 / 왼쪽 3선으로 접기 / 양쪽 2선 접기. 푸른 칸은 넘어간 날개의 뒷면, 금색 선은 이음(새로 이웃하는 곳).')
    r.font.size = Pt(8)
    d.save(str(out))
    print(out)


if __name__ == '__main__':
    main()
