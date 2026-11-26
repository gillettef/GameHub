"""submission/rulebook.md → 공모전 제출용 규칙서 HTML/PDF.

사용(게임 폴더에서):
  node submission/tools/build-figures.mjs   # 그림 먼저
  python submission/build_rulebook.py
출력: submission/out/냥냥골목_규칙서.html, .pdf (Chrome headless)

규칙의 정본은 notes/Rules.md(엔진 기준, 식물 테마)다. rulebook.md 는 같은 규칙을 고양이 테마로 다시 쓴 제출용 원고다.
"""
import re
import subprocess
import sys
from pathlib import Path

import markdown

SUB = Path(__file__).resolve().parent
FIG = SUB / "figures"
OUT = SUB / "out"
CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]
TITLE = "냥냥 골목"

CSS = """
@page { size: A4; margin: 14mm 15mm 15mm; }
:root { --ink:#2b2117; --accent:#c0692f; --soft:#fff3e2; --line:#e6cfae; }
html { font-family: 'Malgun Gothic','Apple SD Gothic Neo',sans-serif; color: var(--ink); }
body { margin: 0; font-size: 10pt; line-height: 1.55; }
h1 { font-size: 26pt; text-align:center; color: var(--accent); margin: 2mm 0 1mm; letter-spacing: .05em; }
h1 + p { text-align:center; font-size: 11pt; margin: 0 0 3mm; }
h2 { font-size: 14pt; color: var(--accent); border-bottom: 2px solid var(--line); padding-bottom: 1mm; margin: 6mm 0 2.5mm; break-after: avoid; }
h3 { font-size: 12pt; margin: 4.5mm 0 1.5mm; break-after: avoid; color:#7a3f14; }
h4 { font-size: 10.5pt; margin: 3.5mm 0 1mm; break-after: avoid; }
p { margin: 1.1mm 0; }
ul, ol { margin: 1.2mm 0 1.2mm 4mm; padding-left: 4mm; }
li { margin: .5mm 0; }
table { border-collapse: collapse; margin: 2mm 0; width: 100%; break-inside: avoid; }
th, td { border: 1px solid var(--line); padding: 1.2mm 2.2mm; text-align: left; font-size: 9.5pt; vertical-align: top; }
th { background: var(--soft); }
blockquote { margin: 2mm 0; padding: 1.8mm 3.5mm; background: var(--soft); border-left: 3px solid var(--accent); break-inside: avoid; }
blockquote p { margin: .4mm 0; }
hr { display: none; }
.fig { text-align:center; margin: 2.5mm 0; break-inside: avoid; }
.fig svg { max-width: 100%; height: auto; }
.fig .cap { font-size: 8.5pt; color:#7a6a55; margin-top: .5mm; }
.fig.cover svg { width: 150mm; }
.fig.components svg { width: 175mm; }
.fig.terrain svg { width: 120mm; }
.fig.setup svg { width: 165mm; }
.fig.where svg { width: 80mm; }
.fig.tile-read svg { width: 140mm; }
.fig.example svg, .fig.short svg { width: 165mm; }
.fig.spots svg { width: 150mm; }
.fig.goals svg { width: 175mm; }
strong { color: #6a3410; }
.foot { margin-top: 6mm; font-size: 8.5pt; color:#7a6a55; text-align:center; }
"""

CAPTIONS = {
    "cover": "",
    "components": "그림 1. 구성물",
    "terrain": "그림 2. 지형 4종과 아지트",
    "setup": "그림 3. 처음 배치 (아지트 둘레 6칸에 고양이 1마리씩)",
    "where": "그림 4. 치즈냥이 명당을 놓을 수 있는 칸(○)과 없는 칸(×)",
    "tile-read": "그림 5. 타일을 돌려 놓으면 고양이가 모이는 칸(점선)도 함께 돈다",
    "example": "그림 6. 고양이 모이기 예시",
    "short": "그림 7. 쉬는 고양이가 모자랄 때",
    "spots": "그림 8. 명당 9종",
    "goals": "그림 9. 소문 카드 16장 (초록 띠 = 단골 카드)",
}


def figure(name: str) -> str:
    svg = (FIG / f"{name}.svg").read_text(encoding="utf-8")
    cap = CAPTIONS.get(name, "")
    cap_html = f'<div class="cap">{cap}</div>' if cap else ""
    return f'<div class="fig {name}">{svg}{cap_html}</div>'


def main() -> None:
    md = (SUB / "rulebook.md").read_text(encoding="utf-8")
    md = re.sub(r"\{\{fig:([\w-]+)\}\}", lambda m: "\n\n@@FIG:" + m.group(1) + "@@\n\n", md)
    body = markdown.markdown(md, extensions=["tables"])
    body = re.sub(r"<p>@@FIG:([\w-]+)@@</p>", lambda m: figure(m.group(1)), body)
    html = f"""<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>{TITLE} 규칙서</title><style>{CSS}</style></head><body>
{body}
<div class="foot">{TITLE} 규칙서 · 2027 코리아보드게임즈 보드게임 공모전 응모작</div>
</body></html>"""
    OUT.mkdir(exist_ok=True)
    out_html = OUT / f"{TITLE.replace(' ', '')}_규칙서.html"
    out_html.write_text(html, encoding="utf-8")
    chrome = next((c for c in CHROME_CANDIDATES if Path(c).exists()), None)
    if not chrome:
        sys.exit("Chrome/Edge를 찾지 못했다. HTML만 만들었다.")
    out_pdf = out_html.with_suffix(".pdf")
    subprocess.run([chrome, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--print-to-pdf={out_pdf}", out_html.as_uri()],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("saved", out_pdf)


if __name__ == "__main__":
    main()
