"""rules/rulebook.md → 공모전 제출용 규칙서 HTML/PDF.

사용: python submission/build_rulebook.py
출력: submission/LASTGRAIN_규칙서.html, submission/LASTGRAIN_규칙서.pdf (Chrome headless)
룰의 단일 기준은 rules/rulebook.md다. 이 스크립트는 제출용 표기만 바꾼다.
- 내부 작업 메모(작성 규칙·가안 안내, 파일 경로 참조)를 뺀다.
- 텍스트 보드 그림을 도판으로 바꾸고, 뒤집기 장에 그림을 넣는다.
"""
import re
import subprocess
import sys
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parent.parent
SUB = ROOT / "submission"
FIG = SUB / "figures"
CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]


def transform(md: str) -> str:
    version = re.search(r"초안 (v[\d.]+)", md).group(1)
    md = re.sub(r"^# .*$", "# LASTGRAIN 규칙서", md, count=1, flags=re.M)
    md = re.sub(r"^> 작성 규칙은.*\n", "", md, flags=re.M)
    md = re.sub(r"^> 수치\(.*\n", "", md, flags=re.M)
    md = md.replace("자세한 사양은 `components/components.md`를 따른다.\n", "")
    md = md.replace("> 이 변형은 밸런스 검증 대상이 아니다.", "> 이 변형은 선택 규칙이다.")
    board = (FIG / "fig3-layout.svg").read_text(encoding="utf-8")
    md = re.sub(r"```\n\s+A\s+B.*?```", f'<div class="fig board">{board}</div>', md, flags=re.S)
    flip = (FIG / "fig2-flip.svg").read_text(encoding="utf-8")
    md = md.replace("보드 위 모래병의 뒤집기는 샘에서 뒤집기와 강제 뒤집기 두 가지뿐이다.",
                    f'<div class="fig">{flip}</div>\n\n보드 위 모래병의 뒤집기는 샘에서 뒤집기와 강제 뒤집기 두 가지뿐이다.')
    return md, version


CSS = """
@page { size: A4; margin: 16mm 17mm 18mm; }
:root { --ink:#2b2117; --accent:#8a5a2b; --soft:#f7efe0; --line:#dcc9a6; }
html { font-family: 'NanumBarunGothic','NanumGothic','Malgun Gothic',sans-serif; color: var(--ink); }
body { margin: 0; font-size: 10.5pt; line-height: 1.55; }
.cover { text-align:center; padding: 6mm 0 4mm; border-bottom: 2px solid var(--accent); margin-bottom: 6mm; }
.cover .t { font-size: 30pt; font-weight: 800; letter-spacing: .12em; color: var(--accent); }
.cover .s { font-size: 12pt; margin-top: 2mm; }
.cover .m { font-size: 10pt; color:#6b5a45; margin-top: 2mm; }
h1 { display:none; }
h2 { font-size: 15pt; color: var(--accent); border-bottom: 1.5px solid var(--line); padding-bottom: 1mm; margin: 7mm 0 3mm; break-after: avoid; }
h3 { font-size: 12pt; margin: 5mm 0 2mm; break-after: avoid; }
h4 { font-size: 11pt; margin: 4mm 0 1.5mm; break-after: avoid; }
p { margin: 1.2mm 0; }
ul, ol { margin: 1.5mm 0 1.5mm 5mm; padding-left: 4mm; }
li { margin: .6mm 0; }
table { border-collapse: collapse; margin: 2.5mm 0; width: 100%; break-inside: avoid; }
th, td { border: 1px solid var(--line); padding: 1.4mm 2.5mm; text-align: left; font-size: 10pt; }
th { background: var(--soft); }
blockquote { margin: 2.5mm 0; padding: 2mm 3.5mm; background: var(--soft); border-left: 3px solid var(--accent); break-inside: avoid; }
blockquote p { margin: .5mm 0; }
.fig { text-align:center; margin: 3mm 0; break-inside: avoid; }
.fig svg { max-width: 100%; height: auto; }
.board svg { width: 120mm; }
strong { color: #4a2f14; }
code { font-family: inherit; }
.foot { margin-top: 8mm; font-size: 9pt; color:#7a6a55; text-align:center; }
"""


def main():
    md, version = transform((ROOT / "rules" / "rulebook.md").read_text(encoding="utf-8"))
    body = markdown.markdown(md, extensions=["tables"])
    body = body.replace("<p>&gt; 예시:", "<p><strong>예시</strong>")
    body = body.replace("<p>예시:", "<p><strong>예시:</strong>")
    html = f"""<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>LASTGRAIN 규칙서</title><style>{CSS}</style></head><body>
<div class="cover"><div class="t">LASTGRAIN</div>
<div class="s">라스트그레인 — 모래가 다하기 전에</div>
<div class="m">2인 · 20~30분 · 실물 모래시계 전술 게임 · 규칙서 {version}</div></div>
{body}
<div class="foot">LASTGRAIN 규칙서 {version}</div>
</body></html>"""
    out_html = SUB / "LASTGRAIN_규칙서.html"
    out_html.write_text(html, encoding="utf-8")
    chrome = next((c for c in CHROME_CANDIDATES if Path(c).exists()), None)
    if not chrome:
        sys.exit("Chrome/Edge를 찾지 못했다. HTML만 만들었다.")
    out_pdf = SUB / "LASTGRAIN_규칙서.pdf"
    subprocess.run([chrome, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--print-to-pdf={out_pdf}", out_html.as_uri()],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("saved", out_pdf.name)


if __name__ == "__main__":
    main()
