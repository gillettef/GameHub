"""rules/rulebook.md → 그림이 들어간 공모전 제출용 규칙서 PDF.

사용법: python rules/build_pdf.py
산출물: contest/HEARSAY_규칙서.html, contest/HEARSAY_규칙서.pdf
룰북 본문에 `<!-- fig:이름 -->` 주석을 두면 그 자리에 아래 FIGURES의 그림이 들어간다.
룰의 기준은 항상 rulebook.md이며, 이 스크립트는 모양만 바꾼다.
"""
import io
import pathlib
import re
import shutil
import subprocess
import sys

import markdown

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "rules" / "rulebook.md"
OUT_HTML = ROOT / "contest" / "HEARSAY_규칙서.html"
OUT_PDF = ROOT / "contest" / "HEARSAY_규칙서.pdf"

C = {
    "red": "#c8473b", "blue": "#3b67b5", "yellow": "#e2b230", "green": "#3f8f57",
    "grey": "#9a9a9a", "ink": "#2a2622", "paper": "#fbf7ef", "line": "#8a7f70", "dim": "#e9e2d4",
}


def svg(w, h, body):
    return f'<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" font-family="Noto Sans KR, Malgun Gothic, sans-serif">{body}</svg>'


def fig_flow():
    boxes = [("1계절", "점유"), ("2~7계절", "점유 → 망각 → 회의"), ("마지막 회의", "7계절 망각 → 질문")]
    x, out = 10, []
    widths = [150, 260, 220]
    for (t, d), w in zip(boxes, widths):
        out.append(f'<rect x="{x}" y="10" width="{w}" height="62" rx="10" fill="{C["paper"]}" stroke="{C["line"]}"/>')
        out.append(f'<text x="{x + w / 2}" y="36" text-anchor="middle" font-size="17" font-weight="700" fill="{C["ink"]}">{t}</text>')
        out.append(f'<text x="{x + w / 2}" y="59" text-anchor="middle" font-size="14" fill="{C["ink"]}">{d}</text>')
        x += w
        if t != "마지막 회의":
            out.append(f'<path d="M{x + 6} 41 l18 0 m-7 -7 l7 7 l-7 7" stroke="{C["ink"]}" fill="none" stroke-width="2"/>')
            x += 32
    return svg(x + 10, 82, "".join(out))


def fig_board():
    plots = ["강가", "포구", "소금밭", "북쪽 언덕", "대숲"]
    cw, ch, lx, ty = 70, 40, 100, 44
    cols = 7
    out = []
    # 열 상태: 1~2 망각(기록 표지 일부), 3 보임(직전), 4 이번 계절, 5~7 아직
    tiles3 = {0: "blue", 2: "green", 3: "red", 4: "yellow"}
    tiles4 = {0: "yellow", 1: "red", 4: "blue"}
    chron = {(0, 1): "green", (1, 3): "grey"}
    for c in range(cols):
        x = lx + c * cw
        fill = C["dim"] if c < 2 else C["paper"]
        out.append(f'<rect x="{x}" y="{ty}" width="{cw}" height="{ch * len(plots)}" fill="{fill}" stroke="none"/>')
        out.append(f'<text x="{x + cw / 2}" y="{ty - 10}" text-anchor="middle" font-size="13" fill="{C["ink"]}">{c + 1}계절</text>')
    for r, p in enumerate(plots):
        y = ty + r * ch
        out.append(f'<text x="{lx - 10}" y="{y + ch / 2 + 5}" text-anchor="end" font-size="14" font-weight="700" fill="{C["ink"]}">{p}</text>')
        for c in range(cols):
            x = lx + c * cw
            out.append(f'<rect x="{x}" y="{y}" width="{cw}" height="{ch}" fill="none" stroke="{C["line"]}"/>')
            col = None
            if c == 2:
                col = tiles3.get(r)
            elif c == 3:
                col = tiles4.get(r)
            if col:
                out.append(f'<rect x="{x + cw / 2 - 14}" y="{y + 6}" width="28" height="28" fill="{C[col]}" stroke="#555"/>')
            cm = chron.get((r, c))
            if cm:
                out.append(f'<circle cx="{x + cw / 2}" cy="{y + ch / 2}" r="13" fill="{C[cm]}" stroke="#555"/><circle cx="{x + cw / 2}" cy="{y + ch / 2}" r="5" fill="#fff"/>')
    by = ty + ch * len(plots) + 22
    labels = [(0, 2, "망각된 계절 (땅 타일 없음, 기록 표지만)"), (2, 1, "직전 계절"), (3, 1, "이번 계절"), (4, 3, "아직 오지 않은 계절")]
    for c0, n, t in labels:
        x0, x1 = lx + c0 * cw + 4, lx + (c0 + n) * cw - 4
        out.append(f'<path d="M{x0} {by - 8} L{x0} {by} L{x1} {by} L{x1} {by - 8}" fill="none" stroke="{C["ink"]}"/>')
        out.append(f'<text x="{(x0 + x1) / 2}" y="{by + 18}" text-anchor="middle" font-size="12" fill="{C["ink"]}">{t}</text>')
    return svg(lx + cols * cw + 20, by + 30, "".join(out))


def fig_claim():
    picks = [("빨강", "red", "강가"), ("파랑", "blue", "강가"), ("노랑", "yellow", "포구"), ("초록", "green", "대숲")]
    out = []
    for i, (n, col, p) in enumerate(picks):
        x = 20 + i * 130
        out.append(f'<rect x="{x}" y="10" width="96" height="134" rx="8" fill="{C["paper"]}" stroke="{C[col]}" stroke-width="8"/>')
        out.append(f'<text x="{x + 48}" y="84" text-anchor="middle" font-size="20" font-weight="700" fill="{C["ink"]}">{p}</text>')
        out.append(f'<text x="{x + 48}" y="168" text-anchor="middle" font-size="14" fill="{C["ink"]}">{n}</text>')
        res = "다툼 → 주머니" if p == "강가" else f"{p}에 땅 타일"
        color = C["red"] if p == "강가" else C["green"]
        out.append(f'<text x="{x + 48}" y="190" text-anchor="middle" font-size="13" font-weight="700" fill="{color}">{res}</text>')
    return svg(540, 200, "".join(out))


def fig_testimony():
    votes = [("노랑(질문자)", "green"), ("파랑", "green"), ("빨강", "blue"), ("초록", "yellow")]
    out = []
    for i, (n, col) in enumerate(votes):
        x = 30 + i * 125
        out.append(f'<ellipse cx="{x + 45}" cy="60" rx="44" ry="34" fill="#f1d9c0" stroke="#a08060"/>')
        out.append(f'<circle cx="{x + 45}" cy="58" r="16" fill="{C[col]}" stroke="#555"/>')
        out.append(f'<text x="{x + 45}" y="118" text-anchor="middle" font-size="13" fill="{C["ink"]}">{n}</text>')
    out.append(f'<text x="270" y="152" text-anchor="middle" font-size="15" font-weight="700" fill="{C["ink"]}">초록 2 · 파랑 1 · 노랑 1 → 공식 역사는 초록</text>')
    out.append(f'<text x="270" y="174" text-anchor="middle" font-size="12" fill="{C["ink"]}">초록은 자기 색 토큰이 없어 초록을 증언할 수 없다</text>')
    return svg(540, 184, "".join(out))


FIGURES = {"flow": fig_flow, "board": fig_board, "claim": fig_claim, "testimony": fig_testimony}

CSS = """
@page { size: A4; margin: 16mm 15mm 18mm; @bottom-center { content: counter(page); } }
body { font-family: "Noto Sans KR", "Malgun Gothic", sans-serif; color: #2a2622; font-size: 10.3pt; line-height: 1.62; }
h1 { font-size: 26pt; letter-spacing: 3px; margin: 0 0 2mm; border-bottom: 3px solid #2a2622; padding-bottom: 2mm; }
h1 + blockquote { display: none; }
h2 { font-size: 15pt; margin: 8mm 0 2mm; padding: 1.2mm 3mm; background: #2a2622; color: #fbf7ef; border-radius: 2mm; break-after: avoid; }
h3 { font-size: 12pt; margin: 5mm 0 1.5mm; border-left: 4px solid #c8473b; padding-left: 2.5mm; break-after: avoid; }
p { margin: 1.2mm 0; }
ol, ul { margin: 1mm 0 1mm 0; padding-left: 6mm; }
li { margin: 0.4mm 0; }
table { border-collapse: collapse; margin: 2mm 0; width: 100%; break-inside: avoid; }
th, td { border: 1px solid #b9ae9c; padding: 1.2mm 2mm; font-size: 9.5pt; text-align: left; vertical-align: top; }
th { background: #efe6d4; }
blockquote { margin: 2.5mm 0; padding: 2mm 3.5mm; background: #fbf7ef; border-left: 4px solid #3b67b5; border-radius: 1mm; break-inside: avoid; }
blockquote p { margin: 0.8mm 0; }
strong { color: #000; }
figure { margin: 3mm 0; text-align: center; break-inside: avoid; }
figure svg { max-width: 100%; height: auto; }
figcaption { font-size: 8.5pt; color: #666; }
.cover { text-align: center; padding: 50mm 0 0; break-after: page; }
.cover .t { font-size: 46pt; font-weight: 800; letter-spacing: 8px; }
.cover .k { font-size: 18pt; margin-top: 2mm; }
.cover .m { margin-top: 12mm; font-size: 13pt; }
.cover .q { margin: 26mm auto 0; max-width: 120mm; font-size: 12pt; line-height: 1.9; color: #444; }
"""

CAPTIONS = {
    "flow": "게임 흐름",
    "board": "섬 보드 예시: 4계절 점유 단계. 1·2계절은 망각되어 공식 역사(기록 표지)만 남았다.",
    "claim": "점유 단계 예시: 빨강과 파랑이 강가에서 다툼을 일으켰다.",
    "testimony": "증언 공개 예시 (8장 진행 예시의 첫 질문)",
}


def build_html():
    md = SRC.read_text(encoding="utf-8")
    md = re.sub(r"^> 작성 규칙은.*\n", "", md, flags=re.M)
    version = re.search(r"\(초안 (v[\d.]+)\)", md)
    md = re.sub(r"^# HEARSAY 룰북 \(초안 v[\d.]+\)", "# HEARSAY 규칙서", md, count=1, flags=re.M)
    body = markdown.markdown(md, extensions=["tables", "sane_lists"])

    def put_fig(m):
        name = m.group(1)
        return f'<figure>{FIGURES[name]()}<figcaption>{CAPTIONS.get(name, "")}</figcaption></figure>'

    body = re.sub(r"<!-- fig:(\w+) -->", put_fig, body)
    cover = f"""<div class="cover"><div class="t">HEARSAY</div><div class="k">히어세이</div>
<div class="m">4~6인 · 45~60분 · 12세 이상</div>
<div class="q">이 섬마을에는 글자가 없다.<br>지난 일은 오직 서로의 입으로만 전해진다.<br>그리고 누구도 자기 집안의 일을<br>스스로 증언할 수 없다.</div>
<div class="m" style="font-size:10pt;color:#888">규칙서 {version.group(1) if version else ''}</div></div>"""
    html = f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>HEARSAY 규칙서</title><style>{CSS}</style></head><body>{cover}{body}</body></html>'
    OUT_HTML.parent.mkdir(exist_ok=True)
    OUT_HTML.write_text(html, encoding="utf-8")


def find_browser():
    for p in [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        shutil.which("chrome"), shutil.which("google-chrome"), shutil.which("chromium"),
    ]:
        if p and pathlib.Path(p).exists():
            return p
    return None


def build_pdf():
    br = find_browser()
    if not br:
        print("Chrome/Edge를 찾지 못해 HTML만 만들었습니다:", OUT_HTML)
        return
    subprocess.run([br, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--print-to-pdf={OUT_PDF}", OUT_HTML.as_uri()], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("PDF:", OUT_PDF)


if __name__ == "__main__":
    build_html()
    if "--html-only" not in sys.argv:
        build_pdf()
